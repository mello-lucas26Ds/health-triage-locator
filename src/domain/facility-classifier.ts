// Classificação de unidades de saúde — regra de negócio pura.
//
// DECISÃO IMPORTANTE (ver docs/architecture.md ADR-003):
// O NOME da unidade tem prioridade sobre as tags do OpenStreetMap.
// No Brasil o OSM frequentemente marca policlínicas como healthcare=hospital
// e SPAs com emergency=yes. O nome público é mais confiável para decidir
// entre UBS, UPA e Emergência.
//
// Usa word-boundary regex para evitar falsos positivos:
//   "Espaço Vida"      NÃO deve casar "spa"
//   "Clube dos Pubs"   NÃO deve casar "ubs"

import type { FacilityType } from "./types";

const RE_SPA = /\bspa\b/i;
const RE_UPA = /\bupa\b/i;
const RE_UBS = /\bubs\b/i;
const RE_CSF = /\bcsf\b/i;

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

const UPA_PATTERNS = [RE_UPA, RE_SPA, /pronto\s*atendimento/i];

const UBS_PATTERNS = [
  RE_UBS,
  RE_CSF,
  /policl[ií]nica/i,
  /policlinida/i,
  /unidade\s*b[aá]sica/i,
  /posto\s*de\s*sa[uú]de/i,
  /centro\s*de\s*sa[uú]de/i,
  /cl[ií]nica\s*da\s*fam[ií]lia/i,
  /ambulat[oó]rio/i,
];

const EMERGENCY_PATTERNS = [
  /hospital/i,
  /pronto\s*socorro/i,
  /emerg[eê]ncia/i,
  /urg[eê]ncia/i,
];

/**
 * Classifica uma unidade a partir das tags do OpenStreetMap.
 * Ordem: 1) nome (spa/upa), 2) nome (ubs/policlínica), 3) nome (hospital/ps),
 * 4) tags OSM, 5) fallback conservador → UBS.
 */
export function classifyFacilityType(tags: Record<string, string>): FacilityType {
  const name = (tags.name || "").toLowerCase();
  const healthcare = tags.healthcare || "";
  const amenity = tags.amenity || "";

  // 1. SPA / UPA — pelo NOME
  if (matchesAny(name, UPA_PATTERNS)) {
    return "upa";
  }

  // 2. Policlínica / UBS / Centro de Saúde — pelo NOME
  if (matchesAny(name, UBS_PATTERNS)) {
    return "ubs";
  }

  // 3. Hospital / Pronto Socorro / Emergência — pelo NOME
  if (matchesAny(name, EMERGENCY_PATTERNS)) {
    return "emergencia";
  }

  // 4. Tags OSM — quando o nome não é conclusivo
  if (amenity === "hospital" || healthcare === "hospital") {
    return "emergencia";
  }
  if (healthcare === "urgent_care") {
    return "upa";
  }
  if (
    healthcare === "clinic" ||
    healthcare === "centre" ||
    amenity === "clinic" ||
    amenity === "doctors"
  ) {
    return "ubs";
  }

  // 5. Fallback conservador: qualquer outro healthcare → UBS
  return "ubs";
}

/**
 * Tipos de unidade que NÃO são pontos de atendimento clínico e devem ser
 * excluídos dos resultados (não faz sentido recomendar farmácia como "UBS").
 */
const EXCLUDED_HEALTHCARE = new Set([
  "pharmacy",
  "laboratory",
  "physiotherapist",
  "psychotherapist",
  "dentist",
]);
const EXCLUDED_AMENITY = new Set(["pharmacy", "dentist"]);

export function isExcludedFacility(tags: Record<string, string>): boolean {
  if (EXCLUDED_HEALTHCARE.has(tags.healthcare)) return true;
  if (EXCLUDED_AMENITY.has(tags.amenity)) return true;
  return false;
}

/**
 * Ordena colocando o tipo prioritário primeiro, preservando a ordenação
 * por distância dentro de cada grupo.
 */
export function prioritizeByType<T extends { type: FacilityType }>(
  facilities: T[],
  targetType: FacilityType
): T[] {
  const matching = facilities.filter((f) => f.type === targetType);
  const others = facilities.filter((f) => f.type !== targetType);
  return [...matching, ...others];
}
