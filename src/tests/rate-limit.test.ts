/**
 * Testes do rate limiter (relógio injetável — determinístico).
 */

import { createRateLimiter } from "@/infrastructure/rate-limit";

describe("createRateLimiter", () => {
  it("permite até o limite e bloqueia o próximo", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => now });

    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(false);
  });

  it("informa retryAfterSeconds quando bloqueia", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => now });

    limiter.check("ip1");
    const blocked = limiter.check("ip1");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("janela expirada libera novamente", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => now });

    limiter.check("ip1");
    limiter.check("ip1");
    expect(limiter.check("ip1").allowed).toBe(false);

    now = 60_001;
    expect(limiter.check("ip1").allowed).toBe(true);
  });

  it("IPs diferentes não compartilham quota", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => now });

    expect(limiter.check("ip1").allowed).toBe(true);
    expect(limiter.check("ip1").allowed).toBe(false);
    expect(limiter.check("ip2").allowed).toBe(true);
  });

  it("limpa entradas expiradas (não cresce indefinidamente)", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => now });

    for (let i = 0; i < 100; i++) {
      limiter.check(`ip-${i}`);
    }
    now = 2000;
    for (let i = 100; i < 200; i++) {
      limiter.check(`ip-${i}`);
    }
    expect(limiter.size()).toBeLessThanOrEqual(100);
  });

  it("múltiplas requisições no mesmo ms funcionam", () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, now: () => 42 });
    let allowed = 0;
    for (let i = 0; i < 10; i++) {
      if (limiter.check("same-ip").allowed) allowed++;
    }
    expect(allowed).toBe(5);
  });
});
