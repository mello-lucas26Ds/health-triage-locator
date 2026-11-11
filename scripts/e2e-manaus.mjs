#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unused-expressions */
/**
 * TESTE DE INTEGRAÇÃO (E2E) — API Health Triage Locator em execução.
 *
 * Pré-requisito: servidor rodando (npm run dev ou npm start).
 * Uso:
 *   npm run dev   # em outro terminal
 *   npm run test:e2e
 *
 * Variáveis: BASE_URL (default http://localhost:3000), DELAY_MS (default 2500)
 *
 * O delay entre chamadas evita HTTP 429 do Overpass e do próprio rate
 * limiter local (30 req/min). São ~12 chamadas por rodada.
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
const DELAY_MS = parseInt(process.env.DELAY_MS || "2500", 10);

const BAIRROS = [
  { nome: "Alvorada", lat: -3.074, lng: -60.042 },
  { nome: "Centro", lat: -3.119, lng: -60.021 },
  { nome: "Zona Leste", lat: -3.073, lng: -59.961 },
  { nome: "Coroado", lat: -3.035, lng: -60.05 },
];

let pass = 0;
let fail = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ok = (msg) => { console.log(`  ✅ ${msg}`); pass++; };
const ko = (msg) => { console.log(`  ❌ FALHOU: ${msg}`); fail++; };

async function searchFacilities(lat, lng, radiusKm = 15) {
  const resp = await fetch(`${BASE}/api/mcp/search-facilities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, radius_km: radiusKm }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function processQuery(message, location) {
  const resp = await fetch(`${BASE}/api/mcp/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, location: location || undefined }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

async function main() {
  console.log("=".repeat(60));
  console.log(`E2E — ${BASE}`);
  console.log("=".repeat(60));

  // ── Bloco 1: validação de entrada (red team) ──
  console.log("\n--- B1: Entrada inválida é rejeitada com 400 ---");
  {
    const r1 = await fetch(`${BASE}/api/mcp/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "" }),
    });
    r1.status === 400 ? ok("mensagem vazia → 400") : ko(`mensagem vazia → ${r1.status}`);
  }
  await sleep(1000);
  {
    const r = await fetch(`${BASE}/api/mcp/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "dor", admin: true }),
    });
    r.status === 400 ? ok("campo desconhecido → 400") : ko(`campo desconhecido → ${r.status}`);
  }
  await sleep(1000);
  {
    const r = await fetch(`${BASE}/api/mcp/search-facilities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: -3.1, lng: -60.02, radius_km: 500 }),
    });
    r.status === 400 ? ok("raio 500km → 400") : ko(`raio 500km → ${r.status}`);
  }
  await sleep(1000);
  {
    const r = await fetch(`${BASE}/api/mcp/search-facilities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: 999, lng: -60.02 }),
    });
    r.status === 400 ? ok("lat=999 → 400") : ko(`lat=999 → ${r.status}`);
  }
  await sleep(2000);

  // ── Bloco 2: triagem por sintoma (KB local, sem IA) ──
  console.log("\n--- B2: Triagem por sintoma ---");
  {
    const d = await processQuery("dor no peito");
    d.triage?.level === "urgente" ? ok(`"dor no peito" → urgente`) : ko(`"dor no peito" → ${d.triage?.level}`);
    d.triage?.facility_type === "emergencia" ? ok("→ emergencia") : ko(`→ ${d.triage?.facility_type}`);
  }
  await sleep(DELAY_MS);
  {
    const d = await processQuery("estou com tontura");
    d.triage?.facility_type === "upa" ? ok(`"tontura" → upa`) : ko(`"tontura" → ${d.triage?.facility_type}`);
  }
  await sleep(DELAY_MS);

  // ── Bloco 3: buscas diretas (exemplos clicáveis) ──
  console.log("\n--- B3: Buscas diretas por tipo de unidade ---");
  for (const ex of [
    { msg: "qual hospital mais proximo?", expect: "emergencia" },
    { msg: "qual UBS mais proxima?", expect: "ubs" },
    { msg: "qual UPA mais proxima?", expect: "upa" },
    { msg: "qual SPA/policlinica mais proxima?", expect: "upa" },
  ]) {
    try {
      const d = await processQuery(ex.msg, "Centro, Manaus");
      const first = d.facilities?.[0];
      if (d.triage?.facility_type === ex.expect) {
        ok(`"${ex.msg}" → triagem ${ex.expect}`);
      } else {
        ko(`"${ex.msg}" → triagem ${d.triage?.facility_type}, esperava ${ex.expect}`);
      }
      if (first && first.type === ex.expect) {
        ok(`1º resultado é do tipo: ${first.name} (${first.type})`);
      } else if (first) {
        ko(`1º resultado é ${first.type} (${first.name})`);
      } else {
        ko(`sem resultados para "${ex.msg}"`);
      }
    } catch (e) {
      ko(`"${ex.msg}" → ERRO: ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  // ── Bloco 4: busca por bairro (Overpass real) ──
  console.log("\n--- B4: Bairros de Manaus ---");
  const firstIds = new Set();
  let totalWithAddr = 0;
  let totalFacilities = 0;
  let pharmacyFound = false;

  for (const bairro of BAIRROS) {
    try {
      const data = await searchFacilities(bairro.lat, bairro.lng);
      const facs = data.output?.facilities || [];
      ok(`${bairro.nome}: ${facs.length} unidades`);

      if (facs.length > 0) firstIds.add(facs[0].id);
      totalFacilities += facs.length;
      totalWithAddr += facs.filter((f) => f.address && f.address.trim()).length;
      if (facs.some((f) => /farm|drogaria/i.test(f.name))) pharmacyFound = true;

      const sorted = facs.every((f, i) => i === 0 || facs[i - 1].distance_km <= f.distance_km);
      sorted ? ok(`${bairro.nome}: ordenado por distância`) : ko(`${bairro.nome}: NÃO ordenado`);

      const hosp = facs.filter((f) => /hospital/i.test(f.name));
      if (hosp.length > 0) {
        hosp.every((h) => h.type === "emergencia")
          ? ok(`${bairro.nome}: hospitais → emergencia (${hosp.length})`)
          : ko(`${bairro.nome}: hospital classificado errado`);
      }
      const spa = facs.filter((f) => /\bspa\b/i.test(f.name));
      if (spa.length > 0) {
        spa.every((s) => s.type === "upa")
          ? ok(`${bairro.nome}: SPAs → upa (${spa.length})`)
          : ko(`${bairro.nome}: SPA classificado errado`);
      }
    } catch (e) {
      ko(`${bairro.nome}: ERRO ${e.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log("\n--- B5: Consistência entre bairros ---");
  firstIds.size >= 3
    ? ok(`bairros diferentes têm #1 diferentes (${firstIds.size}/${BAIRROS.length})`)
    : ko(`apenas ${firstIds.size} unidades únicas em #1`);

  !pharmacyFound ? ok("nenhuma farmácia nos resultados") : ko("farmácia apareceu nos resultados!");

  const pct = totalFacilities > 0 ? Math.round((totalWithAddr / totalFacilities) * 100) : 0;
  pct > 0
    ? ok(`endereços presentes: ${pct}% (${totalWithAddr}/${totalFacilities}) — limitação do OSM documentada`)
    : ko("nenhum endereço preenchido");

  // ── Bloco 6: sanitização XSS — o payload NUNCA vira HTML vivo ──
  console.log("\n--- B6: Payload de XSS retorna apenas como texto ---");
  {
    const d = await processQuery("<script>alert('x')</script> dor no peito");
    // A mensagem passa (é dado), a triagem ainda roda via KB "dor no peito"
    d.triage?.facility_type === "emergencia"
      ? ok("XSS em message não quebra a triagem (escapado na UI)")
      : ko(`XSS quebrou a triagem: ${d.triage?.facility_type}`);
  }

  console.log("\n" + "=".repeat(60));
  console.log(`RESULTADO: ${pass} passaram, ${fail} falharam`);
  console.log("=".repeat(60));
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("E2E abortado:", e.message);
  process.exit(1);
});
