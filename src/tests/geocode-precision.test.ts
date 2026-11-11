/**
 * Testes de precisão da geocodificação (RF-002c — transparência).
 * FIXTURES REAIS capturadas de ViaCEP/Nominatim (Manaus, 2025-11):
 *  - CEP 69042-110  → Rua Ovídio Gomes Monteiro, Alvorada (OSM: street-level)
 *  - CEP 69042-077  → Rua Itaji, Alvorada (OSM: street-level)
 *  - CEP 69094-060  → Travessa Guairia, Cidade Nova (NÃO existe no OSM!)
 *  - "Rua Juliaca"  → bairro oficial Nova Cidade, CEP 69097-405 (ViaCEP reverso)
 *  - "Rua Juliaca 10" → OSM sem número de porta → cai no nível da rua
 * Fluxos de rede usam global.fetch mockado — determinísticos, sem rede real.
 */

import {
  buildCepMismatchNote,
  extractStreetPhrase,
  formatCep,
  geocodeAddress,
  lookupStreetViaCep,
  mapAddresstypeToPrecision,
  normalizeAddressAbbreviations,
  resetGeocodeCache,
  segmentCandidates,
} from "@/infrastructure/nominatim";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org";
const VIACEP_URL = "https://viacep.com.br/ws";

// ─────────────────────────── Helpers puros ───────────────────────────

describe("mapAddresstypeToPrecision — addresstype do Nominatim → nível", () => {
  it("house/building/address → house", () => {
    expect(mapAddresstypeToPrecision("house")).toBe("house");
    expect(mapAddresstypeToPrecision("building")).toBe("house");
    expect(mapAddresstypeToPrecision("address")).toBe("house");
  });

  it("tipos de via reais (residential/tertiary) → street", () => {
    expect(mapAddresstypeToPrecision("residential")).toBe("street");
    expect(mapAddresstypeToPrecision("tertiary")).toBe("street");
    expect(mapAddresstypeToPrecision("secondary")).toBe("street");
  });

  it("bairro/suburb → neighborhood; cidade → city", () => {
    expect(mapAddresstypeToPrecision("neighbourhood")).toBe("neighborhood");
    expect(mapAddresstypeToPrecision("suburb")).toBe("neighborhood");
    expect(mapAddresstypeToPrecision("city")).toBe("city");
    expect(mapAddresstypeToPrecision("municipality")).toBe("city");
  });

  it("administrative/postal_code/desconhecido/vazio → municipal_centroid", () => {
    expect(mapAddresstypeToPrecision("administrative")).toBe("municipal_centroid");
    expect(mapAddresstypeToPrecision("postal_code")).toBe("municipal_centroid");
    expect(mapAddresstypeToPrecision("tipo_inexistente")).toBe("municipal_centroid");
    expect(mapAddresstypeToPrecision(undefined)).toBe("municipal_centroid");
  });
});

describe("normalizeAddressAbbreviations — abreviações brasileiras", () => {
  it('expande "r." → "Rua" e mantém o restante', () => {
    expect(normalizeAddressAbbreviations("r. juliaca")).toBe("Rua juliaca");
  });

  it('expande "av"/"tv" sem ponto ("tv guairia" → "Travessa guairia")', () => {
    expect(normalizeAddressAbbreviations("tv guairia")).toBe("Travessa guairia");
    expect(normalizeAddressAbbreviations("av djalma batista")).toBe("Avenida djalma batista");
  });

  it('"Rua Juliaca" (já por extenso) permanece intacto', () => {
    expect(normalizeAddressAbbreviations("Rua Juliaca")).toBe("Rua Juliaca");
  });

  it('remove marcador de número: "rua juliaca n 10" → "... 10" / "nº 10" → "10"', () => {
    expect(normalizeAddressAbbreviations("rua juliaca n 10")).toBe("rua juliaca 10");
    expect(normalizeAddressAbbreviations("rua juliaca nº 10")).toBe("rua juliaca 10");
  });

  it("tve (mais longo) vence tv na ordem de expansão", () => {
    expect(normalizeAddressAbbreviations("tve guairia")).toBe("Travessa guairia");
  });

  it("não expande token que faz parte de outra palavra (fronteira \\b)", () => {
    expect(normalizeAddressAbbreviations("Rua Alianca")).toBe("Rua Alianca");
  });
});

describe("extractStreetPhrase — frase da rua para busca reversa", () => {
  it('extrai "Rua Juliaca" de "Rua Juliaca, 10, Cidade Nova, Manaus"', () => {
    expect(extractStreetPhrase("Rua Juliaca, 10, Cidade Nova, Manaus")).toBe("Rua Juliaca");
  });

  it('extrai "Avenida Djalma Batista" de endereço completo', () => {
    expect(extractStreetPhrase("Avenida Djalma Batista, Chapada, Manaus")).toBe(
      "Avenida Djalma Batista"
    );
  });

  it("retorna null para texto sem tipo de via (só bairro/cidade)", () => {
    expect(extractStreetPhrase("Alvorada, Manaus")).toBeNull();
    expect(extractStreetPhrase("Cidade Nova, Manaus")).toBeNull();
  });
});

