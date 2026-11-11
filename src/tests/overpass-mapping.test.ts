/**
 * Testes do mapeamento Overpass → Facilities (sem rede, dados sintéticos).
 * Cobrem: exclusões, classificação, bbox de float, endereço, filtro por raio.
 */

import { buildAddress, buildOverpassQuery, mapElementsToFacilities } from "@/infrastructure/overpass";

const ORIGIN = { lat: -3.1019, lng: -60.025 };

function element(overrides: Record<string, unknown>) {
  return {
    id: 1,
    lat: -3.11,
    lon: -60.03,
    tags: { name: "Unidade Teste", amenity: "clinic" },
    ...overrides,
  };
}

describe("buildOverpassQuery — bbox seguro", () => {
  it("bbox com 4 casas decimais (não permite float impreciso que causa HTTP 406)", () => {
    const q = buildOverpassQuery(-3.1019, -60.025, 15);
    expect(q).toContain("(-3.2369,-60.2050,-2.9669,-59.8450)");
  });

  it("nunca gera mais de 4 casas decimais no bbox", () => {
    const q = buildOverpassQuery(-3.1, -60.0, 10);
    const bboxPart = q.match(/\((-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+),(-?\d+\.\d+)\)/);
    expect(bboxPart).not.toBeNull();
    if (bboxPart) {
      for (let i = 1; i <= 4; i++) {
        expect(bboxPart[i].split(".")[1].length).toBe(4);
      }
    }
  });

  it("query inclui timeout e corpo com tags", () => {
    const q = buildOverpassQuery(-3.1, -60.0, 10);
    expect(q).toContain("[out:json][timeout:25]");
    expect(q).toContain("out center body");
  });
});

describe("buildAddress", () => {
  it("monta rua + número + bairro + cidade", () => {
    const addr = buildAddress({
      "addr:street": "Rua Professor Abílio Alencar",
      "addr:housenumber": "15",
      "addr:suburb": "Alvorada",
      "addr:city": "Manaus",
    });
    expect(addr).toBe("Rua Professor Abílio Alencar, 15, Alvorada, Manaus");
  });

  it("sem tags de endereço → string vazia", () => {
    expect(buildAddress({ name: "UBS X" })).toBe("");
  });
});

describe("mapElementsToFacilities", () => {
  it("classifica hospital por tag como emergencia", () => {
    const result = mapElementsToFacilities(
      [element({ tags: { name: "Hospital Geral", amenity: "hospital" } })],
      ORIGIN.lat,
      ORIGIN.lng,
      15
    );
    expect(result[0].type).toBe("emergencia");
  });

  it("exclui farmácia mesmo com healthcare válido", () => {
    const result = mapElementsToFacilities(
      [element({ tags: { name: "Farmácia Central", amenity: "pharmacy" } })],
      ORIGIN.lat,
      ORIGIN.lng,
      15
    );
    expect(result).toHaveLength(0);
  });

  it("exclui dentista", () => {
    const result = mapElementsToFacilities(
      [element({ tags: { name: "Odonto Plus", healthcare: "dentist" } })],
      ORIGIN.lat,
      ORIGIN.lng,
      15
    );
    expect(result).toHaveLength(0);
  });

  it("usa fallback de nome para unidade sem nome", () => {
    const result = mapElementsToFacilities(
      [element({ tags: { healthcare: "centre" } })],
      ORIGIN.lat,
      ORIGIN.lng,
      15
    );
    expect(result[0].name).toBe("Unidade de Saúde");
    expect(result[0].type).toBe("ubs");
  });

  it("usa center de way (polygon) quando lat/lon ausentes", () => {
    const result = mapElementsToFacilities(
      [element({ lat: undefined, lon: undefined, center: { lat: -3.12, lon: -60.04 } })],
      ORIGIN.lat,
      ORIGIN.lng,
      15
    );
    expect(result).toHaveLength(1);
    expect(result[0].lat).toBe(-3.12);
  });

  it("filtra unidades fora do raio", () => {
    const result = mapElementsToFacilities(
      [element({ lat: -3.5, lon: -60.5 })], // ~46 km de distância
      ORIGIN.lat,
      ORIGIN.lng,
      15
    );
    expect(result).toHaveLength(0);
  });

  it("ordena por distância", () => {
    const result = mapElementsToFacilities(
      [
        element({ id: 1, lat: -3.15, lon: -60.05, tags: { name: "Longe", healthcare: "centre" } }),
        element({ id: 2, lat: -3.103, lon: -60.026, tags: { name: "Perto", healthcare: "centre" } }),
      ],
      ORIGIN.lat,
      ORIGIN.lng,
      15
    );
    expect(result[0].name).toBe("Perto");
    expect(result[1].name).toBe("Longe");
    expect(result[0].distance_km).toBeLessThan(result[1].distance_km);
  });

  it("ignora coordenadas inválidas/ausentes sem quebrar", () => {
    const result = mapElementsToFacilities(
      [
        element({ lat: undefined, lon: undefined }),
        element({ lat: 999, lon: -9999 }), // fora dos limites do globo
      ],
      ORIGIN.lat,
      ORIGIN.lng,
      15
    );
    expect(result).toHaveLength(0);
  });

  it("phone e operator são propagados", () => {
    const result = mapElementsToFacilities(
      [element({ tags: { name: "UBS X", healthcare: "centre", phone: "+55 92 3000-0000", operator: "Prefeitura de Manaus" } })],
      ORIGIN.lat,
      ORIGIN.lng,
      15
    );
    expect(result[0].phone).toBe("+55 92 3000-0000");
    expect(result[0].operator).toBe("Prefeitura de Manaus");
  });
});
