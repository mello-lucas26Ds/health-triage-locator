# SDD — Health Triage Locator

## Arquitetura de alto nível

Next.js 16 (App Router) com camadas organizadas por responsabilidade. Aplicação estática + API routes serverless. Sem banco de dados no MVP — dados de unidades vêm do OpenStreetMap em tempo real.

```text
┌────────────────── presentation ──────────────────┐
│  src/app/page.tsx (UI React)                     │
│  src/components/ (HealthMap, ui, facility-display)│
│  src/app/api/mcp/*/route.ts (controladores finos) │
└───────────────┬───────────────────────────────────┘
                │
┌───────────────▼─────── application ──────────────┐
│  process-health-query.ts  (orchestrator MCP)     │
│  search-nearby-facilities.ts (busca isolada)     │
└───────┬─────────────────┬────────────────────────┘
        │                 │
┌───────▼───── domain ────▼────── infrastructure ───┐
│ health-kb.ts        (KB de triagem, pura)        │
│ facility-classifier (classificação, pura)        │
│ geo.ts (haversine)   → overpass.ts (OSM)         │
│ validation.ts (zod)  → nominatim.ts (geocode)    │
│ types.ts             → gemini.ts (IA opcional)   │
│                      → rate-limit.ts             │
└───────────────────────────────────────────────────┘
```

**Nota (ADR-001):** o App Router exige `src/app`; a camada de apresentação é `src/app` + `src/components` + `src/hooks`. Os controladores HTTP são rotas finas que validam (zod) e delegam aos casos de uso.

## Componentes e responsabilidades

| Componente | Responsabilidade | Dependências |
|---|---|---|
| `domain/health-kb` | Base de palavras-chave → nível/tipo/orientação. Matching normalizado (NFD). | nenhuma |
| `domain/facility-classifier` | Nome-vs-tags OSM; exclusões; priorização por tipo. | domain/types |
| `domain/geo` | Haversine, arredondamento. | nenhuma |
| `domain/validation` | Schemas zod de borda, limites, formatação de erro. | zod |
| `application/process-health-query` | Pipeline MCP completo + instrumentação de latências. | domain + infrastructure |
| `application/search-nearby-facilities` | Busca por coordenadas (contrato isolado). | domain + infrastructure |
| `infrastructure/overpass` | Query builder (bbox 4 casas), fallback de endpoints, mapeamento → Facility. | domain |
| `infrastructure/nominatim` | Geocodificação: coordenadas → CEP → texto (pt-BR, Brazil). | — |
| `infrastructure/gemini` | Triagem por IA (JSON estrito, validado antes de usar). | @google/generative-ai |
| `infrastructure/rate-limit` | Limitador com relógio injetável (testável). | — |
| `middleware.ts` | Rate limit de borda + headers + CORS + métodos. | infrastructure/rate-limit |

## Contratos de API (ver SPEC § Endpoints)

Erros padronizados: `{ "error": "mensagem em PT-BR" }` com status 400 (contrato), 429 (limite, com `Retry-After`), 500 (interno — sem stack trace), 502/503 (integração externa / não configurado). Detalhes internos ficam só no log do servidor.

## Fluxo principal (process)

1. `POST /api/mcp/process` → zod valida → `processHealthQuery()`.
2. KB match (ou IA opcional, ou fallback conservador) → `TriageResult`.
3. `geocodeAddress(location)` se localização e sem lat/lng; falha → padrão Manaus.
4. `fetchOverpassElements` (bbox toFixed(4), UA, timeout 20 s, 3 endpoints) → `mapElementsToFacilities` (exclusão → classificação → haversine → filtro de raio → ordenação).
5. `prioritizeByType(triage.facility_type)` → lista (10) + mapa (30).
6. Resposta com `mcp_calls[]` instrumentado por etapa.

## Integrações externas

| Serviço | Uso | Proteção |
|---|---|---|
| Overpass API | unidades de saúde | 3 endpoints em cadeia, UA próprio, timeout 20 s, bbox 4 casas |
| Nominatim | geocodificação | `countrycodes=br`, UA, timeout 10 s, e-mail opcional |
| Gemini Flash 2 | triagem fallback | chave opcional; validação de shape; try/catch → fallback |

## Autenticação e autorização

MVP público, sem autenticação (nada de dados sensíveis é armazenado). Proteção por rate limit e validação de entrada. Deploy futuro com contas/usuários exigirá decisão registrada em `docs/architecture.md`.

## Tratamento de erros

- Bordas: validação zod → 400 com mensagem única formatada.
- Integrações: cada falha é capturada e degrada (não propaga 500 ao usuário quando há caminho alternativo).
- Servidor: `console.error` com contexto; resposta genérica ao cliente.

## Requisitos não funcionais

- Latência: KB < 50 ms; pipeline total < 10 s com Overpass saudável; `maxDuration = 60` nas rotas para serverless.
- Segurança: CSP, headers Helmet-style, rate limit, strictObject, escape de HTML em popups (dados OSM são de terceiros).
- Observabilidade: `mcp_calls[]` expõe latência e resultado de cada etapa; logs de servidor para falhas de integração.

## Decisões e trade-offs

Ver `docs/architecture.md` (ADRs 001–007).
