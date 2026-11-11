// Smoke test automatizado — verificações PASS/FAIL com código de saída 0/1.
//
// Escopo: o que funciona SEM a busca Overpass (triagem, validação, geocodificação,
// degradação graciosa). O E2E completo (com unidades reais) é `npm run test:e2e`.
//
// Uso: servidor rodando em BASE_URL (default http://localhost:3000).
//   node scripts/smoke.mjs

const BASE = process.env.BASE_URL || "http://localhost:3000";

let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failed++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function post(path, body) {
  const resp = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  let json = null;
  try {
    json = await resp.json();
  } catch {
    // corpo não-JSON é tratado pelo chamador
  }
  return { status: resp.status, json };
}

console.log("============================================================");
console.log(`SMOKE TEST — ${BASE}`);
console.log("============================================================\n");

// ── S1. Serviço no ar ──
const home = await fetch(BASE, { signal: AbortSignal.timeout(30_000) });
check("S1: UI responde 200", home.status === 200, `status=${home.status}`);

// ── S2. Triagem correta por KB ──
const triage = await post("/api/mcp/process", { message: "dor no peito no bairro Centro" });
check("S2: dor no peito → HTTP 200", triage.status === 200, `status=${triage.status}`);
check(
  "S2: level=urgente",
  triage.json?.triage?.level === "urgente",
  `recebido=${triage.json?.triage?.level}`
);
check(
  "S2: facility_type=emergencia",
  triage.json?.triage?.facility_type === "emergencia",
  `recebido=${triage.json?.triage?.facility_type}`
);
check(
  "S2: explica fonte do protocolo (Manchester)",
  String(triage.json?.triage?.explanation || "").includes("Manchester"),
  "explanation não menciona Manchester"
);
check(
  "S2: disclaimer médico presente",
  typeof triage.json?.disclaimer === "string" && triage.json.disclaimer.includes("192"),
  "disclaimer ausente ou sem 192"
);

// ── S3. Triagem moderada (fallback conservador, sem IA) ──
const fallback = await post("/api/mcp/process", { message: "ontem fui ao shopping" });
check("S3: sintoma desconhecido → HTTP 200", fallback.status === 200, `status=${fallback.status}`);
check(
  "S3: fallback conservador → moderado/upa",
  fallback.json?.triage?.level === "moderado" && fallback.json?.triage?.facility_type === "upa",
  `recebido=${fallback.json?.triage?.level}/${fallback.json?.triage?.facility_type}`
);

// ── S4. Busca direta por tipo via KB ──
const direct = await post("/api/mcp/process", { message: "qual UBS mais proxima?" });
check(
  "S4: 'qual UBS mais proxima?' → triagem ubs",
  direct.json?.triage?.facility_type === "ubs",
  `recebido=${direct.json?.triage?.facility_type}`
);

// ── S5. Validação de entrada (bordas) ──
const empty = await post("/api/mcp/process", { message: "" });
check("S5: mensagem vazia → 400", empty.status === 400, `status=${empty.status}`);

const unknown = await post("/api/mcp/process", { message: "oi", campo_inexistente: 1 });
check("S5: campo desconhecido → 400", unknown.status === 400, `status=${unknown.status}`);

const badLat = await post("/api/mcp/process", { message: "oi", lat: 999 });
check("S5: lat=999 → 400", badLat.status === 400, `status=${badLat.status}`);

const maxRadius = await post("/api/mcp/search-facilities", { lat: -3.1, lng: -60.02, radius_km: 50.1 });
check("S5: radius_km=50.1 → 400", maxRadius.status === 400, `status=${maxRadius.status}`);

const brokenJson = await post("/api/mcp/process", "{quebrado");
check("S5: JSON malformado → 400", brokenJson.status === 400, `status=${brokenJson.status}`);

// ── S6. XSS atravessa como DADO (nunca executado) ──
const xss = await post("/api/mcp/process", {
  message: "<script>alert('x')</script> dor de cabeça",
});
check(
  "S6: XSS em message → resposta 200 como texto",
  xss.status === 200 && typeof xss.json?.triage?.recommendation === "string",
  `status=${xss.status}`
);

// ── S7. Degradación graciosa quando dependência externa falha ──
const searchStep = triage.json?.mcp_calls?.find((c) => c.tool === "search_nearby_facilities");
check(
  "S7: etapa de busca sempre instrumentada (falha explícita, nunca crash)",
  Boolean(searchStep) && typeof searchStep.output?.failed === "boolean",
  "mcp_calls não contém search_nearby_facilities"
);

// ── S8. Geocodificação (Nominatim real) ──
const geo = await post("/api/mcp/geocode", { address: "Alvorada, Manaus" });
const geoOk =
  geo.status === 200 &&
  geo.json?.output?.lat > -3.2 &&
  geo.json?.output?.lat < -2.9 &&
  geo.json?.output?.lng > -60.1 &&
  geo.json?.output?.lng < -59.9;
check("S8: 'Alvorada, Manaus' → coordenadas dentro de Manaus", geoOk, `status=${geo.status}`);

console.log("\n============================================================");
console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
console.log("============================================================");
process.exit(failed > 0 ? 1 : 0);
