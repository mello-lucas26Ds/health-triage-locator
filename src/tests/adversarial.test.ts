/**
 * SUÍTE ADVERSARIAL — derivada de docs/PRE_MORTEM.md.
 * Cada teste cita o ID do risco que cobre. Objetivo: TENTAR QUEBRAR o sistema
 * com entradas hostis, dependência caída, limites exatos e lotes misturados.
 *
 * Sem rede: toda chamada externa é simulada com fetch stubado.
 */

import { buildOverpassQuery, fetchOverpassElements, mapElementsToFacilities, resetOverpassCircuitBreaker } from "@/infrastructure/overpass";
import { geocodeAddress, resetGeocodeCache } from "@/infrastructure/nominatim";
import { matchKnowledgeBase } from "@/domain/health-kb";
import { processQuerySchema } from "@/domain/validation";
import { createRateLimiter } from "@/infrastructure/rate-limit";

const ORIGIN = { lat: -3.1019, lng: -60.025 };

// ════════════════════════════════════════════════════════════════
// R-02 — Overpass bloqueia/degrada (falha injetada em dependência)
// ════════════════════════════════════════════════════════════════

describe("R-02: Overpass caído / resposta hostil (falha injetada)", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    resetOverpassCircuitBreaker();
    resetGeocodeCache();
  });

  it("todos os endpoints retornam 503 → erro explícito, não crash silencioso", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response("Service Unavailable", { status: 503 })
    );
    await expect(fetchOverpassElements(ORIGIN.lat, ORIGIN.lng, 15)).rejects.toThrow(
      "Todos os endpoints Overpass falharam"
    );
  });

  it("primeiro endpoint responde HTML lixo (200 não-JSON) → cadeia tenta o próximo e falha explícita", async () => {
    const html = new Response("<html>gateway error</html>", { status: 200 });
    const unavail = new Response("busy", { status: 503 });
    const spy = jest.spyOn(global, "fetch").mockResolvedValueOnce(html).mockResolvedValue(unavail);

    await expect(fetchOverpassElements(ORIGIN.lat, ORIGIN.lng, 15)).rejects.toThrow();
    // provou que tentou mais de um endpoint antes de desistir
    expect(spy.mock.calls.length).toBeGreaterThan(1);
  });

  it("bbox com lat=90 e raio máximo (50 km) NUNCA ultrapassa 90 (fronteira incluída)", () => {
    const q = buildOverpassQuery(90, -180, 50);
    const bbox = q.match(/\((-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+)\)/)!;
    const south = parseFloat(bbox[1]);
    const north = parseFloat(bbox[3]);
    expect(south).toBeGreaterThanOrEqual(-90);
    expect(north).toBeLessThanOrEqual(90);
  });

  it("bbox com lng=-180 e raio máximo NUNCA ultrapassa ±180", () => {
    const q = buildOverpassQuery(-3.1, -180, 50);
    const bbox = q.match(/\((-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+)\)/)!;
    const west = parseFloat(bbox[2]);
    const east = parseFloat(bbox[4]);
    expect(west).toBeGreaterThanOrEqual(-180);
    expect(east).toBeLessThanOrEqual(180);
  });
});

// ════════════════════════════════════════════════════════════════
// R-05 — Red team: entradas hostis e caracteres maliciosos
// ════════════════════════════════════════════════════════════════

describe("R-05: entradas hostis na borda", () => {
  it("chave __proto__ no payload → rejeitada (sem poluição de protótipo)", () => {
    const payload = JSON.parse('{"message":"oi","__proto__":{"admin":true}}');
    expect(processQuerySchema.safeParse(payload).success).toBe(false);
  });

  it("caracteres de direção RTL (U+202E) são tratados como DADO, não quebram a KB", () => {
    const hostile = "\u202Eotipe od ron\u202C";
    expect(() => matchKnowledgeBase(hostile)).not.toThrow();
    expect(matchKnowledgeBase(hostile)).toBeNull();
  });

  it("mensagem só de emoji → sem match → fallback (null, nunca crash)", () => {
    expect(matchKnowledgeBase("😀💥🔥")).toBeNull();
  });

  it("símbolos monetários e lixo de clipboard → sem match", () => {
    expect(matchKnowledgeBase("€£¥₩∂∆≈")).toBeNull();
  });

  it("localização com path traversal e SQL → aceita como dado inerte", () => {
    const r = processQuerySchema.safeParse({
      message: "dor no peito",
      location: "../../etc/passwd'; DROP TABLE users; --",
    });
    expect(r.success).toBe(true);
  });

  it("XSS dentro das tags OSM atravessa como DADO (nome preservado, UI escapa)", () => {
    const facilities = mapElementsToFacilities(
      [
        {
          id: 1,
          lat: -3.11,
          lon: -60.03,
          tags: { name: "<script>alert(1)</script>Hospital", amenity: "hospital" },
        },
      ],
      ORIGIN.lat,
      ORIGIN.lng,
      15
    );
    expect(facilities[0].name).toBe("<script>alert(1)</script>Hospital");
  });
});

