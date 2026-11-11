// Parser de localização a partir de texto livre — regra de negócio pura.
//
// Suporta os formatos que o usuário real digita (requisito RF-002b):
//   "69042-110"                                  → CEP puro
//   "rua juliaca,10, cidade nova, 69094-060"     → endereço com CEP embutido
//   "Manaus"                                     → cidade
//   "-3.10, -60.02"                              → coordenadas
//
// DECISÃO (documentada em docs/architecture.md ADR-005): a heurística
// looksLikeLocationOnly é CONSERVADORA — só dispara quando a base de triagem
// NÃO encontrou correspondência clínica. Se há sintoma reconhecido, a triagem
// clínica sempre vence.

const CEP_CAPTURE_RE = /\b\d{5}-?\d{3}\b/;

/** Extrai o CEP (8 dígitos, sem hífen) contido no texto; null se não há CEP. */
export function extractCep(text: string): string | null {
  const m = text.match(CEP_CAPTURE_RE);
  return m ? m[0].replace(/\D/g, "") : null;
}

/** true se o texto É apenas um CEP (com ou sem hífen, espaços tolerados). */
export function isPureCep(text: string): boolean {
  return /^\d{5}-?\d{3}$/.test(text.replace(/\s/g, ""));
}

/** Palavras que indicam endereço/localização em vez de sintoma clínico. */
const LOCATION_HINT_RE =
  /\b(rua|av|avenida|travessa|tv|bairro|beco|praça|praca|estrada|rodovia|km|cj|conjunto|cond|condom[ií]nio|quadra|lote|setor|zona|norte|sul|leste|oeste|centro|cidade|cep|munic[ií]pio|estado|manaus|amazonas)\b|\b\d{5}-?\d{3}\b|,|\d{1,5}\s*(n[º°o]|s\/n)/i;

/** Palavras típicas de relato clínico — presencia delas, NÃO é localização. */
const SYMPTOM_HINT_RE =
  /\b(dor|febre|tosse|tontura|v[oó]mito|sangramento|falta de ar|desmaio|convuls[iã]o|ferida|machucad|quebrei|ca[ií]|engasg|picada|anafila|incha|nausea|n[aá]usea|diarreia|mal-estar|febril|menino|menina|crian[cç]a|gestante|gr[aá]vida|bebe|beb[eê])\b/i;

/**
 * Decide se o texto da mensagem é, na prática, só uma localização.
 * Regra: curto, sem verbo/relato clínico reconhecido e com pista de endereço
 * (rua/av/bairro/CEP/vírgula/número). Nunca usada quando a KB já casou.
 */
export function looksLikeLocationOnly(text: string): boolean {
  const t = text.trim();
  if (t.length === 0 || t.length > 120) return false;
  if (SYMPTOM_HINT_RE.test(t)) return false;
  // Coordenadas puras
  if (/^-?\d{1,2}(?:\.\d+)?\s*[,;]\s*-?\d{1,3}(?:\.\d+)?$/.test(t)) return true;
  const tokens = t.split(/\s+/).filter(Boolean);
  if (tokens.length > 10) return false;
  return LOCATION_HINT_RE.test(t);
}
