import {
  createCacheStore,
  facilityCacheKey,
  geocodeCacheKey,
} from "../infrastructure/cache";
import {
  isOverpassCircuitOpen,
  recordOverpassFailure,
  recordOverpassSuccess,
  resetOverpassCircuitBreaker,
  OVERPASS_TIMEOUT_MS,
} from "../infrastructure/overpass";
import { AMENITY_QUERIES } from "../infrastructure/nominatim";
import { searchNearbyFacilities } from "../application/search-nearby-facilities";
import * as overpassModule from "../infrastructure/overpass";
import * as nominatimModule from "../infrastructure/nominatim";

describe("RF-013: Resiliência, Circuit Breaker e Cache", () => {
  afterEach(() => {
    resetOverpassCircuitBreaker();
    jest.restoreAllMocks();
  });

  describe("CacheStore (LRU/TTL leve em memória)", () => {
    it("armazena e recupera valores dentro do TTL", () => {
      const cache = createCacheStore<string>({ maxEntries: 10, defaultTtlMs: 1000 });
      cache.set("chave1", "valor1");
      expect(cache.get("chave1")).toBe("valor1");
    });

    it("retorna undefined quando o item expira", () => {
      const cache = createCacheStore<string>({ maxEntries: 10, defaultTtlMs: 50 });
      cache.set("chave1", "valor1", 50);
      expect(cache.get("chave1")).toBe("valor1");

      const originalNow = Date.now;
      try {
        Date.now = () => originalNow() + 100;
        expect(cache.get("chave1")).toBeUndefined();
      } finally {
        Date.now = originalNow;
      }
    });

    it("respeita maxEntries removendo a entrada mais antiga quando atinge o limite", () => {
      const cache = createCacheStore<number>({ maxEntries: 2, defaultTtlMs: 10000 });
      cache.set("a", 1);
      cache.set("b", 2);
      cache.set("c", 3);

      expect(cache.get("a")).toBeUndefined();
      expect(cache.get("b")).toBe(2);
      expect(cache.get("c")).toBe(3);
    });

    it("facilityCacheKey agrupa coordenadas próximas em ~1km (2 casas decimais)", () => {
      const k1 = facilityCacheKey(-3.0299285, -59.9925943, 5);
      const k2 = facilityCacheKey(-3.0300100, -59.9924000, 5);
      expect(k1).toBe(k2);
      expect(k1).toBe("-3.03:-59.99:5");
    });

    it("geocodeCacheKey normaliza o texto para minúsculas e espaços", () => {
      expect(geocodeCacheKey("  Alvorada, Manaus ")).toBe("alvorada, manaus");
      expect(geocodeCacheKey("69042-110")).toBe("69042110");
    });
  });

  describe("Overpass Circuit Breaker e Timeout Rápido", () => {
    it("o timeout do Overpass foi reduzido para no máximo 3500ms (fail-fast)", () => {
      expect(OVERPASS_TIMEOUT_MS).toBeLessThanOrEqual(3500);
    });

    it("o circuito inicia FECHADO (closed)", () => {
      resetOverpassCircuitBreaker();
      expect(isOverpassCircuitOpen()).toBe(false);
    });

    it("o circuito ABRE após registrar falhas e bloqueia tentativas imediatas", () => {
      resetOverpassCircuitBreaker();
      recordOverpassFailure();
      recordOverpassFailure();
      expect(isOverpassCircuitOpen()).toBe(true);
    });

    it("o circuito FECHA quando registramos sucesso", () => {
      recordOverpassFailure();
      recordOverpassFailure();
      expect(isOverpassCircuitOpen()).toBe(true);
      recordOverpassSuccess();
      expect(isOverpassCircuitOpen()).toBe(false);
    });
  });

  describe("Fallback Nominatim com completude de UPA/SPA", () => {
    it("AMENITY_QUERIES inclui upa e spa obrigatoriamente", () => {
      const list = Array.from(AMENITY_QUERIES);
      expect(list).toContain("upa");
      expect(list).toContain("spa");
      expect(list).toContain("hospital");
      expect(list).toContain("ubs");
    });
  });

  describe("searchNearbyFacilities (resiliência sem 503)", () => {
    it("quando Overpass falha, usa fallback do Nominatim e não quebra", async () => {
      jest.spyOn(overpassModule, "fetchOverpassElements").mockRejectedValue(new Error("Overpass timeout"));

      jest.spyOn(nominatimModule, "searchAmenitiesNear").mockResolvedValue([
        {
          id: "nom-1",
          name: "SPA Alvorada",
          type: "upa",
          address: "Rua Alvorada",
          lat: -3.07,
          lng: -60.04,
          distance_km: 1.2,
          emergency: true,
          operator: "public",
          source: "nominatim",
          phone: "",
        },
      ]);

      const result = await searchNearbyFacilities({
        lat: -3.07,
        lng: -60.04,
        radius_km: 5,
      });

      expect(result.mcp_tool).toBe("search_nearby_facilities");
      expect(result.output.facilities).toHaveLength(1);
      expect(result.output.facilities[0].name).toBe("SPA Alvorada");
      expect(result.output.total).toBe(1);
    });
  });
});
