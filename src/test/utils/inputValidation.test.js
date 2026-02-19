/**
 * Tests: Input Validation & Sanitization Guardrails
 */
import { describe, it, expect } from 'vitest';
import {
  sanitizeHtml,
  sanitizeText,
  sanitizeForLog,
  sanitizeChatMessage,
  containsSqlInjection,
  validate,
  validateChatMessage,


  schemas,
  LIMITS,
  ValidationError,
} from '../../utils/inputValidation.js';

// ─── sanitizeHtml ──────────────────────────────────────────────────────────────

describe('sanitizeHtml', () => {
  it('returns empty string for non-string input', () => {
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(undefined)).toBe('');
    expect(sanitizeHtml(123)).toBe('');
    expect(sanitizeHtml({})).toBe('');
  });

  it('strips all HTML tags while keeping text content', () => {
    expect(sanitizeHtml('<b>bold</b>')).toBe('bold');
    expect(sanitizeHtml('<p>paragraph</p>')).toBe('paragraph');
    expect(sanitizeHtml('<div><span>nested</span></div>')).toBe('nested');
  });

  it('strips script tags (XSS protection)', () => {
    const result = sanitizeHtml('<script>alert("xss")</script>Hello');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('alert');
  });

  it('strips event handlers', () => {
    const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('alert');
  });

  it('passes through clean plain text unchanged', () => {
    expect(sanitizeHtml('Hello, World!')).toBe('Hello, World!');
    expect(sanitizeHtml('No HTML here')).toBe('No HTML here');
  });

  it('handles javascript: protocol in anchors', () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
    expect(result).not.toContain('javascript:');
    expect(result).not.toContain('<a');
  });
});

// ─── sanitizeText ─────────────────────────────────────────────────────────────

describe('sanitizeText', () => {
  it('returns empty string for non-string input', () => {
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(undefined)).toBe('');
  });

  it('removes HTML special characters', () => {
    expect(sanitizeText('<div>')).toBe('div');
    expect(sanitizeText('"quoted"')).toBe('quoted');
    expect(sanitizeText("it's")).toBe('its');
    expect(sanitizeText('back`tick')).toBe('backtick');
  });

  it('removes control characters', () => {
    const withControl = 'hello\x00world\x01test';
    const result = sanitizeText(withControl);
    expect(result).toBe('helloWorldtest'.toLowerCase().replace('w', 'w'));
    // More precisely:
    expect(result).not.toMatch(/[\x00-\x08]/);
  });

  it('trims whitespace', () => {
    expect(sanitizeText('  hello  ')).toBe('hello');
  });

  it('caps at 10000 characters', () => {
    const long = 'a'.repeat(15000);
    expect(sanitizeText(long).length).toBe(10000);
  });

  it('preserves normal text', () => {
    expect(sanitizeText('Normal text 123')).toBe('Normal text 123');
  });
});

// ─── sanitizeForLog ───────────────────────────────────────────────────────────

describe('sanitizeForLog', () => {
  it('converts non-strings using String()', () => {
    expect(sanitizeForLog(42)).toBe('42');
    expect(sanitizeForLog(null)).toBe('null');
  });

  it('replaces newlines and tabs with spaces (log injection prevention)', () => {
    expect(sanitizeForLog('line1\nline2')).toBe('line1 line2');
    expect(sanitizeForLog('col1\tcol2')).toBe('col1 col2');
    expect(sanitizeForLog('win\r\nline')).toBe('win  line');
  });

  it('removes non-printable ASCII characters', () => {
    const result = sanitizeForLog('\x00hello\x1Fworld');
    expect(result).toBe('helloworld');
  });

  it('caps at 1000 characters', () => {
    const long = 'a'.repeat(2000);
    expect(sanitizeForLog(long).length).toBe(1000);
  });

  it('trims whitespace', () => {
    expect(sanitizeForLog('  hello  ')).toBe('hello');
  });
});

// ─── sanitizeChatMessage ──────────────────────────────────────────────────────

