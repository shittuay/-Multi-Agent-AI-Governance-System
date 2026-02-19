/**
 * Rate Limiter Guardrail
 *
 * Client-side rate limiting to prevent abuse of agent queries and API calls.
 * Note: Server-side rate limiting in API Gateway / Lambda is the primary defense;
 * this is a UX and secondary defense layer.
 */

// ─── Rate Limiter Class ───────────────────────────────────────────────────────

class RateLimiter {
  /**
   * @param {object} options
   * @param {number} options.maxRequests - Max requests allowed per window
   * @param {number} options.windowMs - Time window in milliseconds
   * @param {string} options.identifier - Human-readable name for this limiter
   */
  constructor({ maxRequests, windowMs, identifier }) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.identifier = identifier;
    // Map of key -> array of timestamps
    this._requests = new Map();
  }

  /**
   * Checks if the given key is rate-limited.
   * @param {string} key - Usually userId or agentId or 'global'
   * @returns {{ allowed: boolean, remaining: number, resetAt: Date }}
   */
  check(key = 'global') {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing timestamps, filter out expired ones
    const timestamps = (this._requests.get(key) || []).filter(
      (ts) => ts > windowStart
    );

    const remaining = Math.max(0, this.maxRequests - timestamps.length);
    const resetAt = timestamps.length > 0
      ? new Date(timestamps[0] + this.windowMs)
      : new Date(now + this.windowMs);

    if (timestamps.length >= this.maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    // Record this request
    timestamps.push(now);
    this._requests.set(key, timestamps);

    return { allowed: true, remaining: remaining - 1, resetAt };
  }

  /**
   * Resets the rate limit for a specific key.
   */
  reset(key = 'global') {
    this._requests.delete(key);
  }

  /**
   * Clears all rate limit records (e.g., on logout).
   */
  clearAll() {
    this._requests.clear();
  }

  /**
   * Returns current usage stats for a key.
   */
  getStats(key = 'global') {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const timestamps = (this._requests.get(key) || []).filter(
      (ts) => ts > windowStart
    );
    return {
      identifier: this.identifier,
      key,
      requestsInWindow: timestamps.length,
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
      remaining: Math.max(0, this.maxRequests - timestamps.length),
    };
  }
}

// ─── Pre-configured Limiters ──────────────────────────────────────────────────

/**
 * Limits agent chat queries.
 * 30 messages per minute per user/agent combo.
 */
export const chatRateLimiter = new RateLimiter({
  maxRequests: 30,
  windowMs: 60 * 1000,
  identifier: 'agent-chat',
});

/**
 * Limits policy creation/updates.
 * 10 policy changes per minute per user.
 */
export const policyRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 60 * 1000,
  identifier: 'policy-management',
});

/**
 * Limits audit log export requests.
 * 5 exports per 5 minutes per user.
 */
export const auditExportRateLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 5 * 60 * 1000,
  identifier: 'audit-export',
});

/**
 * Limits authentication attempts.
 * 5 attempts per 15 minutes (client-side pre-check).
 */
export const authRateLimiter = new RateLimiter({
  maxRequests: 5,
  windowMs: 15 * 60 * 1000,
  identifier: 'authentication',
});

/**
 * General API rate limiter.
 * 60 requests per minute per user.
 */
export const apiRateLimiter = new RateLimiter({
  maxRequests: parseInt(import.meta.env.VITE_MAX_REQUESTS_PER_MINUTE) || 60,
  windowMs: 60 * 1000,
  identifier: 'api-general',
});

// ─── Middleware Helper ────────────────────────────────────────────────────────

/**
 * HOF that wraps an async function with rate limiting.
 * Throws RateLimitError if limit exceeded.
 *
 * @param {RateLimiter} limiter
 * @param {Function} fn - The function to wrap
 * @param {Function} keyFn - Returns the rate limit key from args
 */
export function withRateLimit(limiter, fn, keyFn = () => 'global') {
  return async function rateLimitedFn(...args) {
    const key = keyFn(...args);
    const { allowed, remaining, resetAt } = limiter.check(key);

    if (!allowed) {
      throw new RateLimitError(
        `Rate limit exceeded for ${limiter.identifier}. Try again after ${resetAt.toISOString()}.`,
        { remaining, resetAt, identifier: limiter.identifier }
      );
    }

    return fn(...args);
  };
}

// ─── Custom Error ─────────────────────────────────────────────────────────────

export class RateLimitError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = 'RateLimitError';
    this.statusCode = 429;
    this.meta = meta;
  }
}
