# SPEC — Health Triage Locator

Comportamentos exatos e verificáveis do MVP. IDs estáveis para rastreio nos testes.

## Requisitos funcionais

### RF-001 — Triagem por base de conhecimento (KB)

**Regra:** a KB é consultada ANTES de qualquer IA. Matching por substring normalizada (NFD, minúsculas, sem acentos).

**Critérios de aceite:**
- "dor no peito" → `urgente` / `emergencia`.
- "estou com tosse e coriza" → `leve` / `ubs`.
- "estou com tontura" → `moderado` / `upa`.
- "picado por cobra" → `urgente` / `emergencia`.
- KB tem ≥ 40 entradas e todas com keywords/level/facility_type válidos.
- Latência do lookup < 50 ms (reportada em `triage.latency_ms`).

### RF-002 — Fallback conservador

**Regra:** sintoma não reconhecido + sem chave de IA → `moderado` / `upa` com recomendação explícita de avaliação presencial.

**Critérios de aceite:**
- "ontem fui ao shopping" → `moderado` / `upa` (nunca erro 500).
- Mensagem vazia → 400 (não chega a cair no fallback).

### RF-003 — Triagem por IA (opcional)

**Regra:** IA é chamada somente se KB não matchear e `GEMINI_API_KEY` existir. Saída inválida da IA → fallback conservador (nunca 500).

**Critérios de aceite:**
- Rota `/api/mcp/triage` sem chave → 503 com mensagem clara (não vaza detalhes internos).
- Pipeline `/api/mcp/process` funciona sem a chave (fluxo KB + fallback).

### RF-004 — Geocodificação

**Regra:** aceita coordenadas ("−3.07, −60.04"), CEP (8 dígitos) e texto livre; restringe busca ao Brasil (`countrycodes=br`).

**Critérios de aceite:**
- "Alvorada, Manaus" → coordenadas dentro de Manaus (lat entre −3.2 e −2.9).
- Entrada com menos de 3 caracteres → 400.
- Nominatim indisponível → pipeline segue com coordenadas padrão (Manaus), sem erro 500.

### RF-005 — Busca de unidades (Overpass)

**Regra:** query com bbox arredondado a 4 casas decimais (evita HTTP 406), User-Agent obrigatório, fallback entre 3 endpoints. Exclui farmácia, dentista, laboratório, fisioterapeuta, psicoterapeuta.

**Critérios de aceite:**
- `buildOverpassQuery` sempre gera bbox com 4 casas decimais (teste).
- Farmácia ("Drogaria Araújo") nunca aparece nos resultados (teste + E2E).
- Unidade sem nome → nome "Unidade de Saúde", nunca descartada.
- Elementos com coordenadas inválidas são ignorados sem quebrar o lote.
- Overpass indisponível → resposta com `facilities: []` e etapa marcada `failed: true` (não 500 do pipeline de triagem).

### RF-006 — Busca direta por tipo

**Regra:** perguntas diretas na KB definem o `facility_type` da triagem: hospital/pronto socorro → `emergencia`; UBS/policlínica → `ubs`; UPA/SPA → `upa`; combinada "SPA/policlinica" → `upa`.

**Critérios de aceite:**
- "qual hospital mais proximo?" → triagem `emergencia` e 1º resultado do tipo `emergencia`.
- "qual UBS mais proxima?" → `ubs` e 1º resultado `ubs`.
- "qual UPA mais proxima?" → `upa` e 1º resultado `upa`.
- "qual SPA/policlinica mais proxima?" → `upa` (entrada combinada vence empate).

### RF-007 — Priorização por tipo de triagem

**Regra:** resultados ordenados por distância dentro de cada grupo; grupo do tipo da triagem vem primeiro. Lista: até 10; mapa: até 30.

**Critérios de aceite:**
- Triagem `emergencia` → 1º resultado é `emergencia` (teste + E2E).
- `prioritizeByType` não muta o array original e preserva distância dentro dos grupos (teste).

