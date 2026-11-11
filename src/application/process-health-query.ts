// Caso de uso: processar pergunta de saúde (orchestrator MCP).
// Pipeline: localização → KB → (IA opcional) → geocodificação → Overpass →
//          fallback Nominatim → priorização por tipo da triagem.

import {
  matchKnowledgeBase,
  type HealthKnowledgeEntry,
} from "@/domain/health-kb";
import { prioritizeByType } from "@/domain/facility-classifier";
import {
  extractCep,
  isPureCep,
  looksLikeLocationOnly,
} from "@/domain/location-parser";
import type {
  Facility,
  LocationPrecision,
  MCPToolCall,
  ProcessResponse,
  TriageResult,
  ViaCepInfo,
} from "@/domain/types";
import { MIN_PROCESS_RADIUS_KM, MAX_PROCESS_RADIUS_KM } from "@/domain/validation";
import { hasGeminiApiKey, classifyTriageWithAI } from "@/infrastructure/gemini";
import { geocodeAddress, searchAmenitiesNear } from "@/infrastructure/nominatim";
import { fetchOverpassElements, mapElementsToFacilities } from "@/infrastructure/overpass";

const DEFAULT_LAT = parseFloat(process.env.DEFAULT_LAT || "-3.1019");
const DEFAULT_LNG = parseFloat(process.env.DEFAULT_LNG || "-60.0250");
/** Raio padrão do fluxo principal: limite superior da faixa de produto (1–10 km). */
const DEFAULT_RADIUS_KM = 10;

const MAX_LIST_RESULTS = 10;
const MAX_MAP_RESULTS = 30;

const LOCATION_ONLY_TRIAGE: TriageResult = {
  level: "leve",
  facility_type: "ubs",
  recommendation:
    "Consulta de localização: abaixo estão as unidades de saúde ordenadas por proximidade. Descreva seus sintomas para uma triagem clínica.",
  explanation:
    "Nenhuma queixa clínica foi descrita — o texto informado foi interpretado como endereço/CEP. O tipo de unidade prioritário não foi determinado por protocolo.",
  warning_signs: [],
  latency_ms: 0,
};

function conservativeFallback(): TriageResult {
  return {
    level: "moderado",
    facility_type: "upa",
    recommendation:
      "Não foi possível classificar automaticamente seu sintoma. Por segurança, recomendamos buscar uma UPA para avaliação presencial.",
    explanation:
      "Sua descrição não correspondeu a nenhum padrão conhecido da base de triagem. Sem classificação por IA disponível, indicamos o nível conservador (UPA).",
    warning_signs: [],
    latency_ms: 0,
  };
}

function triageFromKB(entry: HealthKnowledgeEntry, latencyMs: number): TriageResult {
  return {
    level: entry.level,
    facility_type: entry.facility_type,
    recommendation: entry.guidance,
    explanation: `Baseado em protocolo público: ${entry.source}. A correspondência foi encontrada pela palavra-chave "${entry.keywords[0]}".`,
    warning_signs: entry.warning_signs,
    latency_ms: latencyMs,
  };
}

function clampRadius(km: number | undefined): number {
  if (km === undefined || Number.isNaN(km)) return DEFAULT_RADIUS_KM;
  return Math.min(MAX_PROCESS_RADIUS_KM, Math.max(MIN_PROCESS_RADIUS_KM, km));
}

