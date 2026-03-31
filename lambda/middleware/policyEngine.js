/**
 * Policy Engine - Self-Governance Rule Evaluation
 *
 * Evaluates governance policies against real-time actions and audit log data.
 * First implementation: separation-of-duties rules for policy approval.
 *
 * Future: Expand to rate limits, data retention, access control, etc.
 */

'use strict';

// ─── Policy Rule Types ────────────────────────────────────────────────────────

/**
 * Policy rule operators for field comparisons
 */
const OPERATORS = {
  EQUALS: 'equals',
  NOT_EQUALS: 'not_equals',
  CONTAINS: 'contains',
  NOT_CONTAINS: 'not_contains',
  GREATER_THAN: 'greater_than',
  LESS_THAN: 'less_than',
  IN: 'in',
  NOT_IN: 'not_in',
};

/**
 * Severity levels for policy violations
 */
const SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
};

// ─── Built-in Policies ────────────────────────────────────────────────────────

/**
 * Pre-defined governance policies for the system.
 * These enforce separation of duties, rate limits, and compliance requirements.
 */
const BUILT_IN_POLICIES = {
  // Separation of duties: no self-approval
  'no-self-approval': {
    id: 'no-self-approval',
    name: 'No Self-Approval of Policies',
    description: 'The user who creates a policy cannot be the approver (separation of duties)',
    enabled: true,
    severity: SEVERITY.HIGH,
    rules: [
      {
        field: 'policy.createdBy',
        operator: OPERATORS.NOT_EQUALS,
        value: '${context.requester.userId}',
      },
    ],
    actions: ['policy:approve'],
  },

  // Rate limit enforcement
  'agent-query-rate-limit': {
    id: 'agent-query-rate-limit',
    name: 'Agent Query Rate Limit',
    description: 'No user shall make more than 30 agent queries per hour',
    enabled: true,
    severity: SEVERITY.MEDIUM,
    rules: [
      {
        field: 'audit.count',
        operator: OPERATORS.LESS_THAN,
        value: 30,
        timeWindow: 3600, // 1 hour in seconds
        action: 'agent.query',
      },
    ],
    actions: ['agent:chat'],
  },

  // Audit log immutability
  'no-audit-deletion': {
    id: 'no-audit-deletion',
    name: 'Audit Logs Are Immutable',
    description: 'Audit log entries cannot be deleted or modified',
    enabled: true,
    severity: SEVERITY.CRITICAL,
    rules: [
      {
        field: 'action',
        operator: OPERATORS.NOT_IN,
        value: ['audit:delete', 'audit:modify'],
      },
    ],
    actions: ['audit:delete', 'audit:modify'],
  },
};

// ─── Policy Evaluation Engine ─────────────────────────────────────────────────

/**
 * Evaluates a policy against the current context.
 *
 * @param {string} policyId - ID of the policy to evaluate
 * @param {string} action - The action being attempted (e.g., 'policy:approve')
 * @param {object} context - Context data including:
 *   - requester: { userId, role, email }
 *   - policy: { id, createdBy, name, ... } (for policy actions)
 *   - audit: { count, recentActions, ... } (for rate limit checks)
 * @returns {Promise<{ compliant: boolean, violation?: object }>}
 */
async function evaluatePolicy(policyId, action, context) {
  const policy = BUILT_IN_POLICIES[policyId];

  if (!policy) {
    throw new PolicyEngineError(`Unknown policy ID: ${policyId}`, 'POLICY_NOT_FOUND');
  }

  if (!policy.enabled) {
    return { compliant: true };
  }

  // Check if this policy applies to the current action
  if (!policy.actions.includes(action)) {
    return { compliant: true };
  }

  // Evaluate all rules - ALL must pass for compliance
  for (const rule of policy.rules) {
    const ruleResult = evaluateRule(rule, context);
    if (!ruleResult.pass) {
      return {
        compliant: false,
        violation: {
          policyId: policy.id,
          policyName: policy.name,
          severity: policy.severity,
          rule: rule,
          actualValue: ruleResult.actualValue,
          expectedValue: ruleResult.expectedValue,
          message: buildViolationMessage(policy, rule, ruleResult),
        },
      };
    }
  }

  return { compliant: true };
}

/**
 * Evaluates a single rule against context data.
 */
function evaluateRule(rule, context) {
  // Resolve field value from context (supports dot notation)
  const actualValue = resolveField(rule.field, context);

  // Resolve expected value (supports template variables like ${context.requester.userId})
  const expectedValue = resolveValue(rule.value, context);

  // Apply operator
  const pass = applyOperator(rule.operator, actualValue, expectedValue);

  return { pass, actualValue, expectedValue };
}

/**
 * Resolves a field path from context (e.g., "policy.createdBy" → context.policy.createdBy)
 */
function resolveField(fieldPath, context) {
  const parts = fieldPath.split('.');
  let value = context;
  for (const part of parts) {
    if (value && typeof value === 'object') {
      value = value[part];
    } else {
      return undefined;
    }
  }
  return value;
}

/**
 * Resolves a value, handling template variables like ${context.requester.userId}
 */
function resolveValue(value, context) {
  if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
    // Extract variable path: ${context.requester.userId} → context.requester.userId
    const varPath = value.slice(2, -1);
    return resolveField(varPath, { context });
  }
  return value;
}

/**
 * Applies a comparison operator
 */
function applyOperator(operator, actualValue, expectedValue) {
  switch (operator) {
    case OPERATORS.EQUALS:
      return actualValue === expectedValue;
    case OPERATORS.NOT_EQUALS:
      return actualValue !== expectedValue;
    case OPERATORS.CONTAINS:
      return String(actualValue).includes(String(expectedValue));
    case OPERATORS.NOT_CONTAINS:
      return !String(actualValue).includes(String(expectedValue));
    case OPERATORS.GREATER_THAN:
      return Number(actualValue) > Number(expectedValue);
    case OPERATORS.LESS_THAN:
      return Number(actualValue) < Number(expectedValue);
    case OPERATORS.IN:
      return Array.isArray(expectedValue) && expectedValue.includes(actualValue);
    case OPERATORS.NOT_IN:
      return Array.isArray(expectedValue) && !expectedValue.includes(actualValue);
    default:
      throw new PolicyEngineError(`Unknown operator: ${operator}`, 'INVALID_OPERATOR');
  }
}

/**
 * Builds a human-readable violation message
 */
function buildViolationMessage(policy, rule, ruleResult) {
  return `${policy.name}: Field '${rule.field}' value '${ruleResult.actualValue}' violates rule '${rule.operator}' '${ruleResult.expectedValue}'`;
}

// ─── Batch Evaluation ─────────────────────────────────────────────────────────

/**
 * Evaluates all applicable policies for a given action.
 * Returns the first violation found, or compliant if all pass.
 */
async function evaluateAllPolicies(action, context) {
  const applicablePolicies = Object.keys(BUILT_IN_POLICIES).filter((policyId) => {
    const policy = BUILT_IN_POLICIES[policyId];
    return policy.enabled && policy.actions.includes(action);
  });

  for (const policyId of applicablePolicies) {
    const result = await evaluatePolicy(policyId, action, context);
    if (!result.compliant) {
      return result; // Return first violation
    }
  }

  return { compliant: true };
}

// ─── Error Class ──────────────────────────────────────────────────────────────

class PolicyEngineError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PolicyEngineError';
    this.code = code;
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  evaluatePolicy,
  evaluateAllPolicies,
  BUILT_IN_POLICIES,
  OPERATORS,
  SEVERITY,
  PolicyEngineError,
};