### RF-008 — Endereço das unidades

**Regra:** montado das tags `addr:street`, `addr:housenumber`, `addr:suburb`, `addr:neighbourhood`, `addr:city` do OSM.

**Critérios de aceite:**
- Unidade com tags completas → "Rua Professor Abílio Alencar, 120, Alvorada, Manaus".
- Unidade sem tags → endereço vazio ("Endereço não disponível" na UI) — limitação documentada do OSM.

### RF-009 — Classificação de unidades

**Regra:** NOME da unidade tem prioridade sobre tags OSM; word-boundary regex para spa/upa/ubs/csf.

**Critérios de aceite:**
- "SPA - Serviço de Pronto Atendimento..." com tags `healthcare=hospital`/`emergency=yes` → `upa`.
- "Policlínica Castelo Branco" com `healthcare=hospital` → `ubs`.
- "Hospital e Pronto Socorro 28 de Agosto" → `emergencia`.
- "Clínica Espaço Vida" → `ubs` ("spa" dentro de "espaço" NÃO casa).
- Sem nome conclusivo → tags OSM decidem; sem nada → `ubs` (conservador).

### RF-010 — Validação de entrada e limites

**Regra:** zod strictObject na borda de toda rota. Mensagem ≤ 1000 caracteres; localização ≤ 200; lat ∈ [−90, 90]; lng ∈ [−180, 180]; raio ∈ [0.5, 50] km.

**Critérios de aceite:**
- Campo desconhecido → 400.
- `lat=999`, `radius_km=500`, mensagem vazia → 400.
- Payloads XSS atravessam como DADO (nunca executados): React escapa na UI e `escapeHtml` escapa popups do mapa.

### RF-011 — Rate limiting e segurança HTTP

**Regra:** 30 req/min por IP nas rotas de API (429 com `Retry-After`); métodos permitidos: GET/POST/OPTIONS; headers X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy; CSP em produção; HSTS em produção.

**Critérios de aceite:**
- 31ª requisição no mesmo minuto → 429 (teste com relógio injetável).
- Rate limiter não cresce indefinidamente (limpeza de entradas expiradas).

### RF-012 — Transparência de precisão da geocodificação (v1.1.0)

**Regra:** toda resposta de geocodificação carrega `precision` — um de: `coords_exact` (lat,lng do usuário), `house` (nº de porta no OSM), `street` (nível da rua), `neighborhood` (bairro), `city` (município), `municipal_centroid` (centróide — impreciso). A cadeia é: ViaCEP (Correios) → Nominatim estruturado → segmentos → ViaCEP reverso (nome da rua → bairro/CEP oficiais, escopo Manaus/AM). Endereços passam por normalização de abreviações (`r.` → `Rua`, `tv` → `Travessa`, `nº 10` → `10`). Quando a rua oficial do CEP não tem geometria no OSM, ou o CEP pertence a outra rua, a resposta inclui `note` em linguagem natural + `via_cep` com os dados oficiais. A UI exibe badge de precisão (verde = exato; âmbar = aproximado) e a nota.

**Critérios de aceite:**
- CEP puro (ex.: `69042-110`) → `via_cep` preenchido, `precision ∈ {street, house}` quando o OSM tem a rua.
- Rua oficial do CEP sem geometria no OSM (ex.: Travessa Guairia, CEP 69094-060) → `precision = neighborhood` + nota honesta de aproximação (nunca centróide silencioso).
- Endereço com CEP divergente (ex.: `rua juliaca, 10, cidade nova, 69094-060` — a rua Juliaca é oficialmente no bairro Nova Cidade, CEP 69097-405) → prioriza a rua digitada (mais específica) + nota de divergência + `via_cep` do CEP informado.
- Abreviações são expandidas antes do Nominatim (`av. djalma batista` → `Avenida Djalma Batista`).
- Sem rede em ViaCEP+Nominatim → `null` (chamador decide o fallback), nunca crash nem centróide não reportado.

