/**
 * Audit Logger - Immutable Audit Log with Hash Chain
 *
 * Every action in the governance system is recorded with:
 * - Cryptographic hash of the entry content
 * - Chain hash linking to the previous entry (tamper detection)
 * - Timestamp, agent, user, action, result, risk level
 *
 * The hash chain means any modification to any entry is detectable
 * by re-verifying the chain from the beginning.
 */

import { computeAuditEntryHash, generateSecureId, verifyAuditChain } from './crypto.js';
import { sanitizeForLog } from './inputValidation.js';
import { apiFetch } from '../auth/authService.js';

// ─── Risk Levels ──────────────────────────────────────────────────────────────

export const RISK_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// ─── Action Types ─────────────────────────────────────────────────────────────

export const AUDIT_ACTIONS = {
  // Auth
  USER_SIGN_IN: 'user.sign_in',
  USER_SIGN_OUT: 'user.sign_out',
  USER_SESSION_TIMEOUT: 'user.session_timeout',
  USER_MFA_CHALLENGE: 'user.mfa_challenge',
  AUTH_FAILED: 'auth.failed',

  // Agent interactions
  AGENT_QUERY: 'agent.query',
  AGENT_RESPONSE: 'agent.response',
  AGENT_STATUS_CHANGE: 'agent.status_change',

  // Policy management
  POLICY_CREATED: 'policy.created',
  POLICY_UPDATED: 'policy.updated',
  POLICY_DELETED: 'policy.deleted',
  POLICY_ENABLED: 'policy.enabled',
  POLICY_DISABLED: 'policy.disabled',
  POLICY_APPROVED: 'policy.approved',
  POLICY_REJECTED: 'policy.rejected',

  // Compliance
  COMPLIANCE_VIOLATION: 'compliance.violation',
  COMPLIANCE_OVERRIDE: 'compliance.override',
  COMPLIANCE_SCAN: 'compliance.scan',

  // Ethics
  BIAS_DETECTED: 'ethics.bias_detected',
  BIAS_SCAN: 'ethics.bias_scan',
  ETHICS_ALERT: 'ethics.alert',

  // Privacy
  PII_ACCESS: 'privacy.pii_access',
  DATA_EXPORT: 'privacy.data_export',
  CONSENT_CHANGE: 'privacy.consent_change',
  PRIVACY_VIOLATION: 'privacy.violation',

  // System
  AUDIT_EXPORT: 'audit.export',
  AUDIT_VERIFICATION: 'audit.verification',
  SYSTEM_CONFIG_CHANGE: 'system.config_change',
  RATE_LIMIT_EXCEEDED: 'security.rate_limit_exceeded',
  UNAUTHORIZED_ACCESS: 'security.unauthorized_access',
};

// ─── In-Memory Log Buffer ─────────────────────────────────────────────────────
// Holds recent entries locally before they're persisted to DynamoDB.
// On page reload, entries are fetched from the server.

let _localLog = [];
let _lastHash = 'GENESIS';

// ─── Audit Logger ─────────────────────────────────────────────────────────────

