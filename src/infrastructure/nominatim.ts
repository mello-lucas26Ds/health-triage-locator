// Cliente Nominatim + ViaCEP — infraestrutura externa.
//
// Cadeia de geocodificação (RF-002b — CEP/endereço/cidade/coords):
//   1. Coordenadas diretas "lat, lng"         (parsing local, sem rede)
//   2. CEP puro      → ViaCEP (base dos Correios) → endereço estruturado → Nominatim
//   3. CEP embutido  (ex: "rua juliaca,10, cidade nova, 69094-060") →
//      texto completo → Nominatim; se falhar, ViaCEP decodifica o CEP e refina
//   4. Texto livre   → normalização de abreviações ("r." → "Rua", "tv" → "Travessa")
//      → Nominatim → tentativas por segmentos (rua+cidade, depois só rua)
//      → ViaCEP reverso (nome da rua → bairro/CEP oficial) → Nominatim
//
// POR QUE NÃO consultamos "q=CEP" direto no Nominatim: medido em produção
// (2025-11), o Nominatim público NÃO indexa postcodes brasileiros —
// `postalcode=69042110` retorna [] e `q=69042-110, Manaus` cai no centróide
// do município. ViaCEP decodifica o CEP para rua/bairro/cidade reais.
//
// TRANSPARÊNCIA DE PRECISÃO (RF-002c): toda resposta carrega `precision`
// (house > street > neighborhood > city > municipal_centroid). Medido em
// Manaus (2025-11): o OSM tem a rua para os CEPs testados, porém NEM SEMPRE
// tem número de porta ("Rua Juliaca 10" cai no nível da rua) e algumas ruas
// oficiais dos Correios nem existem no OSM (Travessa Guairia, CEP 69094-060
// → cai no nível do bairro). A UI exibe esse nível ao usuário.

import { haversineDistance, roundDistance } from "@/domain/geo";
import { classifyFacilityType } from "@/domain/facility-classifier";
import type { Facility, ViaCepInfo, LocationPrecision } from "@/domain/types";
import { createCacheStore, facilityCacheKey, geocodeCacheKey, type CacheStore } from "./cache";

const DEFAULT_BASE_URL = "https://nominatim.openstreetmap.org";
const VIACEP_BASE_URL = "https://viacep.com.br/ws";
const REQUEST_TIMEOUT_MS = 3_500;
const VIACEP_TIMEOUT_MS = 3_000;

const geocodeCache = createCacheStore<GeocodeResult | null>({
  maxEntries: 300,
  defaultTtlMs: 30 * 60 * 1000,
});

export function getGeocodeCache(): CacheStore<GeocodeResult | null> {
  return geocodeCache;
}

export function resetGeocodeCache(): void {
  geocodeCache.clear();
}

const amenityCache = createCacheStore<Facility[]>({
  maxEntries: 100,
  defaultTtlMs: 15 * 60 * 1000,
});

export function getAmenityCache(): CacheStore<Facility[]> {
  return amenityCache;
}

export function resetAmenityCache(): void {
  amenityCache.clear();
}

function baseUrl(): string {
  return process.env.NOMINATIM_BASE_URL || DEFAULT_BASE_URL;
}

function headers(): HeadersInit {
  return {
    "User-Agent": "HealthTriageLocator/1.0",
    "Accept-Language": "pt-BR",
  };
}

const COORDS_RE = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

interface NominatimSearchResult {
  lat: string;
  lon: string;
  display_name?: string;
  addresstype?: string;
}

interface ViaCepResult {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: unknown;
}

export type GeocodeSource = "coords" | "nominatim" | "viacep+nominatim";

export interface GeocodeResult {
  lat: number;
  lng: number;
  display_name: string;
  /** Nível de precisão do ponto resolvido (RF-002c — transparência ao usuário). */
  precision: LocationPrecision;
  /** Caminho que produziu o resultado. */
  source: GeocodeSource;
  /** Dados oficiais do CEP (ViaCEP) quando um CEP entrou no fluxo. */
  via_cep?: ViaCepInfo;
  /** Nota de transparência (rua do CEP sem geometria no OSM; CEP aponta para outra rua…). */
  note?: string;
}

// ════════════════════════════════════════════════════════════════════
// Precisão: addresstype do Nominatim (format=jsonv2) → nível de confiança
// ════════════════════════════════════════════════════════════════════

