/**
 * Testes adversários da classificação de unidades.
 * Casos reais do OSM de Manaus + tentativas de quebrar a regra.
 */

import { classifyFacilityType, isExcludedFacility, prioritizeByType } from "@/domain/facility-classifier";
import type { Facility } from "@/domain/types";

describe("classifyFacilityType — SPAs devem ser UPA", () => {
  const cases: { name: string; tags: Record<string, string> }[] = [
    {
      name: "SPA - Serviço de Pronto Atendimento do Alvorada",
      tags: { name: "SPA - Serviço de Pronto Atendimento do Alvorada", healthcare: "hospital", emergency: "yes" },
    },
    { name: "SPA Joventina Dias", tags: { name: "SPA Joventina Dias", healthcare: "hospital", emergency: "yes" } },
    { name: "SPA São Raimundo", tags: { name: "SPA São Raimundo", amenity: "hospital", emergency: "yes" } },
    { name: "UPA 24h Centro", tags: { name: "UPA 24h Centro", healthcare: "urgent_care" } },
    { name: "UPA Cidade Nova", tags: { name: "UPA Cidade Nova" } },
    // mesmo sem tag de nome conclusiva, "pronto atendimento" no nome decide
    { name: "Serviço de Pronto Atendimento Gilberto Mestrinho", tags: { name: "Serviço de Pronto Atendimento Gilberto Mestrinho", healthcare: "hospital" } },
  ];

  it.each(cases)("$name → upa (mesmo com tags OSM conflitantes)", ({ tags }) => {
    expect(classifyFacilityType(tags)).toBe("upa");
  });
});

describe("classifyFacilityType — Policlínicas devem ser UBS", () => {
  const cases: { name: string; tags: Record<string, string> }[] = [
    {
      name: "Policlinida Redenção",
      tags: { name: "Policlinida Redenção", healthcare: "hospital", amenity: "hospital" },
    },
    { name: "Policlínica Castelo Branco", tags: { name: "Policlínica Castelo Branco", healthcare: "hospital" } },
    {
      name: "Policlínica Municipal Doutor Djalma Batista",
      tags: { name: "Policlínica Municipal Doutor Djalma Batista", healthcare: "hospital", emergency: "yes" },
    },
    { name: "Policlinica da Criança", tags: { name: "Policlinica da Criança", amenity: "hospital" } },
    { name: "UBS Alvorada", tags: { name: "UBS Alvorada", healthcare: "clinic" } },
    { name: "Unidade Básica de Saúde Mansour Bulbol", tags: { name: "Unidade Básica de Saúde Mansour Bulbol", healthcare: "centre" } },
    { name: "Posto de Saúde da Cachoeirinha", tags: { name: "Posto de Saúde da Cachoeirinha", amenity: "doctors" } },
    { name: "CSF São José", tags: { name: "CSF São José", healthcare: "clinic" } },
  ];

  it.each(cases)("$name → ubs", ({ tags }) => {
    expect(classifyFacilityType(tags)).toBe("ubs");
  });
});

describe("classifyFacilityType — Hospitais e Pronto Socorro são emergencia", () => {
  const cases: { name: string; tags: Record<string, string> }[] = [
    { name: "Hospital e Pronto Socorro 28 de Agosto", tags: { name: "Hospital e Pronto Socorro 28 de Agosto", amenity: "hospital" } },
    { name: "Pronto Socorro Mora Tapajós", tags: { name: "Pronto Socorro Mora Tapajós", healthcare: "hospital" } },
    { name: "Hospital Adriano Jorge", tags: { name: "Hospital Adriano Jorge", healthcare: "hospital" } },
    { name: "Fundação de Medicina Tropical Dr. Heitor Vieira Dourado", tags: { name: "Fundação de Medicina Tropical Dr. Heitor Vieira Dourado", amenity: "hospital" } },
    { name: "Pronto Socorro Infantil Unimed", tags: { name: "Pronto Socorro Infantil Unimed", healthcare: "hospital" } },
    { name: "Hospital Universitário Getúlio Vargas", tags: { name: "Hospital Universitário Getúlio Vargas", amenity: "hospital", emergency: "yes" } },
  ];

  it.each(cases)("$name → emergencia", ({ tags }) => {
    expect(classifyFacilityType(tags)).toBe("emergencia");
  });
});

