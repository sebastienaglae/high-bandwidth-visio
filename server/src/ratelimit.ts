/**
 * Minimal token-bucket rate limiter, adequate for a single-node deployment.
 * Buckets are keyed by caller-supplied strings (e.g. "ip" or connection id)
 * and lazily created; sweep() evicts idle buckets.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; last: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number
  ) {}

  allow(key: string): boolean {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.capacity, last: now };
      this.buckets.set(key, bucket);
    }
    const elapsedSec = (now - bucket.last) / 1000;
    bucket.last = now;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillPerSec);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  sweep(maxIdleMs = 120_000): void {
    const cutoff = Date.now() - maxIdleMs;
    for (const [key, bucket] of this.buckets) {
      if (bucket.last < cutoff) this.buckets.delete(key);
    }
  }
}