describe('sanitizeChatMessage', () => {
  it('returns empty string for non-string input', () => {
    expect(sanitizeChatMessage(null)).toBe('');
    expect(sanitizeChatMessage(undefined)).toBe('');
  });

  it('strips HTML tags from chat messages', () => {
    const result = sanitizeChatMessage('<b>Hello</b> world');
    expect(result).not.toContain('<b>');
    expect(result).toContain('Hello');
    expect(result).toContain('world');
  });

  it('truncates to CHAT_MESSAGE_MAX_LENGTH', () => {
    const long = 'a'.repeat(LIMITS.CHAT_MESSAGE_MAX_LENGTH + 100);
    expect(sanitizeChatMessage(long).length).toBe(LIMITS.CHAT_MESSAGE_MAX_LENGTH);
  });

  it('passes short clean messages through', () => {
    expect(sanitizeChatMessage('Hello, can you help me?')).toBe('Hello, can you help me?');
  });
});

// ─── containsSqlInjection ─────────────────────────────────────────────────────

describe('containsSqlInjection', () => {
  it('returns false for non-string input', () => {
    expect(containsSqlInjection(null)).toBe(false);
    expect(containsSqlInjection(123)).toBe(false);
  });

  it('detects SQL keywords', () => {
    expect(containsSqlInjection('SELECT * FROM users')).toBe(true);
    expect(containsSqlInjection('DROP TABLE users')).toBe(true);
    expect(containsSqlInjection('INSERT INTO users VALUES')).toBe(true);
    expect(containsSqlInjection('DELETE FROM sessions')).toBe(true);
    expect(containsSqlInjection('UPDATE users SET admin=1')).toBe(true);
    expect(containsSqlInjection('UNION SELECT password FROM users')).toBe(true);
  });

  it('detects SQL comment sequences', () => {
    expect(containsSqlInjection("admin' --")).toBe(true);
    expect(containsSqlInjection('1 /* comment */')).toBe(true);
    expect(containsSqlInjection('1; DROP TABLE--')).toBe(true);
  });

  it('returns false for clean inputs', () => {
    expect(containsSqlInjection('What is the compliance status?')).toBe(false);
    expect(containsSqlInjection('Show me the policy list')).toBe(false);
    expect(containsSqlInjection('User name: John Doe')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(containsSqlInjection('select * from users')).toBe(true);
    expect(containsSqlInjection('Select * From Users')).toBe(true);
  });
});

// ─── validate (Zod schemas) ───────────────────────────────────────────────────

describe('validate with chatMessage schema', () => {
  it('returns success for valid chat message', () => {
    const result = validate(schemas.chatMessage, {
      content: 'What is our GDPR compliance status?',
      agentId: 'compliance',
    });
    expect(result.success).toBe(true);
    expect(result.errors).toBeNull();
    expect(result.data.agentId).toBe('compliance');
  });

  it('fails when content is empty', () => {
    const result = validate(schemas.chatMessage, {
      content: '',
      agentId: 'compliance',
    });
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('content');
  });

  it('fails with invalid agentId', () => {
    const result = validate(schemas.chatMessage, {
      content: 'Hello',
      agentId: 'invalid-agent',
    });
    expect(result.success).toBe(false);
    expect(result.errors[0].field).toBe('agentId');
  });

  it('accepts all valid agent IDs', () => {
    const agents = ['compliance', 'policy', 'audit', 'ethics', 'privacy'];
    for (const agentId of agents) {
      const result = validate(schemas.chatMessage, { content: 'Hello', agentId });
      expect(result.success).toBe(true);
    }
  });

  it('fails when content exceeds max length', () => {
    const result = validate(schemas.chatMessage, {
      content: 'a'.repeat(LIMITS.CHAT_MESSAGE_MAX_LENGTH + 1),
      agentId: 'compliance',
    });
    expect(result.success).toBe(false);
  });
});

describe('validate with policy schema', () => {
  const validPolicy = {
    name: 'GDPR Data Retention',
    description: 'Ensures data is retained for no more than 7 years',
    framework: 'GDPR',
    severity: 'high',
    rules: 'No PII data shall be stored beyond 7 years without consent renewal.',
    enabled: true,
  };

  it('returns success for valid policy', () => {
    const result = validate(schemas.policy, validPolicy);
    expect(result.success).toBe(true);
  });

  it('fails when name is too short', () => {
    const result = validate(schemas.policy, { ...validPolicy, name: 'ab' });
    expect(result.success).toBe(false);
    expect(result.errors[0].field).toBe('name');
  });

  it('fails with invalid framework', () => {
    const result = validate(schemas.policy, { ...validPolicy, framework: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('fails with invalid severity', () => {
    const result = validate(schemas.policy, { ...validPolicy, severity: 'extreme' });
    expect(result.success).toBe(false);
  });

  it('rejects special characters in policy name', () => {
    const result = validate(schemas.policy, { ...validPolicy, name: 'Policy<Script>' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid frameworks', () => {
    const frameworks = ['GDPR', 'CCPA', 'HIPAA', 'SOX', 'ISO27001', 'NIST', 'CUSTOM'];
    for (const framework of frameworks) {
      const result = validate(schemas.policy, { ...validPolicy, framework });
      expect(result.success).toBe(true);
    }
  });

  it('accepts all valid severities', () => {
    const severities = ['low', 'medium', 'high', 'critical'];
    for (const severity of severities) {
      const result = validate(schemas.policy, { ...validPolicy, severity });
      expect(result.success).toBe(true);
    }
  });
});

describe('validate with fileUpload schema', () => {
  it('accepts valid file upload', () => {
    const result = validate(schemas.fileUpload, {
      fileName: 'audit-report.pdf',
      fileType: 'application/pdf',
      fileSize: 1024 * 1024, // 1MB
    });
    expect(result.success).toBe(true);
  });

  it('rejects file exceeding size limit', () => {
    const result = validate(schemas.fileUpload, {
      fileName: 'big-file.pdf',
      fileType: 'application/pdf',
      fileSize: LIMITS.FILE_SIZE_MAX_BYTES + 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects disallowed file types', () => {
    const result = validate(schemas.fileUpload, {
      fileName: 'script.exe',
      fileType: 'application/x-executable',
      fileSize: 1000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects file names with path traversal', () => {
    const result = validate(schemas.fileUpload, {
      fileName: '../../../etc/passwd',
      fileType: 'text/plain',
      fileSize: 100,
    });
    expect(result.success).toBe(false);
  });

  it('accepts all allowed file types', () => {
    const types = LIMITS.ALLOWED_FILE_TYPES;
    for (const fileType of types) {
      const result = validate(schemas.fileUpload, {
        fileName: 'report.txt',
        fileType,
        fileSize: 100,
      });
      expect(result.success).toBe(true);
    }
  });
});

// ─── validateChatMessage ──────────────────────────────────────────────────────

describe('validateChatMessage', () => {
  it('returns sanitized data for valid input', () => {
    const result = validateChatMessage('Hello agent', 'compliance');
    expect(result.agentId).toBe('compliance');
  });

  it('throws ValidationError for empty content', () => {
    expect(() => validateChatMessage('', 'compliance')).toThrow(ValidationError);
  });

  it('throws ValidationError for invalid agentId', () => {
    expect(() => validateChatMessage('Hello', 'unknown')).toThrow(ValidationError);
  });
});

// ─── ValidationError class ────────────────────────────────────────────────────

describe('ValidationError', () => {
  it('has correct name and statusCode', () => {
    const err = new ValidationError('Test error', [{ field: 'name', message: 'Required' }]);
    expect(err.name).toBe('ValidationError');
    expect(err.statusCode).toBe(400);
    expect(err.errors).toHaveLength(1);
    expect(err.message).toBe('Test error');
  });
});
