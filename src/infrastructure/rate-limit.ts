// Rate limiting em memória — extraído para ser testável (relógio injetável).
//
// Limitação conhecida (docs/architecture.md ADR-006): em serverless cada
// instância tem sua própria memória, então o limite é aproximado.
// Para limites rígidos, plugar um store compartilhado (ex.: Redis) depois.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
  size(): number;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}): RateLimiter {
  const nowFn = options.now ?? (() => Date.now());
  const entries = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string): RateLimitResult {
      const now = nowFn();

      // Limpeza preguiçosa das entradas expiradas
      for (const [k, v] of entries.entries()) {
        if (v.resetAt <= now) entries.delete(k);
      }

      const entry = entries.get(key);
      if (!entry || entry.resetAt <= now) {
        entries.set(key, { count: 1, resetAt: now + options.windowMs });
        return { allowed: true, remaining: options.limit - 1, retryAfterSeconds: 0 };
      }

      entry.count += 1;
      if (entry.count > options.limit) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
        };
      }
      return {
        allowed: true,
        remaining: options.limit - entry.count,
        retryAfterSeconds: 0,
      };
    },
    size(): number {
      return entries.size;
    },
  };
}
