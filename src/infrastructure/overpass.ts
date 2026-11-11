// Cliente Overpass API (OpenStreetMap) — infraestrutura externa.
//
// Robustez:
// - bbox arredondado a 4 casas decimais (float impreciso causa HTTP 406)
// - User-Agent obrigatório
// - fallback entre endpoints (lz4 é o padrão — mais estável)
// - timeout curto (3.5s) com fail-fast para não travar a aplicação (RF-013)
// - Circuit Breaker em memória: se falhar, protege chamadas subsequentes por 60s (RF-013)
// - Cache em memória com TTL de 15 min (RF-013)

import { haversineDistance, roundDistance } from "@/domain/geo";
import { classifyFacilityType, isExcludedFacility } from "@/domain/facility-classifier";
import type { Facility } from "@/domain/types";
import { createCacheStore, facilityCacheKey, type CacheStore } from "./cache";

const DEFAULT_ENDPOINTS = [
  "https://lz4.overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter",
];

export const OVERPASS_TIMEOUT_MS = 3_500;
const REQUEST_TIMEOUT_MS = OVERPASS_TIMEOUT_MS;

// ── Circuit Breaker em memória ──
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
const CIRCUIT_OPEN_DURATION_MS = 60_000;
const FAILURE_THRESHOLD = 2;

export function isOverpassCircuitOpen(): boolean {
  if (circuitOpenUntil && Date.now() >= circuitOpenUntil) {
    circuitOpenUntil = 0;
    consecutiveFailures = 0;
  }
  return Date.now() < circuitOpenUntil;
}

export function recordOverpassFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= FAILURE_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_DURATION_MS;
  }
}

export function recordOverpassSuccess(): void {
  circuitOpenUntil = 0;
  consecutiveFailures = 0;
}

export function resetOverpassCircuitBreaker(): void {
  circuitOpenUntil = 0;
  consecutiveFailures = 0;
  overpassCache.clear();
}

// ── Cache de elementos Overpass ──
const overpassCache = createCacheStore<OverpassElement[]>({
  maxEntries: 100,
  defaultTtlMs: 15 * 60 * 1000,
});

export function getOverpassCache(): CacheStore<OverpassElement[]> {
  return overpassCache;
}

export interface OverpassElement {
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

/** Monta a query Overpass com bbox seguro: 4 casas decimais e clamp aos limites válidos. */
export function buildOverpassQuery(lat: number, lng: number, radiusKm: number): string {
  const deltaLat = radiusKm * 0.009;
  const deltaLng = radiusKm * 0.012;
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  const bbox = [
    clamp(lat - deltaLat, -90, 90),
    clamp(lng - deltaLng, -180, 180),
    clamp(lat + deltaLat, -90, 90),
    clamp(lng + deltaLng, -180, 180),
  ]
    .map((v) => v.toFixed(4))
    .join(",");

  return `[out:json][timeout:25];(
    node["amenity"="hospital"](${bbox});
    node["amenity"="clinic"](${bbox});
    node["amenity"="doctors"](${bbox});
    node["healthcare"="hospital"](${bbox});
    node["healthcare"="clinic"](${bbox});
    node["healthcare"="centre"](${bbox});
    node["healthcare"](${bbox});
    way["amenity"="hospital"](${bbox});
    way["amenity"="clinic"](${bbox});
    way["healthcare"="hospital"](${bbox});
    way["healthcare"="clinic"](${bbox});
    way["healthcare"="centre"](${bbox});
    way["healthcare"](${bbox});
    relation["amenity"="hospital"](${bbox});
    relation["healthcare"="hospital"](${bbox});
  );out center body;`;
}

/** Executa a query na Overpass com fallback de endpoints, circuit breaker e cache. */
export async function fetchOverpassElements(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<OverpassElement[]> {
  const cacheKey = facilityCacheKey(lat, lng, radiusKm);
  const cached = overpassCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  if (isOverpassCircuitOpen()) {
    throw new Error("Overpass Circuit Breaker OPEN (instabilidade recente detectada)");
  }

  const endpoints = [process.env.OVERPASS_API_URL, ...DEFAULT_ENDPOINTS].filter(
    Boolean
  ) as string[];
  const query = buildOverpassQuery(lat, lng, radiusKm);
  const body = `data=${encodeURIComponent(query)}`;

  for (const endpoint of endpoints) {
    try {
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "HealthTriageLocator/1.0",
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!resp.ok) {
        console.warn(`Overpass endpoint falhou (${resp.status}): ${endpoint}`);
        continue;
      }
      const data = (await resp.json()) as { elements?: OverpassElement[] };
      const elements = data.elements || [];
      recordOverpassSuccess();
      overpassCache.set(cacheKey, elements);
      return elements;
    } catch (err) {
      console.warn(`Overpass endpoint erro: ${endpoint}`, err);
    }
  }

  recordOverpassFailure();
  throw new Error("Todos os endpoints Overpass falharam");
}

/** Monta o endereço a partir das tags OSM disponíveis. */
export function buildAddress(tags: Record<string, string>): string {
  const parts = [
    tags["addr:street"],
    tags["addr:housenumber"],
    tags["addr:suburb"],
    tags["addr:neighbourhood"],
    tags["addr:city"],
  ].filter(Boolean) as string[];
  return parts.join(", ");
}

/**
 * Converte elementos brutos do Overpass em Facilities do domínio:
 * exclui farmácias/dentistas/labs, classifica por tipo, calcula distância,
 * filtra por raio e ordena por proximidade.
 */
export function mapElementsToFacilities(
  elements: OverpassElement[],
  originLat: number,
  originLng: number,
  radiusKm: number
): Facility[] {
  const facilities: Facility[] = [];

  for (const element of elements) {
    // Elemento malformado de terceiros não quebra o lote (SPEC RF-005)
    if (!element || typeof element !== "object") continue;
    const tags = element.tags || {};
    if (isExcludedFacility(tags)) continue;

    const fLat = element.lat ?? element.center?.lat;
    const fLng = element.lon ?? element.center?.lon;
    if (typeof fLat !== "number" || typeof fLng !== "number") continue;
    if (fLat < -90 || fLat > 90 || fLng < -180 || fLng > 180) continue;

    const dist = haversineDistance(originLat, originLng, fLat, fLng);
    if (dist > radiusKm) continue;

    facilities.push({
      id: String(element.id ?? `${fLat},${fLng}`),
      name: tags.name || tags["name:pt"] || "Unidade de Saúde",
      type: classifyFacilityType(tags),
      address: buildAddress(tags),
      lat: fLat,
      lng: fLng,
      distance_km: roundDistance(dist),
      phone: tags.phone || tags["contact:phone"] || "",
      emergency: tags.emergency === "yes",
      operator: tags.operator || "",
      source: "OpenStreetMap",
    });
  }

  facilities.sort((a, b) => a.distance_km - b.distance_km);
  return facilities;
}
