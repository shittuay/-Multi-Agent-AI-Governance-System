/**
 * Tests: Rate Limiter (Token Bucket)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  chatRateLimiter,
  policyRateLimiter,
  auditExportRateLimiter,
  authRateLimiter,
  withRateLimit,
  RateLimitError,
} from '../../utils/rateLimiter.js';

// We need to create instances directly. Since RateLimiter is a class defined
// inside the module without export, we'll test via the exported instances
// and the withRateLimit HOF.

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a fresh limiter-like test using the exported singletons reset each time */
function makeFreshLimiter(maxRequests = 3, windowMs = 60000) {
  // We can't import RateLimiter class directly since it's not exported,
  // so we use the exported singletons with reset() between tests.
  // For isolated tests, we abuse the withRateLimit pattern.
  return {
    _requests: new Map(),
    maxRequests,
    windowMs,
    identifier: 'test',
    check(key = 'global') {
      const now = Date.now();
      const windowStart = now - this.windowMs;
      const timestamps = (this._requests.get(key) || []).filter((ts) => ts > windowStart);
      const remaining = Math.max(0, this.maxRequests - timestamps.length);
      const resetAt = timestamps.length > 0
        ? new Date(timestamps[0] + this.windowMs)
        : new Date(now + this.windowMs);

      if (timestamps.length >= this.maxRequests) {
        return { allowed: false, remaining: 0, resetAt };
      }
      timestamps.push(now);
      this._requests.set(key, timestamps);
      return { allowed: true, remaining: remaining - 1, resetAt };
    },
    reset(key = 'global') { this._requests.delete(key); },
    clearAll() { this._requests.clear(); },
    getStats(key = 'global') {
      const now = Date.now();
      const windowStart = now - this.windowMs;
      const timestamps = (this._requests.get(key) || []).filter((ts) => ts > windowStart);
      return {
        identifier: this.identifier,
        key,
        requestsInWindow: timestamps.length,
        maxRequests: this.maxRequests,
        windowMs: this.windowMs,
        remaining: Math.max(0, this.maxRequests - timestamps.length),
      };
    },
  };
}

// ─── Rate limiter behavior tests ──────────────────────────────────────────────

