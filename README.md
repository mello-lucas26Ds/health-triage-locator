# Health Triage Locator

Triagem de saúde em português que indica **para onde ir** (UBS, UPA/SPA, Policlínica ou Emergência/Hospital) e mostra no mapa as **unidades mais próximas do tipo correto**, com dados públicos do OpenStreetMap.

Funciona **com ou sem chave de IA**: a base de conhecimento local responde instantaneamente aos padrões conhecidos e a IA (opcional) cobre apenas os casos que ela não cobre.

---

## Novidades v1.1.0 — precisão de geocodificação (RF-012)

- **Cadeia CEP → Correios → OSM**: o CEP é decodificado no ViaCEP (rua/bairro oficiais) antes do Nominatim — o Nominatim público não indexa postcodes brasileiros.
- **ViaCEP reverso**: digitou a rua com bairro errado (ex.: "rua juliaca, cidade nova")? O sistema encontra o bairro/CEP oficial (Nova Cidade, 69097-405) e corrige.
- **Normalização**: `r.` → `Rua`, `tv` → `Travessa`, `nº 10` → `10`, etc.
- **Transparência de precisão**: o mapa exibe badge `precisão: nível da rua / bairro / centróide (aprox.)` e notas honestas (ex.: "a rua oficial do CEP não tem geometria no OSM; ponto aproximado"). Verde = exato; âmbar = aproximado.
- **Divergência CEP × rua**: se o CEP pertence a outra rua, o sistema prioriza a rua digitada (mais específica) e avisa.

---

## Requisitos

- **Node.js 18+** (recomendado 20+)
- npm (vem com o Node)
- Internet para geocodificação e busca de unidades (Nominatim/Overpass, APIs públicas e gratuitas — sem chave)

## Rodando no VS Code (3 passos)

```bash
# 1. instalar dependências exatas do lockfile
npm install

# 2. configurar ambiente (opcional — tem valores padrão)
copy .env.example .env.local    # Windows
# cp .env.example .env.local    # Linux/macOS

# 3. rodar
npm run dev
```

Abra `http://localhost:3000`.

### O que testar na interface

- Sintoma: `dor no peito` → triagem **URGENTE / Emergência** e hospitais primeiro no mapa.
- Sintoma: `estou com tontura` → **MODERADO / UPA**.
- Pergunta direta (botões clicáveis de exemplo): `qual hospital mais proximo?`, `qual UBS mais proxima?`, `qual SPA/policlinica mais proxima?`.
- Localização: `Alvorada, Manaus`, `Centro, Manaus`, CEP (`69042-110`, `69094-060`), rua+CEP (`rua juliaca, 10, cidade nova, 69094-060`) ou coordenadas `-3.07, -60.04`.
- Repare no badge **precisão** acima do mapa (nível da rua/bairro/centróide) e nas notas de aproximação quando o OSM não tem o dado completo.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (porta 3000) |
| `npm run build` | Build de produção |
| `npm start` | Roda o build de produção |
| `npm test` | **198 testes unitários + adversariais** (sem rede, rápidos) |
| `npm run test:smoke` | **17 verificações HTTP** contra `localhost:3000` (não exige Overpass) |
| `npm run test:e2e` | **23 verificações E2E** — precisa do servidor rodando e Overpass acessível |
| `node scripts/precision-5examples.mjs` | **6 casos reais** (CEPs + endereço misto) com asserts de precisão e raio 1–10 km — servidor no ar |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript sem emitir |

## Testes

```bash
npm test                        # unitários + adversariais (Jest, sem rede)
npm run dev                     # terminal 1
npm run test:smoke              # terminal 2 — 17 verificações HTTP
```

E2E completo (com unidades reais da Overpass):

```bash
npm run dev                     # terminal 1
npm run test:e2e                # terminal 2
```

Para o E2E sem depender da Internet (contract test da Overpass):

```bash
node scripts/test-overpass-stub.mjs        # terminal 1 — stub na porta 9001
# Windows PowerShell:  $env:OVERPASS_API_URL="http://localhost:9001/api/interpreter"; npm run dev
# Linux/macOS:         OVERPASS_API_URL=http://localhost:9001/api/interpreter npm run dev
npm run test:e2e                           # terminal 2
```

Detalhes de rastreio e regras de "goal válido": `docs/TEST_PLAN.md` (metas G1–G10 → testes, inventário com contagem exata).

## Variáveis de ambiente

