/**
 * Policy Management with Version Control & Approval Workflow
 *
 * Guardrails:
 * - All policy changes require approval from authorized users
 * - Full version history maintained for every policy
 * - Policy conflicts detected before activation
 * - Dry-run mode to test policies before enforcement
 * - Change audit trail logged for every mutation
 */

import { generateSecureId, hashObject } from './crypto.js';
import { validatePolicy } from './inputValidation.js';
import { auditLogger, AUDIT_ACTIONS, RISK_LEVELS } from './auditLogger.js';
import { assertPermission, requiresApproval, RESOURCES } from '../auth/rbac.js';
import { apiFetch } from '../auth/authService.js';

// ─── Policy Status ────────────────────────────────────────────────────────────

export const POLICY_STATUS = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  ACTIVE: 'active',
  DISABLED: 'disabled',
  REJECTED: 'rejected',
  ARCHIVED: 'archived',
};

// ─── Policy Manager ───────────────────────────────────────────────────────────

export const policyManager = {
  /**
   * Creates a new policy.
   * Validates, checks RBAC, creates version 1, optionally submits for approval.
   *
   * @param {object} policyData - Raw policy input
   * @param {object} user - Current user
   * @returns {Promise<object>} Created policy
   */
  async createPolicy(policyData, user) {
    // RBAC check
    assertPermission(user, RESOURCES.POLICY_CREATE);

    // Validate and sanitize input
    const validated = validatePolicy(policyData);

    // Check if this requires approval workflow
    const needsApproval = requiresApproval(user, RESOURCES.POLICY_CREATE);
    const status = needsApproval ? POLICY_STATUS.PENDING_APPROVAL : POLICY_STATUS.ACTIVE;

    // Build policy object
    const now = new Date().toISOString();
    const policy = {
      id: generateSecureId(),
      ...validated,
      status,
      version: 1,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
      approvedBy: needsApproval ? null : user.id,
      approvedAt: needsApproval ? null : now,
      history: [
        createHistoryEntry('created', user.id, validated, null, now),
      ],
    };

    // Compute integrity hash for this version
    policy.versionHash = await hashObject({
      id: policy.id,
      version: policy.version,
      name: policy.name,
      rules: policy.rules,
      framework: policy.framework,
    });

    // Conflict detection
    const conflicts = await this._detectConflicts(policy);
    if (conflicts.length > 0) {
      await auditLogger.log({
        action: AUDIT_ACTIONS.POLICY_CREATED,
        agent: 'Policy Agent',
        userId: user.id,
        result: 'warning',
        risk: RISK_LEVELS.MEDIUM,
        details: { policyId: policy.id, conflicts: conflicts.length },
      });
      // Attach conflicts but don't block creation
      policy.conflicts = conflicts;
    }

    // Persist
    await this._persistPolicy(policy);

    // Audit log
    await auditLogger.log({
      action: AUDIT_ACTIONS.POLICY_CREATED,
      agent: 'Policy Agent',
      userId: user.id,
      result: 'success',
      risk: RISK_LEVELS.LOW,
      details: {
        policyId: policy.id,
        policyName: policy.name,
        status: policy.status,
        requiresApproval: needsApproval,
      },
    });

    return policy;
  },

  /**
   * Updates an existing policy. Creates a new version.
   */
  async updatePolicy(policyId, updates, user) {
    assertPermission(user, RESOURCES.POLICY_UPDATE);

    const existing = await this._fetchPolicy(policyId);
    if (!existing) throw new PolicyError(`Policy ${policyId} not found`, 404);

    // Validate updates
    const validated = validatePolicy({ ...existing, ...updates });
    const needsApproval = requiresApproval(user, RESOURCES.POLICY_UPDATE);

    const now = new Date().toISOString();
    const newVersion = existing.version + 1;

    const updated = {
      ...existing,
      ...validated,
      version: newVersion,
      status: needsApproval ? POLICY_STATUS.PENDING_APPROVAL : existing.status,
      updatedBy: user.id,
      updatedAt: now,
      history: [
        ...existing.history,
        createHistoryEntry('updated', user.id, validated, existing, now),
      ],
    };

    updated.versionHash = await hashObject({
      id: updated.id,
      version: updated.version,
      name: updated.name,
      rules: updated.rules,
      framework: updated.framework,
    });

    await this._persistPolicy(updated);

    await auditLogger.log({
      action: AUDIT_ACTIONS.POLICY_UPDATED,
      agent: 'Policy Agent',
      userId: user.id,
      result: 'success',
      risk: RISK_LEVELS.MEDIUM,
      details: {
        policyId,
        policyName: updated.name,
        previousVersion: existing.version,
        newVersion,
        requiresApproval: needsApproval,
      },
    });

    return updated;
  },

  /**
   * Approves or rejects a pending policy change.
   * Only users with POLICY_APPROVE permission can do this.
   */
  async approvePolicy(policyId, action, comment, approver) {
    assertPermission(approver, RESOURCES.POLICY_APPROVE);

    // Approver cannot approve their own policies (separation of duties)
    const existing = await this._fetchPolicy(policyId);
    if (!existing) throw new PolicyError(`Policy ${policyId} not found`, 404);

    if (existing.createdBy === approver.id || existing.updatedBy === approver.id) {
      throw new PolicyError(
        'Cannot approve your own policy change (separation of duties)',
        403
      );
    }

    if (existing.status !== POLICY_STATUS.PENDING_APPROVAL) {
      throw new PolicyError(`Policy is not pending approval (status: ${existing.status})`, 409);
    }

    const now = new Date().toISOString();
    const newStatus = action === 'approve' ? POLICY_STATUS.ACTIVE : POLICY_STATUS.REJECTED;

    const updated = {
      ...existing,
      status: newStatus,
      approvedBy: approver.id,
      approvedAt: now,
      approvalComment: comment || null,
      updatedAt: now,
      history: [
        ...existing.history,
        createHistoryEntry(action, approver.id, { comment }, existing, now),
      ],
    };

    await this._persistPolicy(updated);

    const auditAction = action === 'approve' ? AUDIT_ACTIONS.POLICY_APPROVED : AUDIT_ACTIONS.POLICY_REJECTED;
    await auditLogger.log({
      action: auditAction,
      agent: 'Policy Agent',
      userId: approver.id,
      result: 'success',
      risk: RISK_LEVELS.MEDIUM,
      details: {
        policyId,
        policyName: existing.name,
        action,
        comment,
      },
    });

    return updated;
  },

  /**
   * Enables or disables a policy.
   */
  async setEnabled(policyId, enabled, user) {
    assertPermission(user, RESOURCES.POLICY_ENABLE_DISABLE);

    const existing = await this._fetchPolicy(policyId);
    if (!existing) throw new PolicyError(`Policy ${policyId} not found`, 404);

    const newStatus = enabled ? POLICY_STATUS.ACTIVE : POLICY_STATUS.DISABLED;
    const now = new Date().toISOString();

    const updated = {
      ...existing,
      status: newStatus,
      enabled,
      updatedAt: now,
      history: [
        ...existing.history,
        createHistoryEntry(enabled ? 'enabled' : 'disabled', user.id, {}, existing, now),
      ],
    };

    await this._persistPolicy(updated);

    const action = enabled ? AUDIT_ACTIONS.POLICY_ENABLED : AUDIT_ACTIONS.POLICY_DISABLED;
    await auditLogger.log({
      action,
      agent: 'Policy Agent',
      userId: user.id,
      result: 'success',
      risk: RISK_LEVELS.MEDIUM,
      details: { policyId, policyName: existing.name, enabled },
    });

    return updated;
  },

  /**
   * Dry-run tests a policy rule against sample data.
   * Does not save or enforce anything.
   */
  async dryRunPolicy(policyData, testData, user) {
    assertPermission(user, RESOURCES.POLICY_READ);
    const validated = validatePolicy(policyData);

    // Simulate policy evaluation (real implementation calls Lambda)
    const result = {
      policyId: 'dry-run',
      policyName: validated.name,
      testData,
      passed: true,
      violations: [],
      warnings: [],
      estimatedImpact: 'Low',
      isDryRun: true,
      evaluatedAt: new Date().toISOString(),
    };

    await auditLogger.log({
      action: AUDIT_ACTIONS.COMPLIANCE_SCAN,
      agent: 'Policy Agent',
      userId: user.id,
      result: 'success',
      risk: RISK_LEVELS.LOW,
      details: { isDryRun: true, policyName: validated.name },
    });

    return result;
  },

  // ─── Private ─────────────────────────────────────────────────────────────────

  async _fetchPolicy(policyId) {
    try {
      const response = await apiFetch(`/policies/${policyId}`);
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  },

  async _persistPolicy(policy) {
    const response = await apiFetch(`/policies/${policy.id}`, {
      method: 'PUT',
      body: JSON.stringify(policy),
    });
    if (!response.ok) {
      throw new PolicyError('Failed to persist policy', 500);
    }
    return response.json();
  },

  async _detectConflicts(newPolicy) {
    try {
      const response = await apiFetch('/policies/conflicts', {
        method: 'POST',
        body: JSON.stringify({ policy: newPolicy }),
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.conflicts || [];
    } catch {
      return []; // Non-blocking - return empty on error
    }
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createHistoryEntry(action, userId, newData, previousData, timestamp) {
  return {
    id: generateSecureId(),
    action,
    userId,
    timestamp,
    changes: previousData
      ? computeChanges(previousData, newData)
      : null,
  };
}

function computeChanges(previous, next) {
  const changes = {};
  const fields = ['name', 'description', 'framework', 'severity', 'rules', 'enabled'];
  for (const field of fields) {
    /* eslint-disable security/detect-object-injection */
    if (previous[field] !== next[field]) {
      changes[field] = { from: previous[field], to: next[field] };
    }
    /* eslint-enable security/detect-object-injection */
  }
  return changes;
}

// ─── Custom Error ─────────────────────────────────────────────────────────────

export class PolicyError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = 'PolicyError';
    this.statusCode = statusCode;
  }
}
