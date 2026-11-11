# Architecture — decisões duradouras (ADRs)

## Contexto e restrições

MVP público de triagem + localização; dados de unidades só existem em OpenStreetMap (não há API oficial municipal utilizável no MVP); executa em serverless (Vercel) com limite de tempo por função; deve funcionar **sem chave de IA** (modo offline de IA).

## ADR-001 — Camadas dentro das convenções do Next.js

**Decisão:** `domain/`, `application/`, `infrastructure/` como pastas próprias; apresentação = `src/app` + `src/components` + `src/hooks` (convenção obrigatória do App Router).
**Trade-off:** não há pasta física `presentation/`; compensado por rotas finas que só validam e delegam.
**Alternativa rejeitada:** monorepo separando front/back (custo alto para um MVP).

## ADR-002 — KB local ANTES de IA (offline-first)

**Decisão:** triagem sempre passa pela KB local (≥ 40 entradas, matching NFD); IA só para o que a KB não cobre, e só com chave presente.
**Consequência:** funciona sem Internet de IA, responde < 1 ms nos casos conhecidos, custo de IA praticamente zero.
**Alternativa rejeitada:** IA para tudo (latência, custo e dependência).

## ADR-003 — NOME da unidade vence tags OSM na classificação

**Decisão:** ordem de classificação: 1) nome (spa/upa), 2) nome (ubs/policlínica), 3) nome (hospital/PS), 4) tags OSM, 5) fallback `ubs`.
**Motivo:** no Brasil o OSM marca policlínicas como `healthcare=hospital` e SPAs com `emergency=yes` — verificamos nos dados reais de Manaus (SPAs "SPA Joventina Dias" apareciam como emergência).
**Trade-off:** um hospital cujo nome não contém "hospital" cai no fallback por tags (comportamento conservador correto).

## ADR-004 — Word-boundary regex para siglas

**Decisão:** `\bspa\b`, `\bupa\b`, `\bubs\b`, `\bcsf\b` em vez de `includes()`.
**Motivo:** "Espaço Vida" contém "spa"; "pubs" contém "ubs". Descoberto em teste adversário.
**Trade-off:** siglas dentro de nomes compostos sem separador não são detectadas (raro).

## ADR-005 — Cliente Overpass com fallback de endpoints e bbox de 4 casas

**Decisão:** cadeia `OVERPASS_API_URL → lz4 → overpass-api.de → z`; bbox sempre `.toFixed(4)`; User-Agent próprio; timeout 20 s (query `[timeout:25]`).
**Motivo:** float impreciso (`-2.9669000000000003`) causava HTTP 406; endpoint principal sofre 504/506; serverless tem limite de tempo.
**Trade-off:** lz4 pode saturar em picos — cadeia mitiga.

## ADR-006 — Rate limit em memória (aproximado em serverless)

**Decisão:** limitador em memória por instância (30 req/min por IP), módulo com relógio injetável.
**Trade-off:** em Vercel cada instância tem memória própria — limite é aproximado, suficiente contra abuso casual; red team determinado exigiria store compartilhado (Redis/Upstash) — pendência registrada.

## ADR-007 — Limitação de endereços OSM aceita (não mascarada)

**Decisão:** endereço montado exclusivamente das tags `addr:*` do OSM; sem reverse-geocoding em lote para preencher faltantes.
**Motivo:** Nominatim permite 1 req/s — preencher 600 unidades custaria 10 min por busca e bane o User-Agent.
**Consequência:** ~25–40% das unidades de Manaus aparecem sem endereço (dado ausente no OSM). UI exibe "Endereço não disponível". Melhoria futura: cache + enriquecimento assíncrono.

## Limitações conhecidas

1. Dados OSM variam por cidade (Manaus validado; capitais grandes funcionam; cidades pequenas podem ter poucas unidades mapeadas).
2. Rate limit em memória não é rígido em serverless (ADR-006).

## Pendências (próximos passos recomendados)

- Cache das buscas Overpass (TTL 15–30 min) para reduzir latência e 429.
- Store compartilhado de rate limit (Upstash Redis) no deploy.
- Enriquecimento de endereços com fila assíncrona + cache.
- Monitoramento simples (logs estruturados → Vercel Analytics/Sentry).