export async function processHealthQuery(input: {
  message: string;
  location?: string;
  radius_km?: number;
  lat?: number;
  lng?: number;
}): Promise<ProcessResponse> {
  const totalStart = performance.now();
  const mcpCalls: MCPToolCall[] = [];
  const radiusKm = clampRadius(input.radius_km);

  // ═══ Etapa 0: texto da mensagem é só uma localização? (CEP/endereço puro) ═══
  let message = input.message;
  let location = input.location;

  if (!location) {
    if (isPureCep(message)) {
      location = message;
      message = "unidades de saúde próximas";
    } else if (looksLikeLocationOnly(message)) {
      // Heurística conservadora (sem pistas de sintoma): trata como endereço.
      // Ex.: "rua juliaca, 10, cidade nova, 69094-060" colado no campo errado.
      location = message;
      message = "unidades de saúde próximas";
    }
  }

  // ═══ Etapa 1: Triagem (KB primeiro — sem IA, resposta em <1ms) ═══
  let triageStart = performance.now();
  const kbMatch = matchKnowledgeBase(message);
  const kbMs = performance.now() - triageStart;

  let triageResult: TriageResult;

  if (message === "unidades de saúde próximas") {
    // Texto sentinela: a mensagem era só localização — triagem informativa
    triageResult = LOCATION_ONLY_TRIAGE;
    mcpCalls.push({
      tool: "knowledge_base_lookup",
      input: { message: "consulta de localização (sem queixa clínica)" },
      output: { mode: "location_only", level: triageResult.level },
      latency_ms: 0,
    });
  } else if (kbMatch) {
    triageResult = triageFromKB(kbMatch, Math.round(kbMs * 100) / 100);
    mcpCalls.push({
      tool: "knowledge_base_lookup",
      input: { message: message.substring(0, 80), matched_entry: kbMatch.id },
      output: {
        level: kbMatch.level,
        facility_type: kbMatch.facility_type,
        source: kbMatch.source,
      },
      latency_ms: Math.round(kbMs * 100) / 100,
    });
  } else if (hasGeminiApiKey()) {
    try {
      triageStart = performance.now();
      const ai = await classifyTriageWithAI(message);
      const aiMs = performance.now() - triageStart;
      triageResult = { ...ai, latency_ms: Math.round(aiMs * 100) / 100 };
      mcpCalls.push({
        tool: "triage_classify",
        input: { message: message.substring(0, 80), source: "ai" },
        output: { level: ai.level, facility_type: ai.facility_type },
        latency_ms: Math.round(aiMs * 100) / 100,
      });
    } catch {
      triageResult = conservativeFallback();
      mcpCalls.push({
        tool: "triage_classify",
        input: { message: message.substring(0, 80), source: "ai_failed" },
        output: { level: triageResult.level, facility_type: triageResult.facility_type },
        latency_ms: 0,
      });
    }
  } else {
    triageResult = conservativeFallback();
    mcpCalls.push({
      tool: "knowledge_base_lookup",
      input: { message: message.substring(0, 80), matched_entry: null },
      output: { fallback: "conservador_sem_ia" },
      latency_ms: Math.round(kbMs * 100) / 100,
    });
  }

  // ═══ Etapa 2: Geocodificação ═══
  const geoStart = performance.now();
  let resolvedLat = input.lat ?? DEFAULT_LAT;
  let resolvedLng = input.lng ?? DEFAULT_LNG;
  let resolvedAddress = location || "";
  let geocoded = false;
  let geocodePrecision: LocationPrecision | null = null;
  let geocodeViaCep: ViaCepInfo | null = null;
  let geocodeNote: string | null = null;

  if (location && input.lat === undefined && input.lng === undefined) {
    const geo = await geocodeAddress(location);
    if (geo) {
      resolvedLat = geo.lat;
      resolvedLng = geo.lng;
      resolvedAddress = geo.display_name;
      geocodePrecision = geo.precision;
      geocodeViaCep = geo.via_cep ?? null;
      geocodeNote = geo.note ?? null;
      geocoded = true;
    }
  }
  const geoMs = performance.now() - geoStart;

  mcpCalls.push({
    tool: "geocode_address",
    input: { address: location || "coordenadas padrão", radius_km: radiusKm },
    output: {
      lat: resolvedLat,
      lng: resolvedLng,
      display_name: resolvedAddress,
      geocoded,
      precision: geocodePrecision,
      via_cep: geocodeViaCep,
      note: geocodeNote,
    },
    latency_ms: Math.round(geoMs * 100) / 100,
  });

  // ═══ Etapa 3: Busca de unidades (Overpass → fallback Nominatim) ═══
  const searchStart = performance.now();
  let facilities: Facility[] = [];
  let searchFailed = false;
  let provider = "nenhum";

  try {
    const elements = await fetchOverpassElements(resolvedLat, resolvedLng, radiusKm);
    facilities = mapElementsToFacilities(elements, resolvedLat, resolvedLng, radiusKm);
    provider = "overpass";
  } catch {
    // Overpass indisponível (bloqueio de rede, manutenção) → fallback Nominatim
    try {
      facilities = await searchAmenitiesNear(resolvedLat, resolvedLng, radiusKm);
      provider = "nominatim";
    } catch (err) {
      searchFailed = true;
      console.warn("Busca de unidades falhou (Overpass e Nominatim):", err);
    }
  }
  const searchMs = performance.now() - searchStart;

  mcpCalls.push({
    tool: "search_nearby_facilities",
    input: { lat: resolvedLat, lng: resolvedLng, radius_km: radiusKm },
    output: {
      provider,
      facilities_found: facilities.length,
      failed: searchFailed,
    },
    latency_ms: Math.round(searchMs * 100) / 100,
  });

  // ═══ Etapa 4: Priorização por tipo de triagem ═══
  const orderedFacilities = prioritizeByType(facilities, triageResult.facility_type);
  const listFacilities = orderedFacilities.slice(0, MAX_LIST_RESULTS);
  const mapFacilities = orderedFacilities.slice(0, MAX_MAP_RESULTS);

  // ═══ Etapa 5: Montagem da resposta ═══
  const totalMs = performance.now() - totalStart;

  return {
    triage: triageResult,
    facilities: listFacilities,
    map_data: {
      center: { lat: resolvedLat, lng: resolvedLng },
      user_location: { lat: resolvedLat, lng: resolvedLng },
      facilities: mapFacilities,
    },
    latencies: {
      triage_ms: triageResult.latency_ms,
      geocode_ms: Math.round(geoMs * 100) / 100,
      search_ms: Math.round(searchMs * 100) / 100,
      total_ms: Math.round(totalMs * 100) / 100,
    },
    mcp_calls: mcpCalls,
    disclaimer:
      "Este sistema NÃO faz diagnóstico médico. Recomendações são apenas orientativas. Em caso de emergência, ligue 192 (SAMU) ou 190.",
    search_provider: provider,
    search_failed: searchFailed,
    resolved_location: geocoded ? resolvedAddress : null,
    location_precision: geocodePrecision,
    resolved_via_cep: geocodeViaCep,
    location_note: geocodeNote,
  };
}