describe("segmentCandidates — candidatos por segmentos", () => {
  it("rua + bairro + cidade → [rua+cidade, rua]", () => {
    expect(segmentCandidates("Rute Juliaca, Cidade Nova, Manaus")).toEqual([
      "Rute Juliaca, Manaus",
      "Rute Juliaca",
    ]);
  });

  it("texto sem vírgulas → [] (não há o que refinar)", () => {
    expect(segmentCandidates("Manaus")).toEqual([]);
  });
});

describe("formatCep", () => {
  it("69042110 → 69042-110", () => expect(formatCep("69042110")).toBe("69042-110"));
  it("formato inválido volta sem máscara", () => expect(formatCep("123")).toBe("123"));
});

describe("buildCepMismatchNote — divergência CEP × rua digitada", () => {
  const CEP_JULIACA_FIXTURE = { cep: "69097-405", street: "Rua Juliaca", neighborhood: "Nova Cidade" };

  it("mesma rua do CEP no display_name → sem nota (caso normal)", () => {
    expect(
      buildCepMismatchNote(CEP_JULIACA_FIXTURE, "Rua Juliaca, Nova Cidade, Manaus, Amazonas")
    ).toBeUndefined();
  });

  it("CEP aponta para outra rua → nota explica a prioridade da rua digitada", () => {
    const note = buildCepMismatchNote(
      { cep: "69094-060", street: "Travessa Guairia", neighborhood: "Cidade Nova" },
      "Rua Juliaca, Nova Cidade, Manaus, Amazonas"
    );
    expect(note).toContain("69094-060");
    expect(note).toContain("Travessa Guairia");
  });
});

// ────────────────────── Fluxos com fetch mockado ──────────────────────

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

// Fixtures reais (curl ViaCEP 2025-11)
const VIACEP_69094060 = {
  cep: "69094-060",
  logradouro: "Travessa Guairia",
  bairro: "Cidade Nova",
  localidade: "Manaus",
  uf: "AM",
};
const NOMINATIM_CIDADE_NOVA = [
  {
    lat: "-3.0401",
    lon: "-59.9567",
    display_name: "Cidade Nova, Manaus, Amazonas, Região Norte, Brasil",
    addresstype: "neighbourhood",
    category: "boundary",
    type: "administrative",
  },
];
const NOMINATIM_RUA_JULIACA = [
  {
    lat: "-3.0019505",
    lon: "-59.9764231",
    display_name: "Rua Juliaca, Nova Cidade, Manaus, Amazonas, Região Norte, Brasil",
    addresstype: "residential",
    category: "highway",
    type: "residential",
  },
];

describe("lookupStreetViaCep — busca reversa (fixture real: Rua Juliaca)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("AM/Manaus/Juliaca → CEP 69097-405, bairro Nova Cidade (dados reais do ViaCEP)", async () => {
    const spy = jest
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        jsonResponse([
          {
            cep: "69097-405",
            logradouro: "Rua Juliaca",
            bairro: "Nova Cidade",
            localidade: "Manaus",
            uf: "AM",
          },
        ])
      );
    const result = await lookupStreetViaCep("AM", "Manaus", "Rua Juliaca");
    expect(result).toEqual({
      cep: "69097-405",
      street: "Rua Juliaca",
      neighborhood: "Nova Cidade",
      city: "Manaus",
      state: "AM",
    });
    expect(spy.mock.calls[0][0]).toContain("/AM/Manaus/Rua%20Juliaca/json/");
  });

  it("rua sem CEP associado ([]) → null", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(jsonResponse([]));
    await expect(lookupStreetViaCep("AM", "Manaus", "Rua Inexistente")).resolves.toBeNull();
  });

  it("ViaCEP fora do ar (throw) → null, sem propagar exceção", async () => {
    jest.spyOn(global, "fetch").mockRejectedValueOnce(new Error("boom"));
    await expect(lookupStreetViaCep("AM", "Manaus", "Rua Juliaca")).resolves.toBeNull();
  });
});

