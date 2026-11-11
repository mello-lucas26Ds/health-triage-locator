// POST /api/mcp/triage — controlador fino da triagem por IA (exposto para testes).

import { NextRequest, NextResponse } from "next/server";
import { triageSchema, formatValidationError } from "@/domain/validation";
import { classifyTriageWithAI, hasGeminiApiKey } from "@/infrastructure/gemini";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const startTime = performance.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = triageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error) },
      { status: 400 }
    );
  }

  if (!hasGeminiApiKey()) {
    return NextResponse.json(
      { error: "Triagem por IA não configurada. O pipeline /api/mcp/process continua funcionando com a base de conhecimento local." },
      { status: 503 }
    );
  }

  try {
    const result = await classifyTriageWithAI(parsed.data.message);
    const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

    return NextResponse.json({
      mcp_tool: "triage_classify",
      input: { message: parsed.data.message.substring(0, 100) },
      output: result,
      latency_ms: latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error("triage falhou:", error);
    return NextResponse.json(
      { error: "Serviço de triagem por IA indisponível. Tente novamente." },
      { status: 502 }
    );
  }
}
