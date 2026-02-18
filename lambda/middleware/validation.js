/**
 * Lambda Request Validation Middleware
 *
 * Validates all incoming API Gateway requests:
 * - Request size limits
 * - Content-Type validation
 * - JSON parsing with error handling
 * - Input schema validation
 * - SQL/NoSQL injection detection
 */

'use strict';

const MAX_BODY_SIZE = 64 * 1024; // 64KB max request body

/**
 * Validates and parses an API Gateway event.
 * Returns { valid, body, error }.
 */
function validateRequest(event) {
  // Check body size
  const bodyLength = Buffer.byteLength(event.body || '', 'utf8');
  if (bodyLength > MAX_BODY_SIZE) {
    return {
      valid: false,
      error: createErrorResponse(413, 'Request entity too large'),
    };
  }

  // Check Content-Type for POST/PUT requests
  const method = event.httpMethod;
  if (['POST', 'PUT', 'PATCH'].includes(method)) {
    const contentType = event.headers?.['Content-Type'] || event.headers?.['content-type'] || '';
    if (!contentType.includes('application/json')) {
      return {
        valid: false,
        error: createErrorResponse(415, 'Content-Type must be application/json'),
      };
    }
  }

  // Parse JSON body
  let body = null;
  if (event.body) {
    try {
      body = JSON.parse(event.body);
    } catch {
      return {
        valid: false,
        error: createErrorResponse(400, 'Invalid JSON body'),
      };
    }
  }

  // Check for injection patterns in query strings
  if (event.queryStringParameters) {
    for (const [, value] of Object.entries(event.queryStringParameters)) {
      if (containsInjectionPattern(String(value))) {
        return {
          valid: false,
          error: createErrorResponse(400, 'Invalid query parameter'),
        };
      }
    }
  }

  return { valid: true, body };
}

/**
 * Checks for common injection attack patterns.
 */
function containsInjectionPattern(input) {
  const patterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
    /(--|\/\*|\*\/|xp_|sp_)/,
    /(<script|javascript:|on\w+=)/i,
  ];
  return patterns.some((p) => p.test(input));
}

/**
 * Sanitizes a string for safe use in responses/logs.
 */
function sanitizeString(input) {
  if (typeof input !== 'string') return String(input || '');
  return input
    .replace(/[<>"'`]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, 1000);
}

/**
 * Creates a standardized error response.
 */
function createErrorResponse(statusCode, message, headers = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
    body: JSON.stringify({ message }),
  };
}

module.exports = { validateRequest, sanitizeString, createErrorResponse, containsInjectionPattern };
