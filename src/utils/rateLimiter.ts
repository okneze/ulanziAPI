/**
 * Simple in-memory rate limiter keyed by an identifier (deviceId or IP).
 * Tracks request counts within a sliding time window.
 */
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private readonly store = new Map<string, RateLimitEntry>();
  private readonly max: number;
  private readonly windowMs: number;

  constructor(max: number, windowMs: number) {
    this.max = max;
    this.windowMs = windowMs;
  }

  /**
   * Returns true if the request is allowed, false if rate-limited.
   */
  check(key: string): boolean {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.store.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (entry.count >= this.max) {
      return false;
    }

    entry.count += 1;
    return true;
  }

  /**
   * Clears all entries (useful for testing).
   */
  clear(): void {
    this.store.clear();
  }
}