const HOUSE_ADDRESSTYPES = new Set(["house", "building", "address", "address_point", "apartment"]);
const STREET_ADDRESSTYPES = new Set([
  "residential",
  "tertiary",
  "secondary",
  "primary",
  "trunk",
  "motorway",
  "unclassified",
  "living_street",
  "service",
  "pedestrian",
  "road",
  "footway",
  "cycleway",
  "track",
]);
const HOOD_ADDRESSTYPES = new Set(["neighbourhood", "suburb", "borough", "quarter", "city_district"]);
const CITY_ADDRESSTYPES = new Set(["city", "town", "village", "municipality"]);

/** Mapeia o addresstype do Nominatim para o nível de precisão reportado. */
export function mapAddresstypeToPrecision(addresstype: string | undefined): LocationPrecision {
  const t = (addresstype || "").toLowerCase();
  if (HOUSE_ADDRESSTYPES.has(t)) return "house";
  if (STREET_ADDRESSTYPES.has(t)) return "street";
  if (HOOD_ADDRESSTYPES.has(t)) return "neighborhood";
  if (CITY_ADDRESSTYPES.has(t)) return "city";
  return "municipal_centroid";
}

// ════════════════════════════════════════════════════════════════════
// Normalização de endereços brasileiros (aumenta a taxa de acerto)
// ════════════════════════════════════════════════════════════════════

/** Abreviações comuns — aplicadas com fronteira de palavra, ordem por tamanho. */
const ABBREVIATIONS: ReadonlyArray<readonly [string, string]> = [
  ["tve", "Travessa"],
  ["tv", "Travessa"],
  ["av", "Avenida"],
  ["cj", "Conjunto"],
  ["jd", "Jardim"],
  ["lt", "Loteamento"],
  ["cond", "Condomínio"],
  ["est", "Estrada"],
  ["rod", "Rodovia"],
  ["al", "Alameda"],
  ["pc", "Praça"],
  ["pq", "Parque"],
  ["bl", "Bloco"],
  ["qd", "Quadra"],
  ["vl", "Vila"],
  ["r", "Rua"],
];

/**
 * Normaliza o texto do endereço: hífen Unicode → ASCII, marcadores de número
 * ("nº 10" → "10") e abreviações ("r. juliaca" → "Rua juliaca"). Nominatim é
 * case-insensitive, então mantemos o restante como o usuário digitou.
 */
export function normalizeAddressAbbreviations(raw: string): string {
  let text = raw.trim().replace(/[\u2010-\u2015\u2212]/g, "-");
  text = text.replace(/\bn[ºo°.]?\s*(?=\d)/gi, "");
  for (const [abbr, full] of [...ABBREVIATIONS].sort((a, b) => b[0].length - a[0].length)) {
    text = text.replace(new RegExp(`\\b${abbr}\\.?\\s+`, "gi"), `${full} `);
  }
  return text.replace(/\s{2,}/g, " ").trim();
}

/** Minúsculas sem acentos — para comparação de nomes de rua (CEP × digitado). */
function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** 69042110 → "69042-110" (para notas legíveis). */
export function formatCep(digits: string): string {
  const d = digits.replace(/\D/g, "");
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

const STREET_PHRASE_RE =
  /\b(rua|avenida|travessa|conjunto|jardim|loteamento|alameda|pra[çc]a|rodovia|estrada|beco|vila|setor|quadra|condom[íi]nio)\s+([^,;\n]+?)(?=\s*,|\s*\d|\s*$)/i;

/** Extrai a frase da rua ("Rua Juliaca" de "Rua Juliaca, 10, Cidade Nova"); null se não há. */
export function extractStreetPhrase(text: string): string | null {
  const m = text.match(STREET_PHRASE_RE);
  if (!m) return null;
  const name = m[2].trim();
  if (!name) return null;
  return `${m[1]} ${name}`.trim();
}

/** Candidatos por segmentos para texto livre: "rua, bairro, cidade" → [rua+cidade, rua]. */
export function segmentCandidates(text: string): string[] {
  const segs = text
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segs.length < 2) return [];
  const cands: string[] = [`${segs[0]}, ${segs[segs.length - 1]}`, segs[0]];
  return cands;
}

/**
 * Nota de divergência: o CEP informado pertence oficialmente a outra rua.
 * undefined quando a rua do CEP coincide com o resultado (caso normal).
 */
