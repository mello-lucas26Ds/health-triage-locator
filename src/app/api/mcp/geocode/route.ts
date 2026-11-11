// POST /api/mcp/geocode — controlador fino da geocodificação.

import { NextRequest, NextResponse } from "next/server";
import { geocodeSchema, formatValidationError } from "@/domain/validation";
import { geocodeAddress } from "@/infrastructure/nominatim";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const startTime = performance.now();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = geocodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error) },
      { status: 400 }
    );
  }

  try {
    const geo = await geocodeAddress(parsed.data.address);
    const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

    if (!geo) {
      return NextResponse.json({
        mcp_tool: "geocode_address",
        input: { address: parsed.data.address },
        error:
          'Não foi possível resolver a localização. Tente ser mais específico: "Rua Professor Abílio Alencar, Alvorada, Manaus", "Centro, Manaus" ou um CEP.',
        latency_ms: latencyMs,
      });
    }

    return NextResponse.json({
      mcp_tool: "geocode_address",
      input: { address: parsed.data.address },
      output: geo,
      latency_ms: latencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error("geocode falhou:", error);
    return NextResponse.json(
      { error: "Erro de conexão com o serviço de geocodificação. Tente novamente." },
      { status: 502 }
    );
  }
}
