/**
 * Token buckets, keyed by whatever the caller is protecting.
 *
 * In memory, so limits reset when the container restarts and are per
 * instance. That is proportionate to what they guard here — our own Gemini
 * bill, and online guessing of invite codes, which is already hopeless
 * against a 24-character alphabet. If the portal is ever run as more than
 * one instance, this needs moving to shared storage.
 */

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface Limit {
  /** How many are allowed in a burst. */
  capacity: number;
  /** How long a full refill takes. */
  windowMs: number;
}

export function take(key: string, limit: Limit, now = Date.now()): boolean {
  const bucket = buckets.get(key) ?? { tokens: limit.capacity, updatedAt: now };

  const refill = ((now - bucket.updatedAt) / limit.windowMs) * limit.capacity;
  bucket.tokens = Math.min(limit.capacity, bucket.tokens + Math.max(0, refill));
  bucket.updatedAt = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}

/** Test seam. */
export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * Who is asking, for rate limiting purposes.
 *
 * Behind Caddy the socket address is the proxy, so the forwarded header is
 * what distinguishes callers. It is client-controlled and therefore useless
 * as identity — but this is a throttle, not an authorisation check, and the
 * thing it throttles is already protected by a code nobody can guess.
 */
export function callerKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return (forwarded?.split(',')[0] || 'unknown').trim();
}
