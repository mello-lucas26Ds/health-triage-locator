// POST /api/mcp/search-facilities — controlador fino da busca isolada.

import { NextRequest, NextResponse } from "next/server";
import { searchFacilitiesSchema, formatValidationError } from "@/domain/validation";
import { searchNearbyFacilities } from "@/application/search-nearby-facilities";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = searchFacilitiesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: formatValidationError(parsed.error) },
      { status: 400 }
    );
  }

  try {
    const result = await searchNearbyFacilities(parsed.data);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("search-facilities falhou:", error);
    return NextResponse.json(
      { error: "Serviço de busca indisponível no momento. Tente novamente." },
      { status: 503 }
    );
  }
}
