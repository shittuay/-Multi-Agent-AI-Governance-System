/**
 * Safe Error Handler
 *
 * Centralizes error handling to ensure internal system details
 * (stack traces, DB errors, AWS ARNs, etc.) are NEVER exposed to users.
 * Errors are sanitized before display and logged securely.
 */

import { sanitizeForLog } from './inputValidation.js';

// ─── Error Types ──────────────────────────────────────────────────────────────

export const ErrorTypes = {
  VALIDATION: 'VALIDATION_ERROR',
  AUTHENTICATION: 'AUTHENTICATION_ERROR',
  AUTHORIZATION: 'AUTHORIZATION_ERROR',
  RATE_LIMIT: 'RATE_LIMIT_ERROR',
  AGENT_ERROR: 'AGENT_ERROR',
  NETWORK: 'NETWORK_ERROR',
  POLICY_CONFLICT: 'POLICY_CONFLICT',
  AUDIT_INTEGRITY: 'AUDIT_INTEGRITY_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR',
};

// ─── User-Facing Messages ─────────────────────────────────────────────────────
// These are safe to show to users - no internal details.

const USER_MESSAGES = {
  [ErrorTypes.VALIDATION]: 'The provided data is invalid. Please check your input and try again.',
  [ErrorTypes.AUTHENTICATION]: 'Authentication failed. Please sign in again.',
  [ErrorTypes.AUTHORIZATION]: 'You do not have permission to perform this action.',
  [ErrorTypes.RATE_LIMIT]: 'Too many requests. Please wait a moment before trying again.',
  [ErrorTypes.AGENT_ERROR]: 'The agent encountered an issue. Please try again shortly.',
  [ErrorTypes.NETWORK]: 'Unable to connect to the service. Check your connection and try again.',
  [ErrorTypes.POLICY_CONFLICT]: 'This action conflicts with an existing policy.',
  [ErrorTypes.AUDIT_INTEGRITY]: 'Audit log integrity check failed. Please contact your administrator.',
  [ErrorTypes.UNKNOWN]: 'An unexpected error occurred. Please try again or contact support.',
};

// ─── AppError Class ───────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(type, message, options = {}) {
    super(message);
    this.name = 'AppError';
    this.type = type;
    this.statusCode = options.statusCode || 500;
    // eslint-disable-next-line security/detect-object-injection
    this.userMessage = options.userMessage || USER_MESSAGES[type] || USER_MESSAGES[ErrorTypes.UNKNOWN];
    this.errors = options.errors || null; // For validation errors: array of field errors
    this.retryable = options.retryable || false;
    this.timestamp = new Date().toISOString();
  }
}

// ─── Error Classifier ─────────────────────────────────────────────────────────

/**
 * Classifies any error into a structured AppError.
 * Strips sensitive details before returning.
 */
export function classifyError(error) {
  // Already classified
  if (error instanceof AppError) return error;

  const name = error?.name || '';
  const message = error?.message || '';
  const status = error?.status || error?.statusCode || 0;

  // Validation errors
  if (name === 'ValidationError' || error?.errors) {
    return new AppError(ErrorTypes.VALIDATION, message, {
      statusCode: 400,
      userMessage: USER_MESSAGES[ErrorTypes.VALIDATION],
      errors: error.errors,
    });
  }

  // Rate limiting
  if (name === 'RateLimitError' || status === 429) {
    return new AppError(ErrorTypes.RATE_LIMIT, message, {
      statusCode: 429,
      retryable: true,
    });
  }

  // Auth errors
  if (status === 401 || name === 'AuthError' || message.includes('token')) {
    return new AppError(ErrorTypes.AUTHENTICATION, message, {
      statusCode: 401,
    });
  }

  // Authorization
  if (status === 403) {
    return new AppError(ErrorTypes.AUTHORIZATION, message, {
      statusCode: 403,
    });
  }

  // Network
  if (name === 'TypeError' && message.includes('fetch')) {
    return new AppError(ErrorTypes.NETWORK, message, {
      statusCode: 503,
      retryable: true,
    });
  }

  // Default
  return new AppError(ErrorTypes.UNKNOWN, message, { statusCode: 500 });
}

// ─── Safe Error Reporter ──────────────────────────────────────────────────────

/**
 * Handles an error safely:
 * - Returns a user-safe error object
 * - Logs the FULL error internally (console in dev, could route to CloudWatch)
 * - Never exposes stack traces or internal messages to callers
 *
 * @param {Error} error
 * @param {object} context - Additional context for internal logging
 * @returns {{ type: string, message: string, errors: Array|null, retryable: boolean }}
 */
export function handleError(error, context = {}) {
  const classified = classifyError(error);

  // Internal log (redacted for production use)
  if (import.meta.env.VITE_APP_ENV !== 'production') {
    // Only log full details in non-production environments
    // eslint-disable-next-line no-console
    console.error('[ERROR]', {
      type: classified.type,
      message: sanitizeForLog(classified.message),
      context: sanitizeForLog(JSON.stringify(context)),
      timestamp: classified.timestamp,
    });
  }
  // In production: errors route to CloudWatch via Lambda or a monitoring service.
  // Do not log here to avoid leaking data. The classified error is returned to
  // the caller who decides what to show the user.

  // Return ONLY user-safe fields
  return {
    type: classified.type,
    message: classified.userMessage,
    errors: classified.errors, // Validation field errors only (safe to expose)
    retryable: classified.retryable,
    timestamp: classified.timestamp,
  };
}

// ─── API Response Error Parser ────────────────────────────────────────────────

/**
 * Parses an API response error safely.
 * Extracts status and a safe message without leaking server internals.
 */
export async function parseApiError(response) {
  const status = response.status;
  let body = null;

  try {
    body = await response.json();
  } catch {
    // Ignore JSON parse errors
  }

  // Only trust specific fields from the API response
  const safeMessage = body?.message && typeof body.message === 'string'
    ? body.message.slice(0, 200)  // Cap length
    : null;

  const errors = Array.isArray(body?.errors) ? body.errors : null;

  const error = new Error(safeMessage || `HTTP ${status}`);
  error.status = status;
  error.errors = errors;

  return classifyError(error);
}