### RF-013 — Resiliência de latência, Circuit Breaker e Cache (v1.1.0)

**Regra:** em situações de instabilidade ou lentidão da Overpass pública, a aplicação não deve prender o usuário em timeouts longos. Timeout por endpoint reduzido de 20s para 3.5s. Implementação de Circuit Breaker em memória: falha consecutiva abre o circuito por 60s, roteando requisições seguintes direto para o fallback com 0ms de espera. O fallback do Nominatim inclui obrigatoriamente `hospital`, `pronto socorro`, `upa`, `spa`, `ubs`, `policlinica`. Cache em memória LRU/TTL (10 min) armazena POIs por quadrante de coordenadas (~1km) e cache de geocodificação (30 min) para termos/CEPs idênticos. O caso de uso `/api/mcp/search-facilities` também herda o fallback resiliente em vez de responder 503.

**Critérios de aceite:**
- Timeout por endpoint da Overpass ≤ 3.500 ms (teste unitário).
- Circuit breaker abre após falhas e pula Overpass enquanto aberto (teste unitário).
- `searchAmenitiesNear` consulta termos que incluem `upa` e `spa` (teste unitário).
- Segunda consulta com mesma entrada geográfica responde instantaneamente via cache (teste unitário).
- `/api/mcp/search-facilities` degrada graciosamente com fallback quando Overpass falha (teste unitário).

### RF-014 — Foco interativo do mapa na seleção de unidade

**Regra:** quando o usuário clica em uma unidade de saúde na lista lateral de resultados ("Unidades de saúde encontradas"), o mapa deve navegar suavemente até as coordenadas exatas da unidade (`map.flyTo`), abrir automaticamente o balão informativo (popup) com seus detalhes e destacar o marcador correspondente.

**Critérios de aceite:**
- Componente `HealthMap` aceita prop `selectedFacility: Facility | null`.
- Ao receber `selectedFacility`, executa transição de visualização para `[facility.lat, facility.lng]` e abre o popup do marcador.
- Clicar no marcador do mapa atualiza o card lateral; clicar na lista lateral centraliza e abre popup no mapa (sincronização bidirecional).

## Fluxos

**Fluxo principal (sintoma):** mensagem (+ localização opcional) → validação → KB → geocodificação → Overpass → classificação → priorização → resposta (triagem + unidades + mapa + latências + disclaimer).

**Fluxo alternativo (busca direta):** "qual hospital mais proximo?" → KB (dir-02) → mesmo pipeline com tipo `emergencia` priorizado.

**Fluxo de erro:** JSON inválido → 400; payload fora do contrato → 400; Overpass falho → 200 com lista vazia e etapa marcada; Nominatim falho → coordenadas padrão; IA falho → fallback conservador.

## Modelo de dados (resposta `ProcessResponse`)

- `triage`: { level, facility_type, recommendation, explanation, warning_signs[], latency_ms }
- `facilities[]`: { id, name, type, address, lat, lng, distance_km, phone, emergency, operator, source }
- `map_data`: { center, user_location, facilities[] }
- `latencies`: { triage_ms, geocode_ms, search_ms, total_ms }
- `mcp_calls[]`: { tool, input, output, latency_ms }
- `disclaimer`
- `search_provider` / `search_failed` / `resolved_location`
- `location_precision` (RF-012) / `resolved_via_cep` (RF-012) / `location_note` (RF-012)

## Endpoints

| Método | Rota | Entrada | Saída |
|---|---|---|---|
| POST | `/api/mcp/process` | { message, location?, radius_km? (1–10), lat?, lng? } | ProcessResponse (com RF-012) |
| POST | `/api/mcp/search-facilities` | { lat, lng, radius_km?, types? } | { output: { facilities[], total }, latency_ms } |
| POST | `/api/mcp/geocode` | { address } | { output: { lat, lng, display_name, precision, source, via_cep?, note? } } |
| POST | `/api/mcp/triage` | { message } | { output: TriageResult } (503 sem chave) |