export function buildCepMismatchNote(
  viaCep: { cep: string; street: string; neighborhood: string },
  displayName: string
): string | undefined {
  const needle = normalizeName(viaCep.street);
  if (!needle) return undefined;
  if (normalizeName(displayName).includes(needle)) return undefined;
  return `Atenção: o CEP ${viaCep.cep} pertence oficialmente a "${viaCep.street}, ${viaCep.neighborhood}", que difere do endereço digitado. A rua digitada foi priorizada por ser mais específica.`;
}

// ════════════════════════════════════════════════════════════════════
// Consultas externas
// ════════════════════════════════════════════════════════════════════

/** Consulta o ViaCEP; null em CEP inexistente, rede caída ou resposta inválida. */
export async function lookupViaCep(cepDigits: string): Promise<{
  street: string;
  neighborhood: string;
  city: string;
  state: string;
} | null> {
  if (!/^\d{8}$/.test(cepDigits)) return null;
  try {
    const resp = await fetch(`${VIACEP_BASE_URL}/${cepDigits}/json/`, {
      headers: { "User-Agent": "HealthTriageLocator/1.0" },
      signal: AbortSignal.timeout(VIACEP_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as ViaCepResult;
    if (!data || typeof data !== "object" || data.erro) return null;
    if (typeof data.localidade !== "string" || typeof data.uf !== "string") return null;
    return {
      street: typeof data.logradouro === "string" ? data.logradouro : "",
      neighborhood: typeof data.bairro === "string" ? data.bairro : "",
      city: data.localidade,
      state: data.uf,
    };
  } catch (err) {
    console.warn("ViaCEP falhou:", err);
    return null;
  }
}

/**
 * Busca REVERSA no ViaCEP: nome da rua → logradouro/bairro/CEP oficiais.
 * Fixtures reais (2025-11): AM/Manaus/Juliaca → CEP 69097-405, bairro Nova Cidade
 * (o usuário costuma digitar "cidade nova" — bairro vizinho; esta busca corrige).
 */
export async function lookupStreetViaCep(
  uf: string,
  city: string,
  street: string
): Promise<ViaCepInfo | null> {
  if (!uf || !city || !street) return null;
  try {
    const url = `${VIACEP_BASE_URL}/${encodeURIComponent(uf.toUpperCase())}/${encodeURIComponent(
      city
    )}/${encodeURIComponent(street)}/json/`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "HealthTriageLocator/1.0" },
      signal: AbortSignal.timeout(VIACEP_TIMEOUT_MS),
    });
    if (!resp.ok) return null;
    const data = (await resp.json()) as ViaCepResult[];
    if (!Array.isArray(data) || data.length === 0) return null;
    const first = data[0];
    if (!first || first.erro) return null;
    return {
      cep: typeof first.cep === "string" ? first.cep : "",
      street: typeof first.logradouro === "string" ? first.logradouro : "",
      neighborhood: typeof first.bairro === "string" ? first.bairro : "",
      city: typeof first.localidade === "string" ? first.localidade : city,
      state: typeof first.uf === "string" ? first.uf : uf,
    };
  } catch (err) {
    console.warn("ViaCEP (busca reversa) falhou:", err);
    return null;
  }
}

/** Queries estruturadas em ordem de precisão decrescente. */
function viaCepStructuredQueries(v: {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}): string[] {
  const parts = [v.street, v.neighborhood, v.city, v.state].filter(Boolean);
  const queries: string[] = [];
  if (v.street) queries.push(parts.join(", "));
  if (v.neighborhood) queries.push([v.neighborhood, v.city, v.state].filter(Boolean).join(", "));
  return queries;
}

/** Note padrão quando a rua oficial do CEP não tem geometria no OSM e caiu no bairro. */
function neighborhoodFallbackNote(viaCep: ViaCepInfo, resolvedName: string): string {
  return `A rua oficial do CEP ("${viaCep.street}") não tem geometria no OpenStreetMap; a localização caiu no nível do bairro — "${resolvedName}". Ponto aproximado.`;
}

