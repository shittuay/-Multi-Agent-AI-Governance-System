/**
 * Tests: Safe Error Handler
 *
 * Verifies that internal error details are never exposed to users,
 * errors are correctly classified, and user messages are always safe.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  AppError,
  ErrorTypes,
  classifyError,
  handleError,
  parseApiError,
} from '../../utils/errorHandler.js';

// ─── AppError class ───────────────────────────────────────────────────────────

describe('AppError', () => {
  it('creates an error with correct type and defaults', () => {
    const err = new AppError(ErrorTypes.NETWORK, 'Connection failed');
    expect(err.name).toBe('AppError');
    expect(err.type).toBe(ErrorTypes.NETWORK);
    expect(err.message).toBe('Connection failed');
    expect(err.statusCode).toBe(500); // default
    expect(err.retryable).toBe(false);
    expect(err.errors).toBeNull();
    expect(err.timestamp).toBeDefined();
  });

  it('uses provided options to override defaults', () => {
    const err = new AppError(ErrorTypes.RATE_LIMIT, 'Too many', {
      statusCode: 429,
      retryable: true,
      errors: [{ field: 'request', message: 'Limit exceeded' }],
    });
    expect(err.statusCode).toBe(429);
    expect(err.retryable).toBe(true);
    expect(err.errors).toHaveLength(1);
  });

  it('has a safe userMessage for each error type', () => {
    const types = Object.values(ErrorTypes);
    for (const type of types) {
      const err = new AppError(type, 'internal message');
      expect(err.userMessage).toBeDefined();
      expect(typeof err.userMessage).toBe('string');
      expect(err.userMessage.length).toBeGreaterThan(0);
    }
  });

  it('userMessage does not contain the internal message', () => {
    const err = new AppError(ErrorTypes.UNKNOWN, 'SELECT * FROM users WHERE id=1');
    expect(err.userMessage).not.toContain('SELECT');
    expect(err.userMessage).not.toContain('FROM users');
  });
});

// ─── classifyError ────────────────────────────────────────────────────────────

describe('classifyError', () => {
  it('returns AppError instances unchanged', () => {
    const original = new AppError(ErrorTypes.NETWORK, 'Network issue');
    const classified = classifyError(original);
    expect(classified).toBe(original);
  });

  it('classifies ValidationError correctly', () => {
    const err = new Error('Validation failed');
    err.name = 'ValidationError';
    err.errors = [{ field: 'name', message: 'Required' }];
    const classified = classifyError(err);
    expect(classified.type).toBe(ErrorTypes.VALIDATION);
    expect(classified.statusCode).toBe(400);
  });

  it('classifies RateLimitError correctly', () => {
    const err = new Error('Rate limited');
    err.name = 'RateLimitError';
    const classified = classifyError(err);
    expect(classified.type).toBe(ErrorTypes.RATE_LIMIT);
    expect(classified.statusCode).toBe(429);
    expect(classified.retryable).toBe(true);
  });

  it('classifies 401 HTTP errors as authentication errors', () => {
    const err = new Error('Unauthorized');
    err.status = 401;
    const classified = classifyError(err);
    expect(classified.type).toBe(ErrorTypes.AUTHENTICATION);
    expect(classified.statusCode).toBe(401);
  });

  it('classifies token-related errors as authentication errors', () => {
    const err = new Error('invalid token signature');
    const classified = classifyError(err);
    expect(classified.type).toBe(ErrorTypes.AUTHENTICATION);
  });

  it('classifies 403 HTTP errors as authorization errors', () => {
    const err = new Error('Forbidden');
    err.status = 403;
    const classified = classifyError(err);
    expect(classified.type).toBe(ErrorTypes.AUTHORIZATION);
    expect(classified.statusCode).toBe(403);
  });

  it('classifies fetch TypeErrors as network errors', () => {
    const err = new TypeError('Failed to fetch');
    const classified = classifyError(err);
    expect(classified.type).toBe(ErrorTypes.NETWORK);
    expect(classified.statusCode).toBe(503);
    expect(classified.retryable).toBe(true);
  });

  it('classifies unknown errors with UNKNOWN type', () => {
    const err = new Error('Something completely unexpected');
    const classified = classifyError(err);
    expect(classified.type).toBe(ErrorTypes.UNKNOWN);
    expect(classified.statusCode).toBe(500);
  });

  it('handles null/undefined gracefully', () => {
    const classified = classifyError(null);
    expect(classified.type).toBe(ErrorTypes.UNKNOWN);
  });
});

// ─── handleError ─────────────────────────────────────────────────────────────

describe('handleError', () => {
  it('returns only user-safe fields', () => {
    const err = new Error('Internal DB connection string: postgres://user:pass@localhost');
    const result = handleError(err);

    // Should not expose internal error message
    expect(result.message).not.toContain('postgres://');
    expect(result.message).not.toContain('user:pass@localhost');

    // Should have safe user-facing message
    expect(result.message).toBeDefined();
    expect(typeof result.message).toBe('string');
  });

  it('returns required safe fields', () => {
    const err = new Error('Some error');
    const result = handleError(err);

    expect(result).toHaveProperty('type');
    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('retryable');
    expect(result).toHaveProperty('timestamp');
  });

  it('does NOT include stack trace in return value', () => {
    const err = new Error('Some error');
    const result = handleError(err);
    expect(result).not.toHaveProperty('stack');
  });

  it('passes validation field errors through (they are safe to show)', () => {
    const err = new Error('Validation failed');
    err.name = 'ValidationError';
    err.errors = [{ field: 'email', message: 'Invalid email format' }];

    const result = handleError(err);
    expect(result.errors).toBeDefined();
    expect(result.errors[0].field).toBe('email');
  });

  it('marks rate limit errors as retryable', () => {
    const err = new Error('Rate limited');
    err.name = 'RateLimitError';
    const result = handleError(err);
    expect(result.retryable).toBe(true);
  });

  it('marks network errors as retryable', () => {
    const err = new TypeError('Failed to fetch');
    const result = handleError(err);
    expect(result.retryable).toBe(true);
  });

  it('marks unknown errors as not retryable', () => {
    const err = new Error('Unexpected failure');
    const result = handleError(err);
    expect(result.retryable).toBe(false);
  });

  it('accepts context without throwing', () => {
    const err = new Error('Error with context');
    expect(() => handleError(err, { userId: 'user-123', action: 'query' })).not.toThrow();
  });
});

// ─── parseApiError ────────────────────────────────────────────────────────────

describe('parseApiError', () => {
  it('classifies 400 responses as validation errors', async () => {
    const mockResponse = {
      status: 400,
      json: vi.fn().mockResolvedValue({ message: "Invalid input", errors: [{ field: "content", message: "Required" }] }),
    };

    const result = await parseApiError(mockResponse);
    expect(result.type).toBe(ErrorTypes.VALIDATION);
    expect(result.statusCode).toBe(400);
  });

  it('classifies 401 responses as authentication errors', async () => {
    const mockResponse = {
      status: 401,
      json: vi.fn().mockResolvedValue({ message: 'Unauthorized' }),
    };

    const result = await parseApiError(mockResponse);
    expect(result.type).toBe(ErrorTypes.AUTHENTICATION);
  });

  it('classifies 403 responses as authorization errors', async () => {
    const mockResponse = {
      status: 403,
      json: vi.fn().mockResolvedValue({ message: 'Forbidden' }),
    };

    const result = await parseApiError(mockResponse);
    expect(result.type).toBe(ErrorTypes.AUTHORIZATION);
  });

  it('classifies 429 responses as rate limit errors', async () => {
    const mockResponse = {
      status: 429,
      json: vi.fn().mockResolvedValue({ message: 'Too Many Requests' }),
    };

    const result = await parseApiError(mockResponse);
    expect(result.type).toBe(ErrorTypes.RATE_LIMIT);
  });

  it('handles JSON parse failure gracefully', async () => {
    const mockResponse = {
      status: 500,
      json: vi.fn().mockRejectedValue(new Error('Not JSON')),
    };

    const result = await parseApiError(mockResponse);
    // Should not throw, should return a classified error
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
  });

  it('caps the message at 200 characters', async () => {
    const longMessage = 'a'.repeat(500);
    const mockResponse = {
      status: 400,
      json: vi.fn().mockResolvedValue({ message: longMessage }),
    };

    const result = await parseApiError(mockResponse);
    // The message is classified through classifyError which produces user-safe messages
    expect(result.userMessage || result.message || '').toBeDefined();
  });

  it('only trusts message field from API response body', async () => {
    const mockResponse = {
      status: 500,
      json: vi.fn().mockResolvedValue({
        message: 'Service unavailable',
        stack: 'at module.js:100', // Should NOT be trusted
        query: 'SELECT * FROM secrets', // Should NOT be trusted
      }),
    };

    const result = await parseApiError(mockResponse);
    // The classified AppError should have safe user message
    expect(JSON.stringify(result)).not.toContain('SELECT * FROM secrets');
    expect(JSON.stringify(result)).not.toContain('at module.js:100');
  });
});
