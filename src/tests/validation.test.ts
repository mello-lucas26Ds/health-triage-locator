/**
 * Testes de validação de entrada — o que um red team enviaria.
 * Zod bloqueia tudo que está fora do contrato antes de qualquer processamento.
 */

import {
  processQuerySchema,
  searchFacilitiesSchema,
  geocodeSchema,
  MAX_MESSAGE_LENGTH,
} from "@/domain/validation";

describe("processQuerySchema — válidos", () => {
  it("aceita mensagem simples", () => {
    const r = processQuerySchema.safeParse({ message: "dor no peito" });
    expect(r.success).toBe(true);
  });

  it("aceita mensagem + bairro", () => {
    const r = processQuerySchema.safeParse({ message: "tontura", location: "Alvorada, Manaus" });
    expect(r.success).toBe(true);
  });

  it("aceita coordenadas válidas", () => {
    const r = processQuerySchema.safeParse({ message: "tontura", lat: -3.1, lng: -60.02 });
    expect(r.success).toBe(true);
  });

  it("trim remove espaços", () => {
    const r = processQuerySchema.safeParse({ message: "   tontura   " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.message).toBe("tontura");
  });
});

describe("processQuerySchema — adversários", () => {
  it("mensagem vazia → rejeita", () => {
    expect(processQuerySchema.safeParse({ message: "" }).success).toBe(false);
    expect(processQuerySchema.safeParse({ message: "     " }).success).toBe(false);
  });

  it("mensagem 10x maior que o limite → rejeita", () => {
    const huge = "a".repeat(MAX_MESSAGE_LENGTH * 10);
    expect(processQuerySchema.safeParse({ message: huge }).success).toBe(false);
  });

  it("mensagem no limite exato → aceita", () => {
    const ok = "a".repeat(MAX_MESSAGE_LENGTH);
    expect(processQuerySchema.safeParse({ message: ok }).success).toBe(true);
  });

  it("XSS payload não é bloqueado aqui (é dado, não código) mas passa por tamanho", () => {
    const xss = '<script>alert("x")</script>';
    const r = processQuerySchema.safeParse({ message: xss });
    // A proteção é: React escapa na UI e escapeHtml escapa no popup do mapa.
    // A validação só garante tamanho/shape.
    expect(r.success).toBe(true);
  });

  it("campo extra desconhecido → rejeita (strictObject)", () => {
    const r = processQuerySchema.safeParse({ message: "tontura", admin: true });
    expect(r.success).toBe(false);
  });

  it("lat 91 e lng -181 → rejeita", () => {
    expect(processQuerySchema.safeParse({ message: "t", lat: 91, lng: 0 }).success).toBe(false);
    expect(processQuerySchema.safeParse({ message: "t", lat: 0, lng: -181 }).success).toBe(false);
  });

  it("lat/lng como string → rejeita (sem coerção silenciosa)", () => {
    expect(processQuerySchema.safeParse({ message: "t", lat: "-3.1", lng: "-60" }).success).toBe(false);
  });

  it("lat/lng NaN e Infinity → rejeita", () => {
    expect(processQuerySchema.safeParse({ message: "t", lat: NaN, lng: 0 }).success).toBe(false);
    expect(processQuerySchema.safeParse({ message: "t", lat: Infinity, lng: 0 }).success).toBe(false);
  });

  it("message numérico → rejeita", () => {
    expect(processQuerySchema.safeParse({ message: 12345 }).success).toBe(false);
  });

  it("body null/undefined → rejeita", () => {
    expect(processQuerySchema.safeParse(null).success).toBe(false);
    expect(processQuerySchema.safeParse(undefined).success).toBe(false);
  });

  it("radius_km dentro da faixa 1–10 → aceita (RF-002b)", () => {
    expect(processQuerySchema.safeParse({ message: "t", radius_km: 1 }).success).toBe(true);
    expect(processQuerySchema.safeParse({ message: "t", radius_km: 10 }).success).toBe(true);
    expect(processQuerySchema.safeParse({ message: "t", radius_km: 5 }).success).toBe(true);
  });

  it("radius_km fora da faixa (0 e 11) → rejeita", () => {
    expect(processQuerySchema.safeParse({ message: "t", radius_km: 0 }).success).toBe(false);
    expect(processQuerySchema.safeParse({ message: "t", radius_km: 11 }).success).toBe(false);
    expect(processQuerySchema.safeParse({ message: "t", radius_km: 15 }).success).toBe(false);
  });
});

describe("searchFacilitiesSchema — adversários", () => {
  it("coordenadas válidas + raio ok", () => {
    const r = searchFacilitiesSchema.safeParse({ lat: -3.1, lng: -60.02, radius_km: 15 });
    expect(r.success).toBe(true);
  });

  it("raio negativo → rejeita", () => {
    expect(searchFacilitiesSchema.safeParse({ lat: -3.1, lng: -60, radius_km: -5 }).success).toBe(false);
  });

  it("raio 0 → rejeita", () => {
    expect(searchFacilitiesSchema.safeParse({ lat: -3.1, lng: -60, radius_km: 0 }).success).toBe(false);
  });

  it("raio 100 km (abuso do serviço externo) → rejeita", () => {
    expect(searchFacilitiesSchema.safeParse({ lat: -3.1, lng: -60, radius_km: 100 }).success).toBe(false);
  });

  it("raio no limite (50) → aceita", () => {
    expect(searchFacilitiesSchema.safeParse({ lat: -3.1, lng: -60, radius_km: 50 }).success).toBe(true);
  });

  it("sem radius_km → usa default 10", () => {
    const r = searchFacilitiesSchema.safeParse({ lat: -3.1, lng: -60 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.radius_km).toBe(10);
  });

  it("types inválido → rejeita", () => {
    expect(
      searchFacilitiesSchema.safeParse({ lat: -3.1, lng: -60, types: ["farmacia"] }).success
    ).toBe(false);
  });

  it("types válidos → aceita", () => {
    const r = searchFacilitiesSchema.safeParse({ lat: -3.1, lng: -60, types: ["ubs", "upa"] });
    expect(r.success).toBe(true);
  });
});

describe("geocodeSchema — adversários", () => {
  it("bairro válido aceita", () => {
    expect(geocodeSchema.safeParse({ address: "Alvorada, Manaus" }).success).toBe(true);
  });

  it("endereço muito curto → rejeita", () => {
    expect(geocodeSchema.safeParse({ address: "ab" }).success).toBe(false);
  });

  it("endereço gigante → rejeita", () => {
    expect(geocodeSchema.safeParse({ address: "x".repeat(5000) }).success).toBe(false);
  });
});
