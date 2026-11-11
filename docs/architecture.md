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

## ADR-005 — Cliente Overpass com Fail-Fast (3.5s) e bbox de 4 casas

**Decisão:** cadeia `OVERPASS_API_URL → lz4 → overpass-api.de → z`; bbox sempre `.toFixed(4)`; User-Agent próprio; timeout agressivo de **3.5 s** por tentativa (em vez de 20s).
**Motivo:** evitar que requisições fiquem 60 segundos presas em instabilidades da Overpass pública antes de acionar o fallback.
**Trade-off:** queries extremamente pesadas cortam para o fallback mais rapidamente — comportamento seguro e conservador.

## ADR-006 — Rate limit em memória (aproximado em serverless)

**Decisão:** limitador em memória por instância (30 req/min por IP), módulo com relógio injetável.
**Trade-off:** em Vercel cada instância tem memória própria — limite é aproximado, suficiente contra abuso casual; red team determinado exigiria store compartilhado (Redis/Upstash) — pendência registrada.

## ADR-007 — Limitação de endereços OSM aceita (não mascarada)

**Decisão:** endereço montado exclusivamente das tags `addr:*` do OSM; sem reverse-geocoding em lote para preencher faltantes.
**Motivo:** Nominatim permite 1 req/s — preencher 600 unidades custaria 10 min por busca e bane o User-Agent.
**Consequência:** ~25–40% das unidades de Manaus aparecem sem endereço (dado ausente no OSM). UI exibe "Endereço não disponível". Melhoria futura: cache + enriquecimento assíncrono.

## ADR-008 — Circuit Breaker e Cache em Memória com TTL para APIs Geoespaciais

**Decisão:** implementar store em memória leve (LRU com TTL) para POIs (15 min) e geocodificação (30 min). Se a Overpass acumular 2 falhas consecutivas, o Circuit Breaker abre por 60s, roteando chamadas subsequentes imediatamente ao fallback do Nominatim sem espera.
**Motivo:** derrubar latência média de consultas de ~57s para < 3-5s e garantir respostas em < 10ms para consultas na mesma região.
**Trade-off:** dados atualizados no OSM levam até 15 minutos para refletir no cache local da instância.

## ADR-009 — Sincronização Bidirecional e Foco Interativo no Mapa

**Decisão:** conectar o estado de seleção da unidade (`selectedFacility`) diretamente ao componente `HealthMap`. Ao selecionar um item da lista, o Leaflet executa `map.flyTo` nas coordenadas da unidade e dispara `marker.openPopup()`.
**Motivo:** eliminar o desacoplamento visual relatado pelo usuário, onde clicar na unidade listada não mostrava sua posição no mapa.

## Limitações conhecidas

1. Dados OSM variam por cidade (Manaus validado; capitais grandes funcionam; cidades pequenas podem ter poucas unidades mapeadas).
2. Rate limit e caches em memória são por instância em serverless (ADR-006 / ADR-008).

## Pendências (próximos passos recomendados)

- Store compartilhado de rate limit e cache distribuído (Upstash Redis) se houver escala multi-região.
- Enriquecimento de endereços com fila assíncrona.
- Monitoramento simples (logs estruturados → Vercel Analytics/Sentry).