describe('RateLimiter - basic behavior', () => {
  let limiter;

  beforeEach(() => {
    limiter = makeFreshLimiter(3, 60000);
  });

  it('allows requests up to the limit', () => {
    const r1 = limiter.check('user1');
    const r2 = limiter.check('user1');
    const r3 = limiter.check('user1');

    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  it('blocks when limit is exceeded', () => {
    limiter.check('user1');
    limiter.check('user1');
    limiter.check('user1');
    const r4 = limiter.check('user1');

    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it('returns correct remaining count', () => {
    const r1 = limiter.check('user1');
    expect(r1.remaining).toBe(2); // 3 max - 1 used = 2 remaining

    const r2 = limiter.check('user1');
    expect(r2.remaining).toBe(1);

    const r3 = limiter.check('user1');
    expect(r3.remaining).toBe(0);
  });

  it('isolates different keys', () => {
    // Fill up user1
    limiter.check('user1');
    limiter.check('user1');
    limiter.check('user1');
    const blocked = limiter.check('user1');
    expect(blocked.allowed).toBe(false);

    // user2 should still be allowed
    const r = limiter.check('user2');
    expect(r.allowed).toBe(true);
  });

  it('resets rate limit for a specific key', () => {
    limiter.check('user1');
    limiter.check('user1');
    limiter.check('user1');
    expect(limiter.check('user1').allowed).toBe(false);

    limiter.reset('user1');
    expect(limiter.check('user1').allowed).toBe(true);
  });

  it('clearAll resets all keys', () => {
    limiter.check('user1');
    limiter.check('user1');
    limiter.check('user1');
    limiter.check('user2');
    limiter.check('user2');
    limiter.check('user2');

    expect(limiter.check('user1').allowed).toBe(false);
    expect(limiter.check('user2').allowed).toBe(false);

    limiter.clearAll();
    expect(limiter.check('user1').allowed).toBe(true);
    expect(limiter.check('user2').allowed).toBe(true);
  });

  it('returns a resetAt Date in the future', () => {
    const r = limiter.check('user1');
    expect(r.resetAt).toBeInstanceOf(Date);
    expect(r.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('expires old requests after window passes', () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);

    limiter.check('user1');
    limiter.check('user1');
    limiter.check('user1');
    expect(limiter.check('user1').allowed).toBe(false);

    // Advance time past the window
    vi.setSystemTime(start + 61000);
    expect(limiter.check('user1').allowed).toBe(true);

    vi.useRealTimers();
  });
});

// ─── getStats ─────────────────────────────────────────────────────────────────

describe('RateLimiter - getStats', () => {
  it('returns correct stats for unused key', () => {
    const limiter = makeFreshLimiter(10, 60000);
    const stats = limiter.getStats('user1');
    expect(stats.requestsInWindow).toBe(0);
    expect(stats.maxRequests).toBe(10);
    expect(stats.remaining).toBe(10);
  });

  it('reflects requests made', () => {
    const limiter = makeFreshLimiter(10, 60000);
    limiter.check('user1');
    limiter.check('user1');
    const stats = limiter.getStats('user1');
    expect(stats.requestsInWindow).toBe(2);
    expect(stats.remaining).toBe(8);
  });
});

// ─── withRateLimit HOF ─────────────────────────────────────────────────────────

describe('withRateLimit', () => {
  it('calls the wrapped function when allowed', async () => {
    const limiter = makeFreshLimiter(5, 60000);
    const mockFn = vi.fn().mockResolvedValue('result');
    const wrapped = withRateLimit(limiter, mockFn);

    const result = await wrapped('arg1');
    expect(mockFn).toHaveBeenCalledWith('arg1');
    expect(result).toBe('result');
  });

  it('throws RateLimitError when limit exceeded', async () => {
    const limiter = makeFreshLimiter(1, 60000);
    const mockFn = vi.fn().mockResolvedValue('ok');
    const wrapped = withRateLimit(limiter, mockFn);

    await wrapped(); // First call - allowed
    await expect(wrapped()).rejects.toThrow(RateLimitError);
  });

  it('uses keyFn to determine the rate limit key', async () => {
    const limiter = makeFreshLimiter(1, 60000);
    const mockFn = vi.fn().mockResolvedValue('ok');
    // Key based on first argument
    const wrapped = withRateLimit(limiter, mockFn, (userId) => userId);

    await wrapped('user1'); // user1: 1 request
    // user2 should still be allowed
    await expect(wrapped('user2')).resolves.toBe('ok');
    // user1 should be blocked
    await expect(wrapped('user1')).rejects.toThrow(RateLimitError);
  });
});

// ─── RateLimitError class ─────────────────────────────────────────────────────

describe('RateLimitError', () => {
  it('has correct properties', () => {
    const err = new RateLimitError('Too many requests', {
      remaining: 0,
      resetAt: new Date(),
      identifier: 'test',
    });
    expect(err.name).toBe('RateLimitError');
    expect(err.statusCode).toBe(429);
    expect(err.meta.identifier).toBe('test');
    expect(err.message).toBe('Too many requests');
  });
});

// ─── Pre-configured limiters sanity check ─────────────────────────────────────

describe('Pre-configured limiters', () => {
  beforeEach(() => {
    // Clear all limiters before each test to prevent cross-test pollution
    chatRateLimiter.clearAll();
    policyRateLimiter.clearAll();
    auditExportRateLimiter.clearAll();
    authRateLimiter.clearAll();
  });

  it('chatRateLimiter allows first request', () => {
    const r = chatRateLimiter.check('test-user');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(29); // 30 max - 1
  });

  it('policyRateLimiter allows first request', () => {
    const r = policyRateLimiter.check('test-user');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(9); // 10 max - 1
  });

  it('auditExportRateLimiter allows first request', () => {
    const r = auditExportRateLimiter.check('test-user');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4); // 5 max - 1
  });

  it('authRateLimiter allows first 5 requests then blocks', () => {
    const key = 'ip-192.168.1.1';
    for (let i = 0; i < 5; i++) {
      expect(authRateLimiter.check(key).allowed).toBe(true);
    }
    expect(authRateLimiter.check(key).allowed).toBe(false);
  });
});