describe("classifyFacilityType — tentativas de quebrar com substring", () => {
  it("'Espaço Vida Clínica' NÃO vira UPA por causa de 'spa' dentro de 'espaço'", () => {
    expect(classifyFacilityType({ name: "Espaço Vida Clínica", amenity: "clinic" })).toBe("ubs");
  });

  it("'Clube dos Pubs' NÃO vira UBS por causa de 'ubs' dentro de 'pubs'", () => {
    expect(classifyFacilityType({ name: "Clube dos Pubs", amenity: "clinic" })).toBe("ubs");
  });

  it("'Supa Market' NÃO vira UPA (spa não é palavra isolada em 'supa')", () => {
    expect(classifyFacilityType({ name: "Supa Market", amenity: "clinic" })).toBe("ubs");
  });

  it("'Hospital Espaço Aberto' continua emergencia (hospital vence)", () => {
    expect(classifyFacilityType({ name: "Hospital Espaço Aberto" })).toBe("emergencia");
  });

  it("nome minúsculo/maiúsculo não muda a classificação", () => {
    expect(classifyFacilityType({ name: "spa joventina dias" })).toBe("upa");
    expect(classifyFacilityType({ name: "SPA JOVENTINA DIAS" })).toBe("upa");
    expect(classifyFacilityType({ name: "PoLiClíNiCa Central" })).toBe("ubs");
  });
});

describe("classifyFacilityType — fallback por tags (sem nome conclusivo)", () => {
  it("amenity=hospital sem nome → emergencia", () => {
    expect(classifyFacilityType({ amenity: "hospital" })).toBe("emergencia");
  });
  it("healthcare=hospital sem nome → emergencia", () => {
    expect(classifyFacilityType({ healthcare: "hospital" })).toBe("emergencia");
  });
  it("healthcare=urgent_care sem nome → upa", () => {
    expect(classifyFacilityType({ healthcare: "urgent_care" })).toBe("upa");
  });
  it("healthcare=clinic sem nome → ubs", () => {
    expect(classifyFacilityType({ healthcare: "clinic" })).toBe("ubs");
  });
  it("amenity=doctors sem nome → ubs", () => {
    expect(classifyFacilityType({ amenity: "doctors" })).toBe("ubs");
  });
  it("sem nome e sem tags → ubs (conservador)", () => {
    expect(classifyFacilityType({})).toBe("ubs");
  });
});

describe("isExcludedFacility — tipos que não são atendimento", () => {
  it("farmácia excluída", () => {
    expect(isExcludedFacility({ amenity: "pharmacy", name: "Drogaria Araújo" })).toBe(true);
  });
  it("dentista excluído", () => {
    expect(isExcludedFacility({ healthcare: "dentist", name: "OdontoCenter" })).toBe(true);
  });
  it("laboratório excluído", () => {
    expect(isExcludedFacility({ healthcare: "laboratory", name: "Labmed" })).toBe(true);
  });
  it("hospital NÃO excluído", () => {
    expect(isExcludedFacility({ amenity: "hospital", name: "Hospital Adriano Jorge" })).toBe(false);
  });
  it("UBS NÃO excluída", () => {
    expect(isExcludedFacility({ healthcare: "centre", name: "UBS Compensa" })).toBe(false);
  });
});

describe("prioritizeByType — tipo prioritário primeiro, distância dentro do grupo", () => {
  function fac(id: string, type: Facility["type"], km: number): Facility {
    return {
      id, name: `U-${id}`, type, address: "", lat: 0, lng: 0,
      distance_km: km, phone: "", emergency: false, operator: "", source: "OSM",
    };
  }

  const input = [fac("a", "ubs", 1), fac("b", "emergencia", 2), fac("c", "upa", 3), fac("d", "upa", 4)];

  it("prioridade upa → upas primeiro em ordem de distância", () => {
    const result = prioritizeByType(input, "upa");
    expect(result.map((f) => f.id)).toEqual(["c", "d", "a", "b"]);
  });

  it("prioridade emergencia → hospital primeiro", () => {
    const result = prioritizeByType(input, "emergencia");
    expect(result.map((f) => f.id)).toEqual(["b", "a", "c", "d"]);
  });

  it("prioridade ubs → ubs primeiro", () => {
    const result = prioritizeByType(input, "ubs");
    expect(result.map((f) => f.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("não muta o array original", () => {
    const copy = [...input];
    prioritizeByType(input, "upa");
    expect(input).toEqual(copy);
  });
});
