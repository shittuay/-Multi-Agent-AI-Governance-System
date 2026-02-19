/**
 * Input Validation & Sanitization Guardrails
 *
 * Provides centralized input validation and sanitization for all user inputs
 * to prevent XSS, injection attacks, and invalid data entering the system.
 */

import DOMPurify from 'dompurify';
import { z } from 'zod';

// ─── Constants ────────────────────────────────────────────────────────────────

export const LIMITS = {
  CHAT_MESSAGE_MAX_LENGTH: parseInt(import.meta.env.VITE_MAX_CHAT_MESSAGE_LENGTH) || 2000,
  POLICY_NAME_MAX_LENGTH: 100,
  POLICY_DESCRIPTION_MAX_LENGTH: 500,
  POLICY_RULE_MAX_LENGTH: 5000,
  SEARCH_QUERY_MAX_LENGTH: 200,
  USER_NAME_MAX_LENGTH: 100,
  EMAIL_MAX_LENGTH: 254,
  COMMENT_MAX_LENGTH: 1000,
  FILE_SIZE_MAX_BYTES: 10 * 1024 * 1024, // 10MB
  ALLOWED_FILE_TYPES: ['application/pdf', 'text/csv', 'application/json', 'text/plain'],
};

// ─── Sanitization ─────────────────────────────────────────────────────────────

/**
 * Sanitizes a string to remove HTML/XSS attack vectors.
 * Uses DOMPurify with strict configuration.
 */
export function sanitizeHtml(input) {
  if (typeof input !== 'string') return '';
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],      // Strip ALL HTML tags
    ALLOWED_ATTR: [],      // Strip ALL attributes
    KEEP_CONTENT: true,    // Keep text content
  });
}

/**
 * Sanitizes a string for use in plain text contexts (no HTML at all).
 * More aggressive than sanitizeHtml - removes any characters that could
 * be problematic in logs, IDs, or structured data.
 */
