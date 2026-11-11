# PRE-MORTEM — Health Triage Locator

Exercício: "o projeto falhou 6 meses após o lançamento. Por quê?" Cada causa recebe veredito: **mitigado** (com proteção implementada), **aceito** (limitação documentada) ou **pendente** (planejado).

| # | Causa da falha (hipótese) | Veredito | Evidência / Proteção |
|---|---|---|---|
| R-01 | **Dados OSM incompletos** — usuários veem unidades sem endereço ou cidades mal mapeadas e concluem que "não funciona" | ACEITO | ~25–40% sem `addr:*` em Manaus é falta do dado público, não do código (ADR-007); UI mostra "Endereço não disponível"; distâncias continuam corretas (Haversine com lat/lng reais) |
| R-02 | **Overpass bloqueia/limita** (HTTP 429/406/504) e a busca volta vazia em produção | MITIGADO | bbox `.toFixed(4)` (406 resolvido) **+ clamp a ±90/±180 (defeito de borda encontrado pela suíte adversarial em teste e corrigido)**, User-Agent obrigatório, fallback de 3 endpoints, timeout 20 s, `[timeout:25]` na query; contrato validado por stub (suíte adversarial R-02) |
| R-03 | **Classificação errada** — SPA/Policlínica viram "Emergência" e o usuário perde confiança | MITIGADO | ADR-003 (nome > tags) + ADR-004 (word-boundary); 112 testes unitários; E2E valida hospitais/SPAs/policlínicas por bairro |
| R-04 | **Mesmos 3 resultados sempre** — lógica de "mais próximo" não varia | MITIGADO | Ordenação por Haversine + priorização por tipo; E2E B5 confirma 4/4 bairros com #1 diferentes |
| R-05 | **Red team / abuso** — XSS via dados OSM, payload em `message`, campos desconhecidos, spam | MITIGADO | `escapeHtml` nos popups (XSS de dados OSM corrigido), React escapa UI, zod strictObject na borda, limites de tamanho, rate limit 30 req/min, CSP/HSTS em produção, erros sem stack trace; E2E B1/B6 e 30 testes de validação |
| R-06 | **Custo/timeout serverless** — Overpass lento estoura o limite da função na Vercel | MITIGADO | `maxDuration = 60`, timeouts curtos (20 s Overpass, 10 s Nominatim), fallback conservador sem IA; pendente: cache de respostas |
| R-07 | **Queda de Nominatim** muda a busca para coordenadas erradas | MITIGADO | falha → coordenadas padrão (Manaus) + resposta continua; nunca 500 |
| R-08 | **Chave de IA vazada** no repositório | MITIGADO | `.env*` no .gitignore, `.env.example` sem segredos, nenhum segredo no código; deploy usa env vars da plataforma |
| R-09 | **Empate/ambiguidade na KB** — entrada errada vence o match | MITIGADO | score + ordem estável; entrada combinada (dir-06) ordenada antes de dir-05; testes cobrem empates |
| R-10 | **Rate limit/bloqueio da Overpass no deploy cloud** (IPs de datacenter são mais vigiados) | MITIGADO (em parte ACEITO) | **Observado ao vivo em 2025 (sandbox de datacenter): conexão TCP à Overpass recusada** — `curl` exit 7, HTTP 000 nos 2 endpoints oficiais; o app degradou corretamente (triagem 200 + `failed: true` + smoke test S7 PASS com dependência caída). O bloqueio de rede do ambiente é externo ao código e ACEITO; cadeia de fallback + degradação graciosa implementados e comprovados. Runbook de produção: usar instância própria da Overpass se IPs da plataforma forem bloqueados |
| R-11 | **Regressão silenciosa** — correção num arquivo não chega ao outro (ocorrido no projeto!) | MITIGADO | lógica extraída para camadas únicas (`domain/facility-classifier`, `infrastructure/overpass`) — rotas viram controladores finos que compartilham os mesmos módulos; impossível divergir |
| R-12 | **Expectativa de diagnóstico médico** | ACEITO | disclaimers obrigatórios na resposta e na UI; sistema só classifica gravidade e aponta unidades |

## Conclusão

Os riscos que realmente derrubavam o sistema (R-02, R-03, R-04, R-11) foram reproduzidos em testes e corrigidos. Os riscos restantes são limitações de dados públicos (R-01) ou pendências de operação (R-06, R-10) já documentadas com caminho de mitigação.
