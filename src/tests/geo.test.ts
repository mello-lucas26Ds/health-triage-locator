/**
 * Testes do cálculo de distância Haversine com valores reais conhecidos.
 */

import { haversineDistance, roundDistance } from "@/domain/geo";

describe("haversineDistance", () => {
  it("mesmo ponto → distância 0", () => {
    expect(haversineDistance(-3.1019, -60.025, -3.1019, -60.025)).toBe(0);
  });

  it("Manaus (Adrianópolis) → Alvorada ≈ 2–5 km", () => {
    const d = haversineDistance(-3.1019, -60.025, -3.0839, -60.0065);
    expect(d).toBeGreaterThan(2);
    expect(d).toBeLessThan(5);
  });

  it("Manaus → São Paulo ≈ 2.700–2.800 km", () => {
    const d = haversineDistance(-3.1019, -60.025, -23.5505, -46.6333);
    expect(d).toBeGreaterThan(2600);
    expect(d).toBeLessThan(2900);
  });

  it("simétrica (A→B === B→A)", () => {
    const ab = haversineDistance(-3.1, -60.02, -3.08, -60.01);
    const ba = haversineDistance(-3.08, -60.01, -3.1, -60.02);
    expect(ab).toBeCloseTo(ba, 6);
  });

  it("quanto mais perto, menor a distância (ordenacão coerente)", () => {
    const origem = { lat: -3.1019, lng: -60.025 };
    const perto = haversineDistance(origem.lat, origem.lng, -3.105, -60.02);
    const longe = haversineDistance(origem.lat, origem.lng, -3.2, -60.1);
    expect(perto).toBeLessThan(longe);
  });
});

describe("roundDistance", () => {
  it("arredonda para 1 casa decimal", () => {
    expect(roundDistance(1.23456)).toBe(1.2);
    expect(roundDistance(1.25)).toBe(1.3);
    expect(roundDistance(0.04)).toBe(0);
  });
});
