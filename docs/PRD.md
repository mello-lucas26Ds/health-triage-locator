# PRD — Health Triage Locator

## Problema

No Brasil, a pessoa com um sintoma não sabe **para onde ir**: UBS, UPA, SPA, Policlínica ou Emergência hospitalar. Isso sobrecarrega emergências com casos leves e atrasa casos graves. Além disso, não há uma forma simples de ver, num mapa, **qual unidade do tipo correto é a mais próxima**.

## Objetivo

Aplicação web (MVP) que:

1. Classifica a gravidade relatada (leve / moderado / urgente) e indica o **tipo** de unidade adequado.
2. Localiza unidades de saúde reais próximas (OpenStreetMap) no mapa, **priorizando o tipo indicado pela triagem**.

## Usuários e jornada principal

- **Usuário leigo** com um sintoma:
  1. Digita o sintoma ("dor no peito") e a localização (bairro, rua, CEP — ex.: "Alvorada, Manaus").
  2. Recebe: nível de gravidade, orientação segura, e lista/mapa das unidades mais próximas **do tipo correto primeiro**.
- **Usuário que já sabe o que procura**:
  1. Pergunta direta: "qual hospital mais proximo?", "qual UBS mais proxima?", "qual SPA/policlinica mais proxima?".
  2. Recebe as unidades desse tipo, ordenadas por distância.

## Funcionalidades do MVP (essencial agora)

- RF-001 Triagem por base de conhecimento local (offline de IA, resposta < 1 ms).
- RF-002 Fallback conservador quando o sintoma não é conhecido (moderado/UPA).
- RF-003 Triagem por IA opcional (Gemini), apenas quando KB não cobre e a chave existe.
- RF-004 Geocodificação de bairro/rua/CEP/coordenadas (Nominatim).
- RF-005 Busca de unidades via Overpass/OpenStreetMap com exclusão de farmácias, dentistas e laboratórios.
- RF-006 Busca direta por tipo ("qual hospital/UBS/UPA/SPA/policlínica mais próxima?").
- RF-007 Priorização dos resultados pelo tipo indicado na triagem.
- RF-008 Exibição em mapa (Leaflet) + lista ordenada por distância, com endereço quando o OSM tem.
- RF-009 Validação estrita de entradas (zod) e rate limiting (30 req/min por IP).
- RF-010 Exemplos clicáveis que enviam a pergunta automaticamente.

## Fora do escopo (importante depois, não agora)

- Login/cadastro, histórico de consultas, banco de dados de usuários.
- Agendamento de consultas, fila de espera, integração com sistemas municipais.
- Backend RAG (Python) e IA generativa para contexto médico — removidos do MVP por não terem requisito que os exija hoje (registro de decisão, Fase 4 do relatório).
- Aplicativo móvel nativo, PWA instalável, notificações.
- Cobertura nacional curada (validado para Manaus; outras capitais funcionam conforme dados OSM).

## Premissas e restrições

- Dados de unidades vêm do OpenStreetMap — cobertura e endereços variam por cidade (limitação conhecida e aceita, ver PRE_MORTEM R-01).
- Serviços externos públicos (Overpass, Nominatim) têm rate limit próprio; o cliente usa fallback de endpoints e timeouts curtos.
- Sem chave de IA o sistema continua 100% funcional (KB + fallback).
- O sistema NÃO diagnostica — disclaimers obrigatórios na resposta e na UI.

## Métricas de sucesso (MVP)

- Triagem KB responde < 50 ms.
- Pipeline completo (com busca) responde < 10 s com Overpass saudável.
- 0 farmácias/dentistas nas recomendações (verificado por teste).
- Bairros diferentes retornam unidades #1 diferentes (verificado por teste).

## Critérios de aceite de alto nível

Todos os objetivos listados em `docs/TEST_PLAN.md` (G1–G10) passam nos testes unitários e no E2E antes do deploy.
