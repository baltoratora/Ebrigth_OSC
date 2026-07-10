import { describe, it, expect } from "vitest";
import { createRateLimiter } from "../../lib/rate-limit";

// Build a limiter with an injected clock so the tests are deterministic.
function mkLimiter(opts?: Partial<{ max: number; windowMs: number; start: number }>) {
  const { max = 3, windowMs = 1000, start = 1_000_000 } = opts ?? {};
  let t = start;
  const limiter = createRateLimiter({ max, windowMs, now: () => t });
  return {
    limiter,
    advance: (ms: number) => { t += ms; },
    setTime: (ms: number) => { t = ms; },
  };
}

describe("createRateLimiter()", () => {
  it("allows up to `max` failed attempts before blocking", () => {
    const { limiter } = mkLimiter({ max: 3 });
    expect(limiter.check("k").blocked).toBe(false);
    limiter.record("k");
    limiter.record("k");
    expect(limiter.check("k").blocked).toBe(false);
    limiter.record("k"); // 3rd failure
    expect(limiter.check("k").blocked).toBe(true);
  });

  it("retryAfterSec is roughly how long until the oldest attempt expires", () => {
    const { limiter, advance } = mkLimiter({ max: 2, windowMs: 1000 });
    limiter.record("k"); // t = 1_000_000
    advance(200);
    limiter.record("k"); // t = 1_000_200, now at max
    advance(100);        // t = 1_000_300
    const r = limiter.check("k");
    expect(r.blocked).toBe(true);
    // Oldest attempt at t=1_000_000 expires at t=1_001_000.
    // Now is 1_000_300, so ~700ms left → ceil → 1.
    expect(r.retryAfterSec).toBe(1);
  });

  it("forgets attempts older than the window (rolling)", () => {
    const { limiter, advance } = mkLimiter({ max: 2, windowMs: 1000 });
    limiter.record("k");
    limiter.record("k");
    expect(limiter.check("k").blocked).toBe(true);
    advance(1001); // past the window
    expect(limiter.check("k").blocked).toBe(false);
  });

  it("reset() clears the bucket immediately", () => {
    const { limiter } = mkLimiter({ max: 2 });
    limiter.record("k");
    limiter.record("k");
    expect(limiter.check("k").blocked).toBe(true);
    limiter.reset("k");
    expect(limiter.check("k").blocked).toBe(false);
  });

  it("keys are isolated", () => {
    const { limiter } = mkLimiter({ max: 1 });
    limiter.record("user:1");
    expect(limiter.check("user:1").blocked).toBe(true);
    expect(limiter.check("user:2").blocked).toBe(false);
  });

  it("check() does not mutate state", () => {
    const { limiter } = mkLimiter({ max: 2 });
    limiter.check("k");
    limiter.check("k");
    limiter.check("k");
    // Three checks but no records → still unblocked.
    expect(limiter.check("k").blocked).toBe(false);
  });

  it("retryAfterSec is 0 when not blocked", () => {
    const { limiter } = mkLimiter({ max: 3 });
    expect(limiter.check("k")).toEqual({ blocked: false, retryAfterSec: 0 });
  });
});