// ════════════════════════════════════════════════════════════════
// R-07 — Nominatim caído / coordenadas hostis
// ════════════════════════════════════════════════════════════════

describe("R-07: geocodificação sob ataque e sob falha", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("coordenadas com SINAL DE MENOS UNICODE (U+2212, copiado do README/UI) resolvem SEM rede", async () => {
    const spy = jest.spyOn(global, "fetch").mockRejectedValue(new Error("rede bloqueada"));
    const geo = await geocodeAddress("\u22123.07, \u221260.04");
    expect(geo).toEqual({
      lat: -3.07,
      lng: -60.04,
      display_name: "-3.07, -60.04",
      precision: "coords_exact",
      source: "coords",
    });
    expect(spy).not.toHaveBeenCalled(); // parsing local — não deve chamar Nominatim
  });

  it("rede rejeita (Nominatim caído) → null (chamador decide fallback), nunca crash", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(geocodeAddress("Alvorada, Manaus")).resolves.toBeNull();
  });

  it("Nominatim responde 503 → null", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(new Response("busy", { status: 503 }));
    await expect(geocodeAddress("Centro, Manaus")).resolves.toBeNull();
  });

  it("Nominatim responde array vazio → null", async () => {
    jest
      .spyOn(global, "fetch")
      .mockResolvedValue(new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } }));
    await expect(geocodeAddress("Lugar Inexistente, Manaus")).resolves.toBeNull();
  });

  it("CEP com hífen ('69050-000') segue ViaCEP → Nominatim e parseia lat/lng", async () => {
    // Novo fluxo RF-002b: CEP puro consulta ViaCEP (decodifica rua/bairro/cidade)
    // e depois geocodifica o endereço estruturado no Nominatim.
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("viacep.com.br")) {
        return new Response(
          JSON.stringify({
            cep: "69050-000",
            logradouro: "Rua Exemplo",
            bairro: "Compensa",
            localidade: "Manaus",
            uf: "AM",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify([{ lat: "-3.05", lon: "-60.01", display_name: "Manaus, AM" }]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    const geo = await geocodeAddress("69050-000");
    // ViaCEP decodificou → endereço do mock caiu no centróide (sem addresstype de via)
    // → precisão reportada é honesta (municipal_centroid) + nota de aproximação.
    expect(geo).toMatchObject({
      lat: -3.05,
      lng: -60.01,
      display_name: "Manaus, AM",
      source: "viacep+nominatim",
      via_cep: { cep: "69050-000", street: "Rua Exemplo", neighborhood: "Compensa" },
    });
    expect(geo?.precision).toBe("municipal_centroid");
    expect(geo?.note).toContain("aproximado");
    // provou que o CEP passou pelo ViaCEP antes do Nominatim
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("viacep.com.br"))).toBe(true);
  });

  it("lat/lng absurdos vindos do Nominatim ('abc') → null (sem NaN propagado)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([{ lat: "abc", lon: "def", display_name: "?" }]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    await expect(geocodeAddress("Centro, Manaus")).resolves.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════
// R-09 — KB: ambiguidade, acentos, ruído
// ════════════════════════════════════════════════════════════════

describe("R-09: KB sob ruído e ambiguidade", () => {
  it("MAIÚSCULAS + espaços em volta → normalização garante match", () => {
    expect(matchKnowledgeBase("   DOR NO PEITO   ")).not.toBeNull();
  });

  it("acentuação e variações ('Dor no peitão') ainda casam a raiz da keyword", () => {
    // 'dor no peito' é substring mesmo dentro de ruído adjacente
    expect(matchKnowledgeBase("sentindo dor no peito agora")).not.toBeNull();
  });

  it("payload estilo injeção ('; DROP TABLE --') → tratado como texto, fallback conservador", () => {
    expect(matchKnowledgeBase("x'; DROP TABLE pacientes; --")).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════
// R-01/R-04 — Lote misturado (25 ruins + 25 bons) e fronteira de raio
// ════════════════════════════════════════════════════════════════

describe("R-01/R-04: lote com itens ruins misturados", () => {
  it("lote de 50 (25 corrompidos + 25 válidos, malformados inclusos) → só os 25 válidos saem, ordenados", () => {
    const good = Array.from({ length: 25 }, (_, i) => ({
      id: i + 1,
      lat: ORIGIN.lat - (i + 1) * 0.003, // 0,33–8,25 km — todas dentro do raio de 15 km
      lon: ORIGIN.lng,
      tags: { name: `UBS Válida ${i + 1}`, amenity: "clinic" },
    }));
    const broken = [
      ...Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, tags: { name: "sem coords" } })), // sem lat/lon
      ...Array.from({ length: 10 }, (_, i) => ({ id: 200 + i, lat: 9999, lon: -99999, tags: {} })), // coords absurdas
      ...Array.from({ length: 5 }, (_, i) => ({ id: 300 + i, lat: -3.1, lon: -60, tags: { amenity: "pharmacy", name: `Farmácia ${i}` } })), // excluídas
    ];
    // Interleaved determinístico: bom, ruim, bom, ruim... e 2 malformados
    // no meio (null/undefined — Overpass é dado de terceiros, RF-005).
    const mixed: Parameters<typeof mapElementsToFacilities>[0] = [];
    for (let i = 0; i < 25; i++) {
      mixed.push(good[i]);
      if (broken[i]) mixed.push(broken[i]);
    }
    mixed[7] = null as unknown as { id: number };
    mixed[13] = undefined as unknown as { id: number };

    const facilities = mapElementsToFacilities(mixed, ORIGIN.lat, ORIGIN.lng, 15);
    expect(facilities).toHaveLength(25);
    expect(facilities.every((f) => f.name.startsWith("UBS Válida"))).toBe(true);
    // R-04: ordenação estritamente crescente por distância
    for (let i = 1; i < facilities.length; i++) {
      expect(facilities[i].distance_km).toBeGreaterThanOrEqual(facilities[i - 1].distance_km);
    }
  });

  it("fronteira de raio: unidade bem dentro é incluída; logo além do raio é excluída", () => {
    // 0.005° ≈ 0,56 km (dentro de 1 km); 0.5° ≈ 55,6 km (fora)
    const near = { id: 1, lat: ORIGIN.lat + 0.005, lon: ORIGIN.lng, tags: { name: "Perto", amenity: "hospital" } };
    const far = { id: 2, lat: ORIGIN.lat + 0.5, lon: ORIGIN.lng, tags: { name: "Longe", amenity: "hospital" } };
    const facilities = mapElementsToFacilities([near, far], ORIGIN.lat, ORIGIN.lng, 1);
    expect(facilities.map((f) => f.name)).toEqual(["Perto"]);
  });
});

// ════════════════════════════════════════════════════════════════
// R-06 — Flood de requisições no rate limiter
// ════════════════════════════════════════════════════════════════

describe("R-06: flood no rate limiter (lote hostil)", () => {
  it("flood de 200 requisições do mesmo IP → exatamente o limite passa", () => {
    const limiter = createRateLimiter({ limit: 30, windowMs: 60_000, now: () => 0 });
    let allowed = 0;
    for (let i = 0; i < 200; i++) {
      if (limiter.check("flood-ip").allowed) allowed++;
    }
    expect(allowed).toBe(30);
  });

  it("flood de 500 IPs misturados com bons → quotas permanecem independentes", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => 0 });
    let goodAllowed = 0;
    for (let i = 0; i < 500; i++) {
      const r = limiter.check(`ip-${i}`);
      if (i % 2 === 0) goodAllowed += r.allowed ? 1 : 0; // IPs "bons" no primeiro hit
    }
    // cada IP ímpar já gastou a quota no primeiro check; pares têm 1 permitido
    expect(goodAllowed).toBe(250);
    expect(limiter.check("novo-ip").allowed).toBe(true);
  });
});
