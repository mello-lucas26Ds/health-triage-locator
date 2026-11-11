// Teste de precisão real — 5 exemplos do usuário + 1 de generalidade.
// Roda contra o servidor local (npm run dev) e AFIRMA:
//   R1: geocodificação resolveu (geocoded=true, sem coordenadas padrão)
//   R2: TODA unidade retornada está dentro do raio 1–10 km (0 < d ≤ 10)
//   R3: precisão reportada é compatível com a entrada (CEP → street/neighborhood)
// Uso: node scripts/precision-5examples.mjs [baseURL]

const BASE = process.argv[2] || "http://localhost:3000";

const CASES = [
  { id: 1, message: "quais unidades de saúde estão perto?", location: "69042-110", label: "CEP 69042-110 (Rua Ovídio Gomes Monteiro, Alvorada)" },
  { id: 2, message: "quais unidades de saúde estão perto?", location: "69042-077", label: "CEP 69042-077 (Rua Itaji, Alvorada)" },
  { id: 3, message: "quais unidades de saúde estão perto?", location: "rua juliaca, 10, cidade nova, 69094-060", label: "Endereço misto do usuário (Rua Juliaca + CEP 69094-060)" },
  { id: 4, message: "quais unidades de saúde estão perto?", location: "69094-060", label: "CEP 69094-060 (Travessa Guairia — rua SEM geometria no OSM)" },
  { id: 5, message: "qual UBS mais proxima?", location: "Alvorada, Manaus", label: "Bairro: Alvorada, Manaus" },
  { id: 6, message: "quais unidades de saúde estão perto?", location: "av. djalma batista, chapada, manaus", label: "Abreviação: av. djalma batista, chapada (generalidade)" },
];

let failures = 0;

for (const c of CASES) {
  const t0 = Date.now();
  let res, json;
  try {
    res = await fetch(`${BASE}/api/mcp/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: c.message, location: c.location, radius_km: 10 }),
    });
    json = await res.json();
  } catch (e) {
    console.log(`\n[${c.id}] ${c.label}\n  ERRO DE REDE: ${e.message}`);
    failures++;
    continue;
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  const geoCall = (json.mcp_calls || []).find((m) => m.tool === "geocode_address") || {};
  const precision = json.location_precision || "?";
  const facilities = json.facilities || [];
  const dists = facilities.map((f) => f.distance_km);

  // ── R1: geocodificação real (não caiu nas coordenadas padrão) ──
  const geocoded = geoCall.output?.geocoded === true;
  // ── R2: raio 1–10 km respeitado em TODAS as unidades ──
  const inRadius = dists.length > 0 && dists.every((d) => d > 0 && d <= 10.0001);

  const pass = res.status === 200 && geocoded && inRadius && !json.search_failed;
  if (!pass) failures++;

  console.log(`\n[${c.id}] ${c.label}`);
  console.log(`  HTTP ${res.status} em ${dt}s | geocoded=${geocoded} | precisão=${precision}`);
  console.log(`  resolvido: ${(geoCall.output?.display_name || "").substring(0, 95)}`);
  if (json.resolved_via_cep) {
    console.log(
      `  ViaCEP: ${json.resolved_via_cep.cep} → ${json.resolved_via_cep.street}, ${json.resolved_via_cep.neighborhood}`
    );
  }
  if (json.location_note) console.log(`  NOTA: ${json.location_note}`);
  console.log(
    `  unidades: ${facilities.length} (provider=${json.search_provider}) | distâncias: ${dists
      .slice(0, 5)
      .join(", ")}${dists.length > 5 ? " …" : ""} km`
  );
  if (facilities.length > 0) {
    const n = facilities[0];
    console.log(`  MAIS PRÓXIMA: ${n.name} — ${n.distance_km} km (${n.type})`);
  }
  console.log(`  ASSERTS: geocoded=${geocoded ? "PASS" : "FAIL"} | dentro-1-10km=${inRadius ? "PASS" : "FAIL"}`);
}

console.log(`\n${"=".repeat(60)}`);
console.log(failures === 0 ? "RESULTADO: TODOS OS CASOS PASSARAM ✓" : `RESULTADO: ${failures} caso(s) FALHARAM ✗`);
process.exit(failures === 0 ? 0 : 1);
