// Proxy de segurança — convenção Next.js 16 (antes "middleware").
//
// Proteções:
// 1. Rate limiting (30 req/min por IP nas rotas de API) — módulo testável
// 2. Bloqueio de métodos não permitidos nas API routes
// 3. Headers de segurança em todas as respostas
// 4. CORS restrito (configurável via ALLOWED_ORIGINS)
//
// Observação: em serverless o rate limit é por instância (aproximado).
// Limites rígidos exigem store compartilhado (ver docs/architecture.md).

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createRateLimiter } from "@/infrastructure/rate-limit";

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

// Instância única por worker; relógio real de produção.
const limiter = createRateLimiter({ limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS });

function getClientIp(request: NextRequest): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return "unknown";
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isApi) {
    const result = limiter.check(getClientIp(request));
    if (!result.allowed) {
      return NextResponse.json(
        { error: `Muitas requisições. Tente novamente em ${result.retryAfterSeconds}s.` },
        { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } }
      );
    }

    const method = request.method;
    if (!["GET", "POST", "OPTIONS"].includes(method)) {
      return NextResponse.json({ error: "Método não permitido" }, { status: 405 });
    }
  }

  const response = NextResponse.next();

  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");

  const origin = request.headers.get("origin");
  if (origin) {
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
      .split(",")
      .map((s) => s.trim());
    if (allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      response.headers.set(
        "Access-Control-Allow-Origin",
        allowedOrigins.includes("*") ? "*" : origin
      );
      response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.headers.set("Access-Control-Allow-Headers", "Content-Type");
      response.headers.set("Access-Control-Max-Age", "86400");
    }
  }

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: response.headers });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