Ver `.env.example`. Resumo:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DEFAULT_LAT` / `DEFAULT_LNG` | não | Coordenadas padrão (Manaus) |
| `SEARCH_RADIUS_KM` | não | Raio de busca (0.5–50, padrão 15) |
| `GEMINI_API_KEY` | não | Triagem por IA para sintomas fora da KB |
| `OVERPASS_API_URL` | não | Endpoint Overpass (default: lz4 + fallbacks) |
| `NOMINATIM_EMAIL` | não | Identificação educada na API pública do Nominatim |
| `ALLOWED_ORIGINS` | produção | Domínios liberados no CORS (nunca `*` em produção) |

## Arquitetura (resumo)

```text
src/
  domain/          # regras de negócio puras: KB de triagem, classificação,
                   # haversine, validação (zod), tipos
  application/     # casos de uso: pipeline MCP (process) e busca isolada
  infrastructure/  # integrações: Overpass, Nominatim, Gemini, rate-limit
  app/             # rotas HTTP finas + UI (App Router)
  components/      # mapa Leaflet, UI, helpers de apresentação
  proxy.ts         # rate limit de borda + headers de segurança + CORS
  tests/           # testes unitários + suíte adversarial
docs/              # PRD, SPEC, SDD, TEST_PLAN, architecture, PRE_MORTEM
scripts/           # smoke, E2E, stub Overpass
```

Documentação completa: [`docs/PRD.md`](docs/PRD.md) · [`docs/SPEC.md`](docs/SPEC.md) · [`docs/SDD.md`](docs/SDD.md) · [`docs/architecture.md`](docs/architecture.md) · [`docs/PRE_MORTEM.md`](docs/PRE_MORTEM.md).

## Deploy na Vercel

1. Suba o repositório no GitHub.
2. Na Vercel: *Import Project* → framework detecta Next.js automaticamente.
3. Configure as env vars (mínimo: `DEFAULT_LAT`, `DEFAULT_LNG`; recomendado: `ALLOWED_ORIGINS` com o domínio final).
4. Smoke test pós-deploy: `BASE_URL=https://seu-app.vercel.app npm run test:smoke` → 17/17.

Segurança já embutida: rate limiting (30 req/min/IP), validação estrita de entrada (zod), CSP + HSTS + headers Helmet-style, escape de HTML nos popups do mapa (dados OSM são de terceiros), erros sem detalhes internos. Limitações e pendências: `docs/PRE_MORTEM.md`.

## Subindo para o GitHub (o que versionar)

**Versionar:** código-fonte (`src/`, `docs/`, `scripts/`), `package.json`, `package-lock.json`, configs, `.env.example`, `.gitignore`, `README.md`, `AGENTS.md`.

**NUNCA versionar** (já bloqueado no `.gitignore`): `.env`, `.env.local` e qualquer segredo; `node_modules/`; `.next/`; `*.db`; logs; `coverage/`.

```bash
git init
git add .
git commit -m "feat: MVP de triagem e localização de unidades de saúde"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/health-triage-locator.git
git push -u origin main
```

CI recomendado (`.github/workflows/ci.yml`): `npm ci && npm run lint && npm run typecheck && npm test && npm run build` a cada push/PR.

## Limitações conhecidas

- **Número de porta**: o OSM tem a rua em Manaus, mas nem sempre o número — nesse caso a precisão declarada é "nível da rua (aprox.)" em vez de enganar com um ponto exato. Melhorar = comunidade editando o OSM (ou adapter opcional de geocodificação pago, ex.: Google, com chave própria).
- **CEP → coordenada pronta não é confiável**: serviços de CEP com coordenada (ex.: BrasilAPI) retornam o centróide do MUNICÍPIO para Manaus (medido: os 3 CEPs de teste retornam o mesmo ponto) — por isso a cadeia decodifica via Correios + OSM em vez de confiar nisso.
- Endereços vêm das tags `addr:*` do OpenStreetMap; em Manaus ~25–40% das unidades não têm essa tag no OSM — a distância continua correta, mas o endereço aparece como "não disponível". Melhorar o dado = editar o OSM.
- A cobertura de unidades depende do OSM por cidade (Manaus validado).
- A busca de unidades depende da Overpass (serviço público); se a rede do servidor for bloqueada, o app degrada com aviso transparente em vez de quebrar (ver PRE_MORTEM R-02/R-10).
- O sistema **não faz diagnóstico** — apenas orientação de gravidade e direcionamento. Emergência real: **192 (SAMU)**.

## Licença

Defina a licença do seu projeto antes de publicar (ex.: MIT para uso aberto).
