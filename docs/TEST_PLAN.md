# TEST_PLAN — Health Triage Locator

## Escopo testado

- **Unitário + adversarial (Jest, sem rede):** KB de triagem, classificação de unidades, Haversine, validação zod, rate limiter, cliente Overpass (query builder + mapeamento), Nominatim (parsing/falha), falhas injetadas em dependências.
- **Smoke (servidor rodando, sem Overpass):** 17 verificações HTTP reais — triagem, validação, geocodificação, degradação graciosa, XSS.
- **E2E (servidor rodando + Overpass real ou stub):** 23 verificações — buscas de unidades por bairro de Manaus e consistência entre bairros.
- **Não testado no MVP:** deploy Vercel em produção (checklist manual abaixo).

## Comandos

```bash
npm test             # 198 testes unitários + adversariais (sem rede)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # build de produção
npm run dev          # terminal 1
npm run test:smoke   # terminal 2 — 17 verificações HTTP (não exige Overpass)
npm run test:e2e     # terminal 2 — 23 verificações E2E (exige Overpass ou stub)
node scripts/precision-5examples.mjs   # com o servidor no ar — 6 casos reais de CEP/endereço com asserts 1–10 km (RF-012)
```

## REGRAS DE GOAL VÁLIDO

Um "goal" (verificação) só conta se for:

1. **Observável** — via interface pública: resposta HTTP, retorno de função exportada, arquivo. Estado interno imaginado não conta.
2. **Mensurável** — valor exato ou faixa (`HTTP 400`, `level === "urgente"`, `toHaveLength(25)`), nunca "funciona bem".
3. **Automatizável** — passa/falha sem julgamento humano, com código de saída (Jest exit code, `smoke.mjs` exit 0/1).
4. **Rastreável** — liga a um RF-xx do SPEC e a um teste com nome (`describe`/`it` ou `check()` do smoke).
5. **Delimitado** — diz o que está fora do escopo (ex.: smoke não valida unidades reais — isso é E2E).

- Inválido: "o sistema deve detectar bem os sintomas".
- Válido: "RF-001: entrada 'dor no peito' produz `triage.level === 'urgente'` (teste: `health-kb.test.ts › KB › urgente`, + smoke S2)".

## Inventário de testes (contagem exata por ferramenta)

| Arquivo | Testes | O que valida | RFs |
|---|---|---|---|
| `src/tests/facility-classifier.test.ts` | 40 | Classificação nome-vs-tags, word-boundary, exclusões, priorização | RF-006/007/009 |
| `src/tests/validation.test.ts` | 27 | Bordas de entrada, strictObject, limites de raio/lat/lng | RF-010 |
| `src/tests/health-kb.test.ts` | 21 | Matching NFD, níveis de urgência, buscas diretas, fallback | RF-001/002/006 |
| `src/tests/location-parser.test.ts` | 22 | Detecção de CEP/endereço puro vs. sintoma na mensagem | RF-004 |
| `src/tests/geocode-precision.test.ts` | 29 | RF-012: precisão (addresstype→nível), abreviações, ViaCEP reverso, nota de divergência CEP×rua, fixtures reais de Manaus | RF-004/012 |
| `src/tests/nominatim-fallback.test.ts` | 10 | Mapper do fallback Nominatim: classificação, exclusões, raio, dedup | RF-005/009 |
| `src/tests/overpass-mapping.test.ts` | 14 | bbox 4 casas, exclusões, endereço, filtro de raio, ordenação | RF-005/008/009 |
| `src/tests/adversarial.test.ts` | 23 | Suíte adversarial derivada do PRE_MORTEM (abaixo) | R-01/02/05/06/07/09 |
| `src/tests/rate-limit.test.ts` | 6 | Janela, quota por IP, limpeza de expirados | RF-011 |
| `src/tests/geo.test.ts` | 6 | Haversine (pontos reais), arredondamento | RF-007 |
| `src/tests/resilience-cache.test.ts` | 8 | RF-013: Circuit breaker, timeout rápido, cache TTL e fallback com UPA/SPA | RF-013 |
| `scripts/smoke.mjs` | 17 | HTTP real: triagem, validação, geocodificação, degradação, XSS | RF-001/002/004/010 |
| `scripts/e2e-manaus.mjs` | 23 | HTTP real + Overpass: buscas por bairro, consistência, sanitização | RF-004/005/006/007/008 |
| `scripts/precision-5examples.mjs` | 6 casos | HTTP real + asserts de raio 1–10 km e precisão reportada (CEPs 69042-110/077/69094-060, Rua Juliaca, bairro, abreviação) | RF-004/012 |
| **Total** | **198 unit + 40 HTTP + 6 casos de precisão = 244** | | |

## Suíte adversarial (derivação do PRE_MORTEM — cada teste cita o risco)

