// Tipos de domínio do Health Triage Locator

export type TriageLevel = "leve" | "moderado" | "urgente";
export type FacilityType = "ubs" | "upa" | "emergencia";

export interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  address: string;
  lat: number;
  lng: number;
  distance_km: number;
  phone: string;
  emergency: boolean;
  operator: string;
  source: string;
}

/**
 * Precisão da geocodificação — reportada ao usuário com transparência.
 * Medido em Manaus (2025-11): o OSM tem geometria de rua para os CEPs testados,
 * mas nem sempre tem número de porta (ex.: "Rua Juliaca 10" cai no nível da rua)
 * e algumas ruas oficiais dos Correios nem existem no OSM (ex.: Travessa Guairia,
 * CEP 69094-060 → cai no nível do bairro). A UI exibe esse nível como "aproximado".
 */
export type LocationPrecision =
  | "coords_exact" // usuário forneceu "lat, lng" — ponto exato
  | "house" // número de porta encontrado no OSM
  | "street" // rua resolvida, sem número de porta
  | "neighborhood" // rua ausente no OSM; caiu no bairro
  | "city" // caiu no município
  | "municipal_centroid"; // centróide municipal — impreciso

/** Dados oficiais do ViaCEP (base dos Correios) para um CEP. */
export interface ViaCepInfo {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface TriageResult {
  level: TriageLevel;
  recommendation: string;
  facility_type: FacilityType;
  explanation: string;
  warning_signs: string[];
  latency_ms: number;
}

export interface MapData {
  center: { lat: number; lng: number };
  user_location: { lat: number; lng: number } | null;
  facilities: Facility[];
}

export interface LatencyBreakdown {
  triage_ms: number;
  geocode_ms: number;
  search_ms: number;
  total_ms: number;
}

export interface MCPToolCall {
  tool: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  latency_ms: number;
}

export interface ProcessResponse {
  triage: TriageResult;
  facilities: Facility[];
  map_data: MapData;
  latencies: LatencyBreakdown;
  mcp_calls: MCPToolCall[];
  disclaimer: string;
  /** Provedor que produziu a lista de unidades: "overpass" | "nominatim" | "nenhum". */
  search_provider: string;
  /** true quando todas as fontes de busca falharam (resposta sem unidades é honesta). */
  search_failed: boolean;
  /** Endereço resolvido pela geocodificação (display_name), ou null se usou coordenadas padrão. */
  resolved_location: string | null;
  /** Nível de precisão da geocodificação (null quando usou coordenadas padrão). */
  location_precision: LocationPrecision | null;
  /** Dados oficiais do ViaCEP quando um CEP foi decodificado no fluxo. */
  resolved_via_cep: ViaCepInfo | null;
  /** Nota de transparência (ex.: rua do CEP não existe no OSM; CEP pertence a outra rua). */
  location_note: string | null;
}
