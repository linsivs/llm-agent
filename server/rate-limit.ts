interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

const buckets = new Map<string, RateLimitBucket>();

export function consumeRateLimit({
  key,
  maxRequests = 6,
  windowMs = 10 * 60 * 1_000,
  now = Date.now()
}: {
  key: string;
  maxRequests?: number;
  windowMs?: number;
  now?: number;
}): RateLimitResult {
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs
    });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      retryAfterSeconds: 0
    };
  }

  if (current.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1_000))
    };
  }

  current.count += 1;
  return {
    allowed: true,
    remaining: maxRequests - current.count,
    retryAfterSeconds: 0
  };
}

export function resetRateLimitsForTests() {
  buckets.clear();
}