| Risco | Testes em `adversarial.test.ts` |
|---|---|
| R-02 Overpass degrada | todos os endpoints 503 → erro explícito; 1º endpoint devolve HTML lixo → cadeia tenta o próximo; bbox com lat=90/lng=-180 + raio 50 km **clampado** a ±90/±180 |
| R-05 Red team | `__proto__` no payload rejeitado; RTL override (U+202E) tratado como dado; mensagem só de emoji/símbolos → fallback; path traversal + SQL como dado inerte; XSS dentro de tags OSM atravessa como texto |
| R-07 Nominatim caído/hostil | coordenadas com U+2212 (menos Unicode, copiado de README/UI) parseadas **sem rede**; rede rejeita → null; 503 → null; array vazio → null; lat/lng "abc" → null sem NaN; CEP com hífen parseia; centróide de CEP vem com nota de aproximação (RF-012) |
| R-09 KB sob ruído | MAIÚSCULAS + espaços casam; ruído adjacente casa a raiz; payload estilo injeção → texto comum |
| R-01/R-04 lote misturado | 50 elementos (25 válidos + 25 ruins + 2 malformados null/undefined) → só os 25 válidos, ordenados por distância; fronteira de raio incluída/excluída |
| R-06 flood | 200 requisições do mesmo IP → exatamente 30 passam; 500 IPs misturados → quotas independentes |

## Dados de teste

- Unitários: elementos sintéticos com nomes reais verificados em Manaus (SPA Joventina Dias, Policlínica Castelo Branco, Hospital 28 de Agosto, etc.) + injeção de falha via `fetch` stubado (sem rede).
- Smoke/E2E: 4 bairros com coordenadas reais (Alvorada −3.074/−60.042, Centro −3.119/−60.021, Zona Leste −3.073/−59.961, Coroado −3.035/−60.05).
- E2E sem Internet: `OVERPASS_API_URL=http://localhost:9001/api/interpreter` + `node scripts/test-overpass-stub.mjs` (contract test).

## O que os testes NÃO provam

- Disponibilidade da Overpass/Nominatim **agora** (stub prova o contrato, não o serviço ao vivo; smoke S8 valida Nominatim real, e a busca Overpass real depende de rede pública).
- Cobertura OSM de outras cidades (Manaus validado).
- Comportamento de rate limit **global** em serverless multi-instância (ADR-006 — limite por instância).
- Segurança além do escopo do MVP (sem pentest profissional).

## Critérios de aprovação

- `npm test` → 198/198.
- `npm run typecheck`, `npm run lint`, `npm run build` → 0 erros.
- `npm run test:smoke` → 17/17, exit 0.
- `node scripts/precision-5examples.mjs` (com servidor) → 6 casos, todos os asserts `geocoded=PASS` e `dentro-1-10km=PASS`, exit 0 (executado com evidência na entrega v1.1.0).
- `npm run test:e2e` → 23/23 (com Overpass real saudável ou stub local; em rede que bloqueia a Overpass, as verificações B3–B5 falham por ambiente — não reprova o código, ver PRE_MORTEM R-10).
- Qualquer falha unitária/smoke reprova o lote e bloqueia o deploy.

## Objetivos (metas) → casos de teste

| Meta | Requisito | Testes | Status |
|---|---|---|---|
| G1. Sintoma → triagem correta + unidade do tipo correto | RF-001/002/007 | `health-kb.test.ts` (21), smoke S2/S3, E2E B2 | ✅ |
| G2. Busca direta "qual hospital/UBS/UPA/SPA/policlínica mais próxima?" | RF-006 | `health-kb.test.ts` (buscas diretas), smoke S4, E2E B3 | ✅ |
| G3. Sem informação irrelevante nos resultados | RF-005 | `overpass-mapping.test.ts` (exclusões), adversarial (lote misturado), E2E B5 | ✅ |
| G4. Endereços quando o OSM tem | RF-008 | `overpass-mapping.test.ts` (buildAddress), E2E B5 | ✅ |
| G5. Bairro/cidade/rua/CEP → unidades mais próximas | RF-004/005 | smoke S8 (Nominatim real), E2E B4, `geocode-precision.test.ts` (29) + `precision-5examples.mjs` (6 casos com asserts 1–10 km) | ✅ |
| G6. Simulações de bairro de Manaus sem Internet | — | `scripts/test-overpass-stub.mjs` + stub de fetch na suíte adversarial | ✅ |
| G7. "Mais próximo" não repete sugestões entre locais | RF-007 | E2E B5, `geo.test.ts` (6), adversarial (ordenação) | ✅ |
| G8. Classificação hospital/clínica/policlínica/SPA/pronto socorro | RF-009 | `facility-classifier.test.ts` (40, incl. adversários "Espaço"/"pubs") | ✅ |
| G9. Tudo passa nos testes automatizados | — | 198 unit + 17 smoke = **215 verdes** (E2E 23 sob rede saudável; 6 casos de precisão com evidência v1.1.0) | ✅ |
| G10. Segurança concreta p/ deploy (red team) | RF-010/011 | `validation.test.ts` (27), `rate-limit.test.ts` (6), adversarial R-05/R-06 (9), smoke S5/S6 | ✅ |

## Checklist de deploy (Vercel)

1. Env vars: `DEFAULT_LAT`, `DEFAULT_LNG`, `SEARCH_RADIUS_KM`, opcional `GEMINI_API_KEY`, opcional `NOMINATIM_EMAIL`, `ALLOWED_ORIGINS` com o domínio final.
2. `ALLOWED_ORIGINS` **não** pode ficar `*` em produção.
3. Smoke test pós-deploy: `BASE_URL=https://seu-app.vercel.app npm run test:smoke` → 17/17.
4. Se IPs da Vercel forem bloqueados pela Overpass: definir `OVERPASS_API_URL` para instância própria (PRE_MORTEM R-10).
