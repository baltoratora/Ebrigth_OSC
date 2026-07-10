// Tiny in-memory rate limiter.
//
// Intended for low-volume, security-sensitive endpoints like password change
// where the goal is "stop brute force from a session cookie", not "scale to
// millions of requests". The store is process-local, so a Docker restart
// clears the counters and multiple instances don't share state. That's
// acceptable for OSC's deployment (single container, brief restart window);
// for a multi-instance future, swap the Map for a Redis-backed store.
//
// Usage:
//   const rl = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5 });
//   const r = rl.check(`change-pw:${userId}`);
//   if (r.blocked) return 429 with `Retry-After: r.retryAfterSec`;
//   // ...verify password...
//   if (failed) rl.record(`change-pw:${userId}`);
//   else        rl.reset(`change-pw:${userId}`);

type Bucket = {
  // Timestamps (ms since epoch) of recent FAILED attempts, kept rolling.
  attempts: number[];
};

export type RateLimiter = {
  /** Returns whether the key is currently blocked. Does not mutate. */
  check: (key: string) => { blocked: boolean; retryAfterSec: number };
  /** Record one failure. Should be called only after a verification fails. */
  record: (key: string) => void;
  /** Clear the bucket — call on success. */
  reset: (key: string) => void;
};

export type RateLimiterOpts = {
  windowMs: number;
  max:      number;
  /** Optional clock injection for tests. */
  now?: () => number;
};

export function createRateLimiter(opts: RateLimiterOpts): RateLimiter {
  const { windowMs, max, now = Date.now } = opts;
  const store = new Map<string, Bucket>();

  function trim(bucket: Bucket, t: number): void {
    const cutoff = t - windowMs;
    // Mutate in place; small arrays so allocations don't matter here.
    while (bucket.attempts.length > 0 && bucket.attempts[0] < cutoff) {
      bucket.attempts.shift();
    }
  }

  return {
    check(key) {
      const t = now();
      const bucket = store.get(key);
      if (!bucket) return { blocked: false, retryAfterSec: 0 };
      trim(bucket, t);
      if (bucket.attempts.length < max) return { blocked: false, retryAfterSec: 0 };
      const oldest = bucket.attempts[0];
      const retryAfterMs = Math.max(0, oldest + windowMs - t);
      return { blocked: true, retryAfterSec: Math.ceil(retryAfterMs / 1000) };
    },

    record(key) {
      const t = now();
      const bucket = store.get(key) ?? { attempts: [] };
      trim(bucket, t);
      bucket.attempts.push(t);
      store.set(key, bucket);
    },

    reset(key) {
      store.delete(key);
    },
  };
}