async function nominatimSearch(query: string): Promise<GeocodeResult | null> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      "accept-language": "pt-BR",
      countrycodes: "br",
    });
    const email = process.env.NOMINATIM_EMAIL;
    if (email) params.set("email", email);

    const resp = await fetch(`${baseUrl()}/search?${params.toString()}`, {
      headers: headers(),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!resp.ok) return null;

    const data = (await resp.json()) as NominatimSearchResult[];
    if (!Array.isArray(data) || data.length === 0) return null;

    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

    return {
      lat,
      lng,
      display_name: data[0].display_name || query,
      precision: mapAddresstypeToPrecision(data[0].addresstype),
      source: "nominatim",
    };
  } catch (err) {
    console.warn("Nominatim falhou:", err);
    return null;
  }
}

/**
 * Geocodifica um endereço livre (bairro, rua, CEP, cidade ou "lat, lng").
 * Retorna null quando não encontra — o chamador decide o fallback.
 */
async function doGeocodeAddress(address: string): Promise<GeocodeResult | null> {
  // Normaliza sinal de menos Unicode (U+2212 — copiado de READMEs/editores) e
  // travessões para o hífen ASCII antes de qualquer parsing.
  const text = address.trim().replace(/[\u2010-\u2015\u2212]/g, "-");

  // 1. Coordenadas diretas "lat, lng"
  const coords = text.match(COORDS_RE);
  if (coords) {
    const lat = parseFloat(coords[1]);
    const lng = parseFloat(coords[2]);
    if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng, display_name: `${lat}, ${lng}`, precision: "coords_exact", source: "coords" };
    }
  }

  // Consultas já enviadas (evita repetir a mesma query na cadeia de fallbacks).
  const tried = new Set<string>();
  const tryQuery = async (q: string, viaCep?: ViaCepInfo, note?: string): Promise<GeocodeResult | null> => {
    const key = q.toLowerCase();
    if (!q || tried.has(key)) return null;
    tried.add(key);
    const result = await nominatimSearch(q);
    if (!result) return null;
    return {
      ...result,
      // Quando o ViaCEP entra na cadeia, a fonte é composta — transparência no MCP.
      source: viaCep ? "viacep+nominatim" : result.source,
      ...(viaCep ? { via_cep: viaCep } : {}),
      ...(note ? { note } : {}),
    };
  };

  // 2. CEP puro — ViaCEP decodifica para rua/bairro/cidade reais
  if (isPureCepText(text)) {
    const cepDigits = text.replace(/\D/g, "");
    const viaCep = await lookupViaCep(cepDigits);
    if (viaCep) {
      const viaCepInfo: ViaCepInfo = { cep: formatCep(cepDigits), ...viaCep };
      for (const q of viaCepStructuredQueries(viaCep)) {
        const result = await tryQuery(q, viaCepInfo);
        if (!result) continue;
        // A rua oficial do CEP não tem geometria no OSM e a query caiu no bairro?
        if (result.precision !== "street" && result.precision !== "house") {
          return { ...result, note: neighborhoodFallbackNote(viaCepInfo, result.display_name) };
        }
        return result;
      }
    }
    // Último recurso: texto do CEP direto (cai no centróide municipal — impreciso)
    const last = await tryQuery(`${cepDigits}, Brasil`);
    if (last) {
      return {
        ...last,
        precision: "municipal_centroid",
        source: viaCep ? "viacep+nominatim" : "nominatim",
        ...(viaCep ? { via_cep: { cep: formatCep(cepDigits), ...viaCep } } : {}),
        note: viaCep
          ? `A rua oficial do CEP ("${viaCep.street}") não pôde ser geocodificada; usado o centróide municipal — localização imprecisa.`
          : "CEP não indexado pelo serviço de geocodificação; usado o centróide municipal — localização imprecisa.",
      };
    }
    return null;
  }

  const normalized = normalizeAddressAbbreviations(text);
  const cepDigits = extractCepDigits(text);

  // 3. CEP embutido em endereço (ex: "rua juliaca, 10, cidade nova, 69094-060")
  if (cepDigits) {
    // 3a. O texto completo resolve bem no Nominatim (a rua digitada tem prioridade)
    const direct = await tryQuery(normalized);
    if (direct) {
      const viaCep = await lookupViaCep(cepDigits);
      const viaCepInfo: ViaCepInfo | undefined = viaCep
        ? { cep: formatCep(cepDigits), ...viaCep }
        : undefined;
      const note = viaCep && viaCepInfo ? buildCepMismatchNote(viaCepInfo, direct.display_name) : undefined;
      return { ...direct, ...(viaCepInfo ? { via_cep: viaCepInfo } : {}), ...(note ? { note } : {}) };
    }
    // 3b. ViaCEP dá o logradouro oficial do CEP — refina a query
    const viaCep = await lookupViaCep(cepDigits);
    if (viaCep) {
      const viaCepInfo: ViaCepInfo = { cep: formatCep(cepDigits), ...viaCep };
      for (const q of viaCepStructuredQueries(viaCep)) {
        const result = await tryQuery(q, viaCepInfo);
        if (!result) continue;
        if (result.precision !== "street" && result.precision !== "house" && viaCep.street) {
          return { ...result, note: neighborhoodFallbackNote(viaCepInfo, result.display_name) };
        }
        return result;
      }
    }
  }

  // 4. Busca textual (bairro, rua, cidade): texto completo → segmentos
  const full = await tryQuery(normalized);
  if (full) return full;
  for (const candidate of segmentCandidates(normalized)) {
    const result = await tryQuery(candidate);
    if (result) return result;
  }

  // 5. ViaCEP reverso: nome da rua digitada → bairro/CEP oficiais → Nominatim.
  //    Escopo do produto (PRD): Manaus/AM — coordenadas padrão do sistema.
  //    Candidatos: frase com tipo de via ("Rua Juliaca"), frase sem tipo
  //    ("Juliaca" — LIKE do ViaCEP), primeiro segmento do texto ("Juliaca, …").
  const streetPhrase = extractStreetPhrase(normalized);
  const segs = normalized.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  const streetCandidates: string[] = [];
  if (streetPhrase) streetCandidates.push(streetPhrase);
  else if (segs.length > 0 && segs[0].length >= 3) streetCandidates.push(segs[0]);
  const withoutType = streetCandidates[0]?.replace(/^\S+\s+/, "");
  if (withoutType && withoutType.length >= 3 && withoutType !== streetCandidates[0]) {
    streetCandidates.push(withoutType);
  }

  for (const phrase of streetCandidates) {
    const reverse = await lookupStreetViaCep("AM", "Manaus", phrase);
    if (!reverse) continue;
    const viaCepInfo: ViaCepInfo = { ...reverse, cep: reverse.cep || "—" };
    for (const q of viaCepStructuredQueries(reverse)) {
      const result = await tryQuery(q, viaCepInfo);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Geocodifica um endereço livre com cache transparente em memória (TTL 30 min).
 * Retorna null quando não encontra — o chamador decide o fallback.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const cacheKey = geocodeCacheKey(address);
  const cached = geocodeCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const result = await doGeocodeAddress(address);
  if (result) {
    geocodeCache.set(cacheKey, result);
  }
  return result;
}

/** true se o texto é apenas um CEP (com ou sem hífen). */
function isPureCepText(text: string): boolean {
  return /^\d{5}-?\d{3}$/.test(text.replace(/\s/g, ""));
}

/** Extrai o CEP (8 dígitos) contido no texto; null se não há CEP. */
function extractCepDigits(text: string): string | null {
  const m = text.match(/\b\d{5}-?\d{3}\b/);
  return m ? m[0].replace(/\D/g, "") : null;
}

// ════════════════════════════════════════════════════════════════════
// Fallback de busca de unidades via Nominatim (quando a Overpass está
// indisponível). Mesma base de dados (OpenStreetMap), endpoint de
// busca textual com viewbox delimitado ao raio.
// ════════════════════════════════════════════════════════════════════

interface NominatimPlace {
  place_id?: number;
  osm_id?: number;
  lat?: string;
  lon?: string;
  name?: string;
  display_name?: string;
  addresstype?: string;
  category?: string;
  type?: string;
}

/** Consultas em ordem — inclui upa e spa para completude do fallback (RF-013). */
export const AMENITY_QUERIES = [
  "hospital",
  "pronto socorro",
  "upa",
  "spa",
  "ubs",
  "policlinica",
] as const;
const NOMINATIM_POLICY_DELAY_MS = 600;
const AMENITY_TIMEOUT_MS = 3_500;

/** Tipos de resultado que NÃO são POIs de saúde (ex: vias nomadas "UBS...", municípios). */
const DENIED_ADDRESSTYPES = new Set([
  "highway",
  "boundary",
  "administrative",
  "municipality",
  "city",
  "town",
  "village",
  "borough",
  "suburb",
  "neighbourhood",
  "quarter",
  "state",
  "region",
  "county",
  "country",
  "postal_code",
  "place",
  "landuse",
  "waterway",
  "natural",
  "railway",
  "tourism",
  "leisure",
  "shop",
  "aeroway",
  "junction",
]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Busca unidades de saúde no Nominatim dentro do raio (fallback da Overpass).
 * Falha (throw) apenas se TODAS as consultas falharem na rede.
 */
export async function searchAmenitiesNear(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<Facility[]> {
  const cacheKey = facilityCacheKey(lat, lng, radiusKm);
  const cached = amenityCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const deltaLat = radiusKm * 0.009;
  const deltaLng = radiusKm * 0.012;
  const viewbox = [
    (lng - deltaLng).toFixed(4),
    (lat + deltaLat).toFixed(4),
    (lng + deltaLng).toFixed(4),
    (lat - deltaLat).toFixed(4),
  ].join(",");

  const allPlaces: NominatimPlace[] = [];
  let networkError: unknown = null;

  for (let i = 0; i < AMENITY_QUERIES.length; i++) {
    if (i > 0) await sleep(NOMINATIM_POLICY_DELAY_MS);
    try {
      const places = await fetchAmenityPlaces(AMENITY_QUERIES[i], viewbox);
      allPlaces.push(...places);
    } catch (err) {
      networkError = err;
    }
  }

  if (allPlaces.length === 0 && networkError !== null) {
    throw networkError instanceof Error ? networkError : new Error("Nominatim indisponível");
  }
  const facilities = mapNominatimResultsToFacilities(allPlaces, lat, lng, radiusKm);
  amenityCache.set(cacheKey, facilities);
  return facilities;
}

async function fetchAmenityPlaces(query: string, viewbox: string): Promise<NominatimPlace[]> {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    limit: "40",
    viewbox,
    bounded: "1",
    "accept-language": "pt-BR",
    countrycodes: "br",
  });
  const email = process.env.NOMINATIM_EMAIL;
  if (email) params.set("email", email);

  const resp = await fetch(`${baseUrl()}/search?${params.toString()}`, {
    headers: headers(),
    signal: AbortSignal.timeout(AMENITY_TIMEOUT_MS),
  });
  if (!resp.ok) throw new Error(`Nominatim ${resp.status} para "${query}"`);
  const data = (await resp.json()) as NominatimPlace[];
  return Array.isArray(data) ? data : [];
}

/**
 * Mapeia resultados jsonv2 do Nominatim para Facilities do domínio:
 * filtra não-POIs, classifica por nome (mesma regra da Overpass),
 * deduplica, filtra por raio e ordena por proximidade.
 */
export function mapNominatimResultsToFacilities(
  places: NominatimPlace[],
  originLat: number,
  originLng: number,
  radiusKm: number
): Facility[] {
  const seen = new Set<string>();
  const facilities: Facility[] = [];

  for (const place of places) {
    if (!place || typeof place !== "object") continue;
    const name = (place.name || "").trim();
    if (!name) continue;
    if (place.addresstype && DENIED_ADDRESSTYPES.has(place.addresstype)) continue;

    const fLat = parseFloat(place.lat ?? "");
    const fLng = parseFloat(place.lon ?? "");
    if (Number.isNaN(fLat) || Number.isNaN(fLng)) continue;
    if (fLat < -90 || fLat > 90 || fLng < -180 || fLng > 180) continue;

    const dist = haversineDistance(originLat, originLng, fLat, fLng);
    if (dist > radiusKm) continue;

    // Dedup: mesmo nome dentro de 100 m (ex: POI indexado como amenity e building)
    const dedupKey = `${name.toLowerCase()}@${Math.round(dist * 10)}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    const category = place.category || "";
    const type = place.type || "";
    facilities.push({
      id: String(place.place_id ?? place.osm_id ?? `${fLat},${fLng}`),
      name,
      type: classifyFacilityType({
        name,
        amenity: category === "amenity" ? type : "",
        healthcare: category === "healthcare" ? type : "",
      }),
      address: place.display_name || "",
      lat: fLat,
      lng: fLng,
      distance_km: roundDistance(dist),
      phone: "",
      emergency: false,
      operator: "",
      source: "OpenStreetMap (Nominatim)",
    });
  }

  facilities.sort((a, b) => a.distance_km - b.distance_km);
  return facilities;
}
