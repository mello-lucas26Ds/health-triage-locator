// Caso de uso: buscar unidades próximas por coordenadas (MCP tool isolada).
// Resiliência: Overpass fail-fast com fallback automático para Nominatim (RF-013).

import type { Facility, FacilityType, MCPToolCall } from "@/domain/types";
import { fetchOverpassElements, mapElementsToFacilities } from "@/infrastructure/overpass";
import { searchAmenitiesNear } from "@/infrastructure/nominatim";

const MAX_RESULTS = 20;

export interface SearchNearbyResult {
  mcp_tool: "search_nearby_facilities";
  input: { lat: number; lng: number; radius_km: number; types?: FacilityType[] };
  output: { facilities: Facility[]; total: number };
  latency_ms: number;
  timestamp: string;
}

export async function searchNearbyFacilities(input: {
  lat: number;
  lng: number;
  radius_km: number;
  types?: FacilityType[];
}): Promise<SearchNearbyResult> {
  const startTime = performance.now();

  let facilities: Facility[] = [];
  try {
    const elements = await fetchOverpassElements(input.lat, input.lng, input.radius_km);
    facilities = mapElementsToFacilities(
      elements,
      input.lat,
      input.lng,
      input.radius_km
    );
  } catch {
    // Fallback gracioso para Nominatim quando a Overpass falha (evita HTTP 503)
    try {
      facilities = await searchAmenitiesNear(input.lat, input.lng, input.radius_km);
    } catch {
      facilities = [];
    }
  }

  if (input.types && input.types.length > 0) {
    const allowed = new Set<FacilityType>(input.types);
    facilities = facilities.filter((f) => allowed.has(f.type));
  }

  const latencyMs = performance.now() - startTime;
  const mcpCalls: MCPToolCall[] = [];
  void mcpCalls; // assinatura estável para futuras etapas instrumentadas

  return {
    mcp_tool: "search_nearby_facilities",
    input: { lat: input.lat, lng: input.lng, radius_km: input.radius_km, types: input.types },
    output: {
      facilities: facilities.slice(0, MAX_RESULTS),
      total: facilities.length,
    },
    latency_ms: Math.round(latencyMs * 100) / 100,
    timestamp: new Date().toISOString(),
  };
}