describe("geocodeAddress — fluxos do usuário com fetch mockado", () => {
  beforeEach(() => {
    resetGeocodeCache();
  });
  afterEach(() => {
    jest.restoreAllMocks();
    resetGeocodeCache();
  });

  it("coordenadas diretas: sem rede, precision = coords_exact", async () => {
    const spy = jest.spyOn(global, "fetch");
    const result = await geocodeAddress("-3.0744, -60.0424");
    expect(result?.precision).toBe("coords_exact");
    expect(result?.source).toBe("coords");
    expect(spy).not.toHaveBeenCalled();
  });

  it('CEP 69094-060: rua oficial (Travessa Guairia) NÃO existe no OSM → cai no bairro com nota honesta', async () => {
    // Sequência real medida: ViaCEP ok → query rua [] → query bairro ok (neighbourhood)
    jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith(VIACEP_URL)) return jsonResponse(VIACEP_69094060);
      if (url.includes(encodeURIComponent("Travessa Guairia"))) return jsonResponse([]);
      return jsonResponse(NOMINATIM_CIDADE_NOVA);
    });
    const result = await geocodeAddress("69094-060");
    expect(result?.precision).toBe("neighborhood");
    expect(result?.source).toBe("viacep+nominatim");
    expect(result?.via_cep?.street).toBe("Travessa Guairia");
    expect(result?.note).toContain("não tem geometria no OpenStreetMap");
  });

  it('"rua juliaca, 10, cidade nova, 69094-060": rua digitada vence + nota de divergência do CEP', async () => {
    // Nominatim resolve o texto completo (Rua Juliaca); ViaCEP do CEP embutido
    // aponta para Travessa Guairia → mismatch é reportado com transparência.
    jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith(VIACEP_URL)) return jsonResponse(VIACEP_69094060);
      return jsonResponse(NOMINATIM_RUA_JULIACA);
    });
    const result = await geocodeAddress("rua juliaca, 10, cidade nova, 69094-060");
    expect(result?.display_name).toContain("Rua Juliaca");
    expect(result?.precision).toBe("street"); // OSM não tem número de porta
    expect(result?.via_cep?.street).toBe("Travessa Guairia");
    expect(result?.note).toContain("69094-060");
  });

  it('"Travessa Guairia, Manaus" (rua dos Correios sem OSM, sem CEP) → ViaCEP reverso → bairro com via_cep', async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith(VIACEP_URL)) {
        // Busca reversa /AM/Manaus/Travessa%20Guairia/json/ — fixture real do ViaCEP
        if (url.includes("Travessa%20Guairia")) return jsonResponse([VIACEP_69094060]);
        return jsonResponse([]);
      }
      // Nominatim: rua não existe no OSM ([]) — só o bairro acerta
      if (url.includes("Travessa+Guairia")) return jsonResponse([]);
      return jsonResponse(NOMINATIM_CIDADE_NOVA);
    });
    const result = await geocodeAddress("Travessa Guairia, Manaus");
    expect(result?.precision).toBe("neighborhood");
    expect(result?.source).toBe("viacep+nominatim");
    expect(result?.via_cep?.street).toBe("Travessa Guairia");
    expect(result?.via_cep?.cep).toBe("69094-060");
  });

  it('"Juliaca, Cidade Nova, Manaus" (sem tipo de via) → 1º segmento + ViaCEP reverso corrige bairro', async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith(VIACEP_URL)) {
        // /AM/Manaus/Juliaca/json/ — fixture real medida via curl (2025-11)
        if (url.includes("Juliaca")) {
          return jsonResponse([
            {
              cep: "69097-405",
              logradouro: "Rua Juliaca",
              bairro: "Nova Cidade",
              localidade: "Manaus",
              uf: "AM",
            },
          ]);
        }
        return jsonResponse([]);
      }
      // Nominatim: só a query corrigida (Rua Juliaca, NOVA Cidade) acerta;
      // "Cidade+Nova" (bairro digitado, errado) falha no OSM.
      if (url.includes("Cidade+Nova")) return jsonResponse([]);
      if (url.includes("Nova+Cidade")) return jsonResponse(NOMINATIM_RUA_JULIACA);
      return jsonResponse([]);
    });
    const result = await geocodeAddress("Juliaca, Cidade Nova, Manaus");
    expect(result?.display_name).toContain("Rua Juliaca");
    expect(result?.precision).toBe("street");
    expect(result?.source).toBe("viacep+nominatim");
    expect(result?.via_cep?.cep).toBe("69097-405");
  });

  it('CEP puro com rua de nível street (69042-110 fixture) → precision street, via_cep anexado', async () => {
    jest.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith(VIACEP_URL)) {
        return jsonResponse({
          cep: "69042-110",
          logradouro: "Rua Ovídio Gomes Monteiro",
          bairro: "Alvorada",
          localidade: "Manaus",
          uf: "AM",
        });
      }
      return jsonResponse([
        {
          lat: "-3.0744588",
          lon: "-60.0424964",
          display_name:
            "Rua Ovídio Gomes Monteiro, Loteamento Jardim do Éden, Alvorada, Manaus, Amazonas, Brasil",
          addresstype: "tertiary",
          category: "highway",
          type: "tertiary",
        },
      ]);
    });
    const result = await geocodeAddress("69042-110");
    expect(result?.precision).toBe("street");
    expect(result?.source).toBe("viacep+nominatim");
    expect(result?.via_cep?.cep).toBe("69042-110");
    expect(result?.note).toBeUndefined();
  });

  it("ViaCEP e Nominatim fora do ar → null (chamador decide o fallback)", async () => {
    jest.spyOn(global, "fetch").mockRejectedValue(new Error("rede caída"));
    await expect(geocodeAddress("69094-060")).resolves.toBeNull();
  });
});