export const auditLogger = {
  /**
   * Logs an audit event.
   * Computes entry and chain hashes, appends to local buffer, sends to server.
   *
   * @param {object} options
   * @param {string} options.action - One of AUDIT_ACTIONS
   * @param {string} options.agent - Agent name (e.g., 'Compliance Agent')
   * @param {string} options.userId - ID of the user performing the action
   * @param {string} options.result - 'success' | 'failure' | 'warning'
   * @param {string} options.risk - One of RISK_LEVELS
   * @param {object} options.details - Safe, scrubbed details (no PII/credentials)
   * @returns {Promise<object>} The created audit entry
   */
  async log({ action, agent, userId, result, risk = RISK_LEVELS.LOW, details = {} }) {
    const entry = {
      id: generateSecureId(),
      timestamp: new Date().toISOString(),
      action: sanitizeForLog(action),
      agent: sanitizeForLog(agent),
      userId: sanitizeForLog(userId || 'system'),
      result: sanitizeForLog(result || 'unknown'),
      risk,
      details: scrubSensitiveDetails(details),
      // These will be computed below
      entryHash: null,
      chainHash: null,
      previousHash: _lastHash,
    };

    // Compute hashes
    const { entryHash, chainHash } = await computeAuditEntryHash(entry, _lastHash);
    entry.entryHash = entryHash;
    entry.chainHash = chainHash;

    // Update chain state
    _lastHash = chainHash;

    // Append to local buffer
    _localLog.push(entry);

    // Persist to server (non-blocking - fire and forget with error handling)
    this._persistEntry(entry).catch((_err) => {
      // Silently swallow - audit persistence failures must never crash the UI.
      // In production these failures are captured via CloudWatch metrics.
    });

    return entry;
  },

  /**
   * Returns recent log entries from the local buffer.
   */
  getLocalEntries(limit = 100) {
    return _localLog.slice(-limit);
  },

  /**
   * Fetches audit log entries from the server with pagination.
   */
  async fetchEntries({ page = 1, limit = 20, agentType, dateFrom, dateTo } = {}) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit),
      ...(agentType && agentType !== 'all' ? { agentType } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
    });

    const response = await apiFetch(`/audit/logs?${params}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch audit logs: ${response.status}`);
    }
    return response.json();
  },

  /**
   * Verifies the integrity of a set of audit log entries.
   * Returns verification report.
   */
  async verifyIntegrity(entries) {
    const result = await verifyAuditChain(entries);

    // Log the verification attempt itself
    await this.log({
      action: AUDIT_ACTIONS.AUDIT_VERIFICATION,
      agent: 'Audit Agent',
      userId: 'system',
      result: result.valid ? 'success' : 'failure',
      risk: result.valid ? RISK_LEVELS.LOW : RISK_LEVELS.CRITICAL,
      details: {
        entriesChecked: entries.length,
        chainValid: result.valid,
        firstTamperedIndex: result.firstTamperedIndex,
      },
    });

    return result;
  },

  /**
   * Exports audit logs to JSON format.
   * Includes integrity proof (hash chain).
   */
  async exportLogs(entries) {
    const export_data = {
      exportedAt: new Date().toISOString(),
      entriesCount: entries.length,
      integrityAlgorithm: 'SHA-256 Hash Chain',
      entries,
    };

    // Log the export event
    await this.log({
      action: AUDIT_ACTIONS.AUDIT_EXPORT,
      agent: 'Audit Agent',
      userId: 'system',
      result: 'success',
      risk: RISK_LEVELS.MEDIUM,
      details: { entriesExported: entries.length },
    });

    return export_data;
  },

  /**
   * Resets the local log (e.g., on sign out).
   */
  reset() {
    _localLog = [];
    _lastHash = 'GENESIS';
  },

  // ─── Private ────────────────────────────────────────────────────────────────

  async _persistEntry(entry) {
    const response = await apiFetch('/audit/logs', {
      method: 'POST',
      body: JSON.stringify(entry),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
  },
};

// ─── Sensitive Data Scrubbing ─────────────────────────────────────────────────

const SENSITIVE_KEYS = [
  'password', 'secret', 'token', 'key', 'credential', 'auth',
  'ssn', 'creditCard', 'cardNumber', 'cvv', 'pin', 'passphrase',
];

/**
 * Recursively scrubs sensitive fields from a details object before logging.
 * Prevents PII and credentials from entering audit logs.
 */
function scrubSensitiveDetails(obj, depth = 0) {
  if (depth > 5) return '[MAX_DEPTH]'; // Prevent infinite recursion
  if (obj === null || typeof obj !== 'object') {
    return typeof obj === 'string' ? sanitizeForLog(obj) : obj;
  }
  if (Array.isArray(obj)) {
    return obj.slice(0, 50).map((item) => scrubSensitiveDetails(item, depth + 1));
  }

  const scrubbed = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_KEYS.some((sk) => lowerKey.includes(sk));

    if (isSensitive) {
      // eslint-disable-next-line security/detect-object-injection
      scrubbed[key] = '[REDACTED]';
    } else {
      // eslint-disable-next-line security/detect-object-injection
      scrubbed[key] = scrubSensitiveDetails(value, depth + 1);
    }
  }
  return scrubbed;
}
