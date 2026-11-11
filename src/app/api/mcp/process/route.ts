// POST /api/mcp/process — controlador fino do orchestrator MCP.
// Valida entrada, delega ao caso de uso, retorna erros padronizados.

import { NextRequest, NextResponse } from "next/server";
import { processQuerySchema, formatValidationError } from "@/domain/validation";
import { processHealthQuery } from "@/application/process-health-query";

// Tempo máximo para a função serverless (Vercel)
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const totalStart = performance.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = processQuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error) },
      { status: 400 }
    );
  }

  try {
    const result = await processHealthQuery(parsed.data);
    return NextResponse.json(result);
  } catch (error: unknown) {
    // Nunca expor stack trace ou detalhes internos
    console.error("process falhou:", error);
    return NextResponse.json(
      {
        error: "Erro interno ao processar sua solicitação. Tente novamente.",
        latencies: { total_ms: Math.round((performance.now() - totalStart) * 100) / 100 },
      },
      { status: 500 }
    );
  }
}
