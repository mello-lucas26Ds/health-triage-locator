// Cliente Gemini Flash 2 — triagem por IA (fallback opcional).
// Sem GEMINI_API_KEY o sistema continua funcionando só com a base de
// conhecimento local + fallback conservador (ver process-health-query.ts).

import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TriageLevel, FacilityType } from "@/domain/types";

const TRIAGE_SYSTEM_PROMPT = `Você é um assistente de triagem de saúde pública brasileiro.
SUA ÚNICA FUNÇÃO: classificar a gravidade relatada pelo usuário e sugerir o tipo de unidade de saúde mais adequado.

REGRAS ABSOLUTAS:
1. NÃO faça diagnóstico.
2. NÃO prescreva tratamento.
3. NÃO substitua avaliação médica.
4. Use SEMPRE linguagem de recomendação e orientação.
5. Seja conservador: na dúvida, sugira nível mais alto de atenção.

CLASSIFICAÇÃO:
- "leve": Sintomas leves, sem sinais de alerta. → Recomendar UBS.
- "moderado": Sintomas que precisam de atenção mais rápida. → Recomendar UPA.
- "urgente": Sinais de alerta, risco potencial. → Recomendar Emergência.

SINAIS DE ALERTA (sempre → urgente):
- Dor no peito
- Falta de ar grave
- Perda de consciência
- Sangramento intenso
- Febre alta (>39°C) com outros sintomas graves
- Sinais de AVC (face assimétrica, fala arrastada, fraqueza lateral)
- Reação alérgica grave
- Pensamento suicida
- Ferimento grave

RESPOSTA OBRIGATÓRIA EM JSON (sem markdown, sem \`\`\`):
{
  "level": "leve|moderado|urgente",
  "facility_type": "ubs|upa|emergencia",
  "recommendation": "frase clara e acolhedora",
  "explanation": "explicação de 2-3 frases sobre por que essa indicação",
  "warning_signs": ["lista de sinais de alerta identificados, se houver"]
}`;

export interface AITriageResult {
  level: TriageLevel;
  facility_type: FacilityType;
  recommendation: string;
  explanation: string;
  warning_signs: string[];
}

export function hasGeminiApiKey(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * Classifica a triagem via IA. Lança erro quando a chave não existe,
 * a resposta é inválida ou o serviço falha — o chamador trata o fallback.
 */
export async function classifyTriageWithAI(message: string): Promise<AITriageResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY ausente");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      responseMimeType: "application/json",
    },
  });

  const chat = model.startChat({
    history: [{ role: "user", parts: [{ text: TRIAGE_SYSTEM_PROMPT }] }],
  });

  const result = await chat.sendMessage(message);
  const text = result.response.text();

  const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(cleaned);

  const level: TriageLevel = ["leve", "moderado", "urgente"].includes(parsed.level)
    ? parsed.level
    : "moderado";
  const facilityType: FacilityType = ["ubs", "upa", "emergencia"].includes(
    parsed.facility_type
  )
    ? parsed.facility_type
    : "upa";

  return {
    level,
    facility_type: facilityType,
    recommendation: parsed.recommendation || "Recomendamos buscar atendimento médico.",
    explanation: parsed.explanation || "Com base na descrição, sugerimos uma avaliação presencial.",
    warning_signs: Array.isArray(parsed.warning_signs) ? parsed.warning_signs : [],
  };
}