export function sanitizeText(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[<>"'`]/g, '')          // Remove HTML special chars
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .trim()
    .slice(0, 10000); // Hard cap
}

/**
 * Sanitizes text intended for audit log entries.
 * Prevents log injection by removing newlines and control characters.
 */
export function sanitizeForLog(input) {
  if (typeof input !== 'string') return String(input);
  return input
    .replace(/[\r\n\t]/g, ' ')       // Replace newlines/tabs with space
    .replace(/[^\x20-\x7E]/g, '')    // Keep only printable ASCII
    .trim()
    .slice(0, 1000);                 // Limit log entry length
}

/**
 * Sanitizes a chat message before processing or display.
 */
export function sanitizeChatMessage(message) {
  if (typeof message !== 'string') return '';
  const sanitized = sanitizeHtml(message);
  return sanitized.slice(0, LIMITS.CHAT_MESSAGE_MAX_LENGTH);
}

// ─── Validation Schemas (Zod) ─────────────────────────────────────────────────

export const schemas = {
  chatMessage: z.object({
    content: z
      .string()
      .min(1, 'Message cannot be empty')
      .max(LIMITS.CHAT_MESSAGE_MAX_LENGTH, `Message cannot exceed ${LIMITS.CHAT_MESSAGE_MAX_LENGTH} characters`)
      .transform(sanitizeChatMessage),
    agentId: z
      .enum(['compliance', 'policy', 'audit', 'ethics', 'privacy'], {
        errorMap: () => ({ message: 'Invalid agent ID' }),
      }),
  }),

  policy: z.object({
    name: z
      .string()
      .min(3, 'Policy name must be at least 3 characters')
      .max(LIMITS.POLICY_NAME_MAX_LENGTH)
      .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Policy name contains invalid characters')
      .transform(sanitizeText),
    description: z
      .string()
      .max(LIMITS.POLICY_DESCRIPTION_MAX_LENGTH)
      .transform(sanitizeText),
    framework: z
      .enum(['GDPR', 'CCPA', 'HIPAA', 'SOX', 'ISO27001', 'NIST', 'CUSTOM'], {
        errorMap: () => ({ message: 'Invalid regulatory framework' }),
      }),
    severity: z
      .enum(['low', 'medium', 'high', 'critical'], {
        errorMap: () => ({ message: 'Invalid severity level' }),
      }),
    rules: z
      .string()
      .max(LIMITS.POLICY_RULE_MAX_LENGTH)
      .transform(sanitizeText),
    enabled: z.boolean().default(true),
  }),

  searchQuery: z.object({
    query: z
      .string()
      .max(LIMITS.SEARCH_QUERY_MAX_LENGTH)
      .transform(sanitizeText),
    agentType: z
      .enum(['compliance', 'policy', 'audit', 'ethics', 'privacy', 'all'])
      .optional(),
    dateFrom: z.string().datetime().optional(),
    dateTo: z.string().datetime().optional(),
    page: z.number().int().min(1).max(1000).default(1),
    limit: z.number().int().min(1).max(100).default(20),
  }),

  fileUpload: z.object({
    fileName: z
      .string()
      .max(255)
      .regex(/^[a-zA-Z0-9\-_. ]+$/, 'File name contains invalid characters'),
    fileType: z
      .string()
      .refine(
        (type) => LIMITS.ALLOWED_FILE_TYPES.includes(type),
        `File type must be one of: ${LIMITS.ALLOWED_FILE_TYPES.join(', ')}`
      ),
    fileSize: z
      .number()
      .max(LIMITS.FILE_SIZE_MAX_BYTES, `File size cannot exceed ${LIMITS.FILE_SIZE_MAX_BYTES / 1024 / 1024}MB`),
  }),

  policyApproval: z.object({
    policyId: z
      .string()
      .uuid('Invalid policy ID format'),
    action: z
      .enum(['approve', 'reject', 'request_changes'], {
        errorMap: () => ({ message: 'Invalid approval action' }),
      }),
    comment: z
      .string()
      .max(LIMITS.COMMENT_MAX_LENGTH)
      .optional()
      .transform((val) => val ? sanitizeText(val) : val),
  }),
};

// ─── Validation Functions ─────────────────────────────────────────────────────

/**
 * Validates data against a schema. Returns { success, data, errors }.
 */
export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data, errors: null };
  }
  const errors = result.error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
  return { success: false, data: null, errors };
}

/**
 * Validates a chat message. Returns sanitized message or throws.
 */
export function validateChatMessage(content, agentId) {
  const result = validate(schemas.chatMessage, { content, agentId });
  if (!result.success) {
    throw new ValidationError('Invalid chat message', result.errors);
  }
  return result.data;
}

/**
 * Validates a policy object before creation/update.
 */
export function validatePolicy(policyData) {
  const result = validate(schemas.policy, policyData);
  if (!result.success) {
    throw new ValidationError('Invalid policy data', result.errors);
  }
  return result.data;
}

/**
 * Validates a file upload metadata before processing.
 */
export function validateFileUpload(fileMetadata) {
  const result = validate(schemas.fileUpload, fileMetadata);
  if (!result.success) {
    throw new ValidationError('Invalid file', result.errors);
  }
  return result.data;
}

// ─── Input Checkers ──────────────────────────────────────────────────────────

/**
 * Checks if a string contains potential SQL injection patterns.
 * Used as an additional layer for search inputs.
 */
export function containsSqlInjection(input) {
  if (typeof input !== 'string') return false;
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/gi,
    /(--|\/\*|\*\/|xp_|sp_)/gi,
    /('|('')|;|--|\+|\/\*|\*\/)/g,
  ];
  return sqlPatterns.some((pattern) => pattern.test(input));
}

/**
 * Checks if a URL is safe (same origin or explicitly allowed).
 */
export function isSafeUrl(url) {
  try {
    const parsed = new URL(url);
    const allowedOrigins = [
      window.location.origin,
      import.meta.env.VITE_API_BASE_URL,
    ].filter(Boolean);

    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      allowedOrigins.some((origin) => url.startsWith(origin))
    );
  } catch {
    return false;
  }
}

// ─── Custom Error Class ───────────────────────────────────────────────────────

export class ValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
    this.statusCode = 400;
  }
}
