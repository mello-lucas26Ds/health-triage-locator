/**
 * Testes do fallback de busca de unidades via Nominatim.
 * FIXTURES: nomes e coordenadas REAIS capturados de consultas ao
 * Nominatim público (Manaus, 2025-11) durante a implementação.
 * Sem rede: o mapper é função pura.
 */

import { mapNominatimResultsToFacilities } from "@/infrastructure/nominatim";

const ORIGIN = { lat: -3.1019, lng: -60.025 };

// Fixture real: parte da resposta de q=hospital (bounded Manaus)
const REAL_HOSPITALS = [
  {
    place_id: 127,
    lat: "-3.1365",
    lon: "-59.9849",
    name: "Hospital Adventista de Manaus",
    display_name: "Hospital Adventista de Manaus, Manaus, Amazonas, Brasil",
    addresstype: "amenity",
    category: "amenity",
    type: "hospital",
  },
  {
    place_id: 128,
    lat: "-3.0741",
    lon: "-59.9623",
    name: "Hospital P S Dr João Lúcio P Machado",
    display_name: "Hospital P S Dr João Lúcio P Machado, Manaus, Amazonas, Brasil",
    addresstype: "amenity",
    category: "amenity",
    type: "hospital",
  },
  {
    place_id: 129,
    lat: "-3.119",
    lon: "-60.0031",
    name: "Hospital e Pronto-Socorro da Criança Zona Sul",
    display_name: "Hospital e Pronto-Socorro da Criança Zona Sul, Manaus, Amazonas, Brasil",
    addresstype: "amenity",
    category: "amenity",
    type: "hospital",
  },
];

// Fixture real: parte da resposta de q=UBS
const REAL_UBS = [
  {
    place_id: 200,
    lat: "-3.0995",
    lon: "-60.0401",
    name: "UBS Ajuricaba",
    display_name: "UBS Ajuricaba, Manaus, Amazonas, Brasil",
    addresstype: "amenity",
    category: "amenity",
    type: "clinic",
  },
];

describe("mapNominatimResultsToFacilities — mapeamento e classificação", () => {
  it("classifica Hospital por NOME como emergência (regra name-first)", () => {
    const facilities = mapNominatimResultsToFacilities(REAL_HOSPITALS, ORIGIN.lat, ORIGIN.lng, 10);
    const adventista = facilities.find((f) => f.name === "Hospital Adventista de Manaus");
    expect(adventista?.type).toBe("emergencia");
    expect(adventista?.source).toBe("OpenStreetMap (Nominatim)");
  });

  it("classifica UBS por NOME como ubs", () => {
    const facilities = mapNominatimResultsToFacilities(
      [...REAL_HOSPITALS, ...REAL_UBS],
      ORIGIN.lat,
      ORIGIN.lng,
      10
    );
    const ubs = facilities.find((f) => f.name === "UBS Ajuricaba");
    expect(ubs?.type).toBe("ubs");
  });

  it("calcula distância real: Hospital Adventista está a ~4,6 km do centro default", () => {
    const facilities = mapNominatimResultsToFacilities(REAL_HOSPITALS, ORIGIN.lat, ORIGIN.lng, 10);
    const adventista = facilities.find((f) => f.name === "Hospital Adventista de Manaus");
    expect(adventista).toBeDefined();
    expect(adventista!.distance_km).toBeGreaterThan(4);
    expect(adventista!.distance_km).toBeLessThan(6);
  });
});

describe("mapNominatimResultsToFacilities — filtragem anti-falso-positivo", () => {
  it("descarta POI sem nome", () => {
    const result = mapNominatimResultsToFacilities(
      [{ place_id: 1, lat: "-3.1", lon: "-60.0", addresstype: "amenity" }],
      ORIGIN.lat,
      ORIGIN.lng,
      10
    );
    expect(result).toHaveLength(0);
  });

  it("descarta VIA nomada 'UBS...' (addresstype highway — fixture real do Nominatim)", () => {
    const facilities = mapNominatimResultsToFacilities(
      [
        {
          place_id: 300,
          lat: "-3.0801",
          lon: "-60.0234",
          name: "UBS José Rayol dos Santos B/C",
          display_name: "UBS José Rayol dos Santos B/C, Manaus, Amazonas, Brasil",
          addresstype: "highway",
          category: "highway",
          type: "residential",
        },
      ],
      ORIGIN.lat,
      ORIGIN.lng,
      10
    );
    expect(facilities).toHaveLength(0);
  });

  it("descarta boundary/administrative (bairros e municípios não são unidades)", () => {
    const facilities = mapNominatimResultsToFacilities(
      [
        {
          place_id: 400,
          lat: "-3.1316",
          lon: "-59.9825",
          name: "Manaus",
          display_name: "Manaus, Amazonas, Brasil",
          addresstype: "municipality",
          category: "boundary",
          type: "administrative",
        },
      ],
      ORIGIN.lat,
      ORIGIN.lng,
      10
    );
    expect(facilities).toHaveLength(0);
  });

  it("elemento malformado (lat 'abc' / null) não quebra o lote", () => {
    const facilities = mapNominatimResultsToFacilities(
      [
        { place_id: 500, lat: "abc", lon: "def", name: "Quebrado", addresstype: "amenity" },
        null as unknown as { place_id: number },
        ...REAL_HOSPITALS,
      ],
      ORIGIN.lat,
      ORIGIN.lng,
      10
    );
    expect(facilities).toHaveLength(3);
  });
});

describe("mapNominatimResultsToFacilities — raio e dedup", () => {
  it("unidade além do raio é excluída (fronteira 1 km)", () => {
    const near = { place_id: 600, lat: "-3.1050", lon: "-60.0250", name: "Perto", addresstype: "amenity" };
    const far = { place_id: 601, lat: "-3.2000", lon: "-60.0250", name: "Longe", addresstype: "amenity" };
    const facilities = mapNominatimResultsToFacilities([near, far], ORIGIN.lat, ORIGIN.lng, 1);
    expect(facilities.map((f) => f.name)).toEqual(["Perto"]);
  });

  it("POI duplicado (amenity + building, mesmo nome a <100 m) aparece uma única vez", () => {
    const first = {
      place_id: 700,
      lat: "-3.1190",
      lon: "-60.0031",
      name: "Hospital e Pronto-Socorro da Criança Zona Leste",
      display_name: "Hospital e Pronto-Socorro da Criança Zona Leste",
      addresstype: "building",
    };
    const duplicate = {
      place_id: 701,
      lat: "-3.1191",
      lon: "-60.0032",
      name: "Hospital e Pronto-Socorro da Criança Zona Leste",
      display_name: "Hospital e Pronto-Socorro da Criança Zona Leste",
      addresstype: "amenity",
    };
    const facilities = mapNominatimResultsToFacilities(
      [first, duplicate],
      ORIGIN.lat,
      ORIGIN.lng,
      10
    );
    expect(facilities).toHaveLength(1);
  });

  it("ordenação estritamente crescente por distância", () => {
    const facilities = mapNominatimResultsToFacilities(
      [...REAL_HOSPITALS, ...REAL_UBS],
      ORIGIN.lat,
      ORIGIN.lng,
      10
    );
    for (let i = 1; i < facilities.length; i++) {
      expect(facilities[i].distance_km).toBeGreaterThanOrEqual(facilities[i - 1].distance_km);
    }
  });
});
