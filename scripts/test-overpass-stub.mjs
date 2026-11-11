#!/usr/bin/env node
/**
 * Stub da Overpass API para testes E2E locais (contract test).
 *
 * O sandbox de CI bloqueia overpass-api.de; este stub responde no mesmo
 * contrato (POST /api/interpreter → {elements: [...]}) com unidades
 * sintéticas realistas de Manaus (nomes reais verificados nos testes do
 * usuário). Valida todo o pipeline: rota → zod → use case → cliente
 * Overpass (bbox/headers) → classificação → priorização → resposta.
 *
 * Uso: node scripts/test-overpass-stub.mjs  (porta 9001)
 * O servidor Next deve iniciar com OVERPASS_API_URL=http://localhost:9001/api/interpreter
 */

import http from "node:http";

const PORT = 9001;

// Unidades sintéticas posicionadas perto dos bairros testados pelo e2e
const UNITS = [
  // Alvorada (-3.074, -60.042)
  { id: 1001, lat: -3.0755, lon: -60.0430, tags: { name: "Hospital e Maternidade Alvorada", amenity: "hospital", emergency: "yes", "addr:street": "Rua Professor Abílio Alencar", "addr:housenumber": "120", "addr:suburb": "Alvorada", "addr:city": "Manaus" } },
  { id: 1002, lat: -3.0730, lon: -60.0405, tags: { name: "SPA - Serviço de Pronto Atendimento do Alvorada", healthcare: "hospital", emergency: "yes", "addr:street": "Rua Djalma Batista", "addr:suburb": "Alvorada", "addr:city": "Manaus" } },
  { id: 1003, lat: -3.0722, lon: -60.0444, tags: { name: "UBS Alvorada II", healthcare: "centre", "addr:street": "Rua das Acácias", "addr:housenumber": "45", "addr:suburb": "Alvorada", "addr:city": "Manaus" } },
  { id: 1004, lat: -3.0748, lon: -60.0410, tags: { name: "Policlinida Redenção", healthcare: "hospital" } },
  { id: 1005, lat: -3.0740, lon: -60.0435, tags: { name: "Drogaria Araújo Alvorada", amenity: "pharmacy" } }, // deve ser excluída

  // Centro (-3.119, -60.021)
  { id: 2001, lat: -3.1205, lon: -60.0225, tags: { name: "Hospital e Pronto Socorro 28 de Agosto", amenity: "hospital", emergency: "yes", "addr:street": "Avenida Pedro Teixeira", "addr:housenumber": "25", "addr:suburb": "Centro", "addr:city": "Manaus" } },
  { id: 2002, lat: -3.1185, lon: -60.0200, tags: { name: "Policlínica Castelo Branco", healthcare: "hospital", emergency: "yes", "addr:suburb": "Centro", "addr:city": "Manaus" } },
  { id: 2003, lat: -3.1198, lon: -60.0230, tags: { name: "UPA 24h Centro", healthcare: "urgent_care" } },
  { id: 2004, lat: -3.1175, lon: -60.0205, tags: { name: "Unidade Básica de Saúde Mansour Bulbol", healthcare: "centre" } },
  { id: 2005, lat: -3.1210, lon: -60.0198, tags: { name: "Centro Odontológico Municipal", healthcare: "dentist" } }, // excluído

  // Zona Leste (-3.073, -59.961)
  { id: 3001, lat: -3.0740, lon: -59.9625, tags: { name: "Hospital Municipal Gilberto Mestrinho", amenity: "hospital", emergency: "yes" } },
  { id: 3002, lat: -3.0725, lon: -59.9600, tags: { name: "SPA São Raimundo", healthcare: "hospital", emergency: "yes" } },
  { id: 3003, lat: -3.0735, lon: -59.9595, tags: { name: "Policlínica Municipal Doutor Djalma Batista", healthcare: "hospital", emergency: "yes" } },
  { id: 3004, lat: -3.0720, lon: -59.9630, tags: { name: "Unidade de Saúde sem nome", healthcare: "centre" } },

  // Coroado (-3.035, -60.050)
  { id: 4001, lat: -3.0360, lon: -60.0515, tags: { name: "Hospital Adriano Jorge", amenity: "hospital", emergency: "yes", "addr:street": "Avenida Constantino Nery", "addr:housenumber": "4397", "addr:city": "Manaus" } },
  { id: 4002, lat: -3.0345, lon: -60.0490, tags: { name: "UBS Coroado", healthcare: "centre" } },
  { id: 4003, lat: -3.0355, lon: -60.0500, tags: { name: "Clínica Espaço Vida", amenity: "clinic" } }, // "espaço" NÃO deve virar UPA
  { id: 4004, lat: -3.0335, lon: -60.0520, tags: { name: "Pronto Socorro Mora Tapajós", healthcare: "hospital" } },

  // Longe (fora do raio de 15km) — deve ser filtrada
  { id: 9999, lat: -3.6, lon: -60.8, tags: { name: "UBS Muito Longe", healthcare: "centre" } },
];

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url.startsWith("/api/interpreter")) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = new URLSearchParams(body);
      const query = params.get("data") || "";

      // Verificar contrato: bbox presente e com 4 casas decimais
      const bboxMatch = query.match(/\((-?\d+\.\d{4}),(-?\d+\.\d{4}),(-?\d+\.\d{4}),(-?\d+\.\d{4})\)/);
      if (!bboxMatch) {
        res.writeHead(406, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "bbox inválido" }));
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        version: 0.6,
        generator: "stub-overpass",
        elements: UNITS.map((u) => ({ type: "node", id: u.id, lat: u.lat, lon: u.lon, tags: u.tags })),
      }));
    });
    return;
  }
  res.writeHead(404);
  res.end("not found");
});

server.listen(PORT, () => {
  console.log(`Stub Overpass rodando em http://localhost:${PORT}/api/interpreter (${UNITS.length} unidades sintéticas)`);
});
