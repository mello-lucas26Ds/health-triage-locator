// Cache em memória leve (LRU simples com TTL) — infraestrutura.
// Permite fail-fast e reduz drasticamente requisições de rede externas repetidas.

export interface CacheOptions {
  maxEntries?: number;
  defaultTtlMs?: number;
}

export interface CacheStore<T> {
  get(key: string): T | undefined;
  set(key: string, value: T, ttlMs?: number): void;
  delete(key: string): void;
  clear(): void;
  size(): number;
}

export function createCacheStore<T>(options: CacheOptions = {}): CacheStore<T> {
  const maxEntries = options.maxEntries ?? 500;
  const defaultTtlMs = options.defaultTtlMs ?? 10 * 60 * 1000; // 10 min padrão

  interface Entry {
    value: T;
    expiresAt: number;
  }

  const map = new Map<string, Entry>();

  return {
    get(key: string): T | undefined {
      const entry = map.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        map.delete(key);
        return undefined;
      }
      // Re-insere para manter ordem recente (LRU)
      map.delete(key);
      map.set(key, entry);
      return entry.value;
    },
    set(key: string, value: T, ttlMs?: number): void {
      if (map.has(key)) {
        map.delete(key);
      } else if (map.size >= maxEntries) {
        // Remove o mais antigo (primeira chave do Map)
        const oldest = map.keys().next().value;
        if (oldest !== undefined) {
          map.delete(oldest);
        }
      }
      map.set(key, {
        value,
        expiresAt: Date.now() + (ttlMs ?? defaultTtlMs),
      });
    },
    delete(key: string): void {
      map.delete(key);
    },
    clear(): void {
      map.clear();
    },
    size(): number {
      return map.size;
    },
  };
}

/** Agrupa coordenadas próximas em ~1.1km (2 casas decimais) para cache de POIs. */
export function facilityCacheKey(lat: number, lng: number, radiusKm: number): string {
  return `${lat.toFixed(2)}:${lng.toFixed(2)}:${Math.round(radiusKm)}`;
}

/** Normaliza string de busca de geocodificação para uso em cache. */
export function geocodeCacheKey(query: string): string {
  const text = query.trim().toLowerCase().replace(/[\u2010-\u2015\u2212]/g, "-");
  if (/^\d{5}-?\d{3}$/.test(text.replace(/\s/g, ""))) {
    return text.replace(/\D/g, "");
  }
  return text.replace(/\s+/g, " ");
}
