/** Small in-memory sliding-window rate limiter (single process). */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  /** Records a hit and reports whether it is within `limit` hits per `windowMs`. */
  hit(key: string, limit: number, windowMs: number, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
    const since = now - windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= limit) {
      this.hits.set(key, list);
      return { allowed: false, retryAfterMs: list[0]! + windowMs - now };
    }
    list.push(now);
    this.hits.set(key, list);
    return { allowed: true, retryAfterMs: 0 };
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  /** Drops keys with no hits inside `maxWindowMs`. */
  prune(maxWindowMs: number, now = Date.now()): void {
    for (const [key, list] of this.hits) {
      if (!list.some((t) => t > now - maxWindowMs)) this.hits.delete(key);
    }
  }
}
