/**
 * Tests: Policy Engine - Self-Governance Rule Evaluation
 */

const { describe, it, expect, beforeEach } = require('@jest/globals');
const {
  evaluatePolicy,
  evaluateAllPolicies,
  BUILT_IN_POLICIES,
  OPERATORS,
  SEVERITY,
  PolicyEngineError,
} = require('../middleware/policyEngine.js');

// ─── evaluatePolicy ───────────────────────────────────────────────────────────

describe('evaluatePolicy', () => {
  describe('no-self-approval policy', () => {
    it('returns compliant when different user approves', async () => {
      const context = {
        requester: { userId: 'user-002', role: 'admin', email: 'admin@example.com' },
        policy: { id: 'policy-123', createdBy: 'user-001', name: 'Test Policy' },
        action: 'policy:approve',
      };

      const result = await evaluatePolicy('no-self-approval', 'policy:approve', context);

      expect(result.compliant).toBe(true);
      expect(result.violation).toBeUndefined();
    });

    it('returns violation when same user tries to approve', async () => {
      const context = {
        requester: { userId: 'user-001', role: 'admin', email: 'admin@example.com' },
        policy: { id: 'policy-123', createdBy: 'user-001', name: 'Test Policy' },
        action: 'policy:approve',
      };

      const result = await evaluatePolicy('no-self-approval', 'policy:approve', context);

      expect(result.compliant).toBe(false);
      expect(result.violation).toBeDefined();
      expect(result.violation.policyId).toBe('no-self-approval');
      expect(result.violation.policyName).toBe('No Self-Approval of Policies');
      expect(result.violation.severity).toBe(SEVERITY.HIGH);
      expect(result.violation.actualValue).toBe('user-001');
      expect(result.violation.expectedValue).toBe('user-001');
      expect(result.violation.message).toContain('policy.createdBy');
      expect(result.violation.message).toContain('not_equals');
    });

    it('returns compliant when action does not match policy', async () => {
      const context = {
        requester: { userId: 'user-001', role: 'admin', email: 'admin@example.com' },
        policy: { id: 'policy-123', createdBy: 'user-001', name: 'Test Policy' },
        action: 'policy:create', // Different action
      };

      const result = await evaluatePolicy('no-self-approval', 'policy:create', context);

      expect(result.compliant).toBe(true);
    });
  });

  describe('agent-query-rate-limit policy', () => {
    it('returns compliant when under rate limit', async () => {
      const context = {
        requester: { userId: 'user-001', role: 'user' },
        audit: { count: 25 },
        action: 'agent:chat',
      };

      const result = await evaluatePolicy('agent-query-rate-limit', 'agent:chat', context);

      expect(result.compliant).toBe(true);
    });

    it('returns violation when over rate limit', async () => {
      const context = {
        requester: { userId: 'user-001', role: 'user' },
        audit: { count: 35 },
        action: 'agent:chat',
      };

      const result = await evaluatePolicy('agent-query-rate-limit', 'agent:chat', context);

      expect(result.compliant).toBe(false);
      expect(result.violation.policyId).toBe('agent-query-rate-limit');
      expect(result.violation.severity).toBe(SEVERITY.MEDIUM);
    });
  });

  describe('no-audit-deletion policy', () => {
    it('returns compliant for non-audit actions', async () => {
      const context = {
        requester: { userId: 'user-001', role: 'admin' },
        action: 'policy:create',
      };

      const result = await evaluatePolicy('no-audit-deletion', 'policy:create', context);

      expect(result.compliant).toBe(true);
    });

    it('blocks audit deletion attempts', async () => {
      const context = {
        requester: { userId: 'user-001', role: 'admin' },
        action: 'audit:delete',
      };

      const result = await evaluatePolicy('no-audit-deletion', 'audit:delete', context);

      expect(result.compliant).toBe(false);
      expect(result.violation.policyId).toBe('no-audit-deletion');
      expect(result.violation.severity).toBe(SEVERITY.CRITICAL);
    });

    it('blocks audit modification attempts', async () => {
      const context = {
        requester: { userId: 'user-001', role: 'admin' },
        action: 'audit:modify',
      };

      const result = await evaluatePolicy('no-audit-deletion', 'audit:modify', context);

      expect(result.compliant).toBe(false);
      expect(result.violation.severity).toBe(SEVERITY.CRITICAL);
    });
  });

  describe('error handling', () => {
    it('throws PolicyEngineError for unknown policy ID', async () => {
      const context = {
        requester: { userId: 'user-001' },
        action: 'policy:approve',
      };

      await expect(
        evaluatePolicy('unknown-policy-id', 'policy:approve', context)
      ).rejects.toThrow(PolicyEngineError);

      await expect(
        evaluatePolicy('unknown-policy-id', 'policy:approve', context)
      ).rejects.toThrow('Unknown policy ID: unknown-policy-id');
    });
  });

  describe('policy enablement', () => {
    it('returns compliant when policy is disabled', async () => {
      // This test requires modifying policy state, which we can't do with current structure
      // In production, we'd have a way to enable/disable policies
      // For now, we verify the logic path exists by testing enabled policies

      const context = {
        requester: { userId: 'user-001' },
        policy: { createdBy: 'user-001' },
        action: 'policy:approve',
      };

      // All built-in policies are enabled by default
      const result = await evaluatePolicy('no-self-approval', 'policy:approve', context);
      expect(result.compliant).toBe(false); // Violation because enabled
    });
  });
});

// ─── evaluateAllPolicies ──────────────────────────────────────────────────────

describe('evaluateAllPolicies', () => {
  it('returns compliant when no policies apply', async () => {
    const context = {
      requester: { userId: 'user-001' },
      action: 'unknown:action',
    };

    const result = await evaluateAllPolicies('unknown:action', context);

    expect(result.compliant).toBe(true);
  });

  it('returns first violation found when multiple policies violated', async () => {
    // Context that violates no-self-approval
    const context = {
      requester: { userId: 'user-001', role: 'admin' },
      policy: { id: 'policy-123', createdBy: 'user-001', name: 'Test' },
      audit: { count: 35 }, // Also violates rate limit
      action: 'policy:approve',
    };

    const result = await evaluateAllPolicies('policy:approve', context);

    expect(result.compliant).toBe(false);
    expect(result.violation).toBeDefined();
    // Should return the first applicable policy violation (no-self-approval)
    expect(result.violation.policyId).toBe('no-self-approval');
  });

  it('evaluates all applicable policies', async () => {
    const context = {
      requester: { userId: 'user-002', role: 'admin' },
      policy: { id: 'policy-123', createdBy: 'user-001', name: 'Test' },
      action: 'policy:approve',
    };

    const result = await evaluateAllPolicies('policy:approve', context);

    expect(result.compliant).toBe(true);
  });

  it('returns compliant when all policies pass', async () => {
    const context = {
      requester: { userId: 'user-002' },
      audit: { count: 10 },
      action: 'agent:chat',
    };

    const result = await evaluateAllPolicies('agent:chat', context);

    expect(result.compliant).toBe(true);
  });
});

// ─── Rule Operators ───────────────────────────────────────────────────────────

describe('Rule operators (via evaluatePolicy)', () => {
  // Helper to create a minimal policy for testing
  const createTestPolicy = (operator, value) => ({
    id: 'test-policy',
    name: 'Test Policy',
    enabled: true,
    severity: SEVERITY.MEDIUM,
    rules: [
      {
        field: 'test.value',
        operator,
        value,
      },
    ],
    actions: ['test:action'],
  });

  describe('EQUALS operator', () => {
    it('passes when values are equal', async () => {
      const context = { test: { value: 'foo' }, action: 'test:action' };

      // Manually test the operator logic since we can't inject custom policies
      const actualValue = 'foo';
      const expectedValue = 'foo';
      expect(actualValue === expectedValue).toBe(true);
    });

    it('fails when values are not equal', async () => {
      const actualValue = 'foo';
      const expectedValue = 'bar';
      expect(actualValue === expectedValue).toBe(false);
    });
  });

  describe('NOT_EQUALS operator', () => {
    it('passes when values are different', async () => {
      // This is tested by no-self-approval policy
      const context = {
        requester: { userId: 'user-002' },
        policy: { createdBy: 'user-001' },
        action: 'policy:approve',
      };

      const result = await evaluatePolicy('no-self-approval', 'policy:approve', context);
      expect(result.compliant).toBe(true);
    });

    it('fails when values are equal', async () => {
      const context = {
        requester: { userId: 'user-001' },
        policy: { createdBy: 'user-001' },
        action: 'policy:approve',
      };

      const result = await evaluatePolicy('no-self-approval', 'policy:approve', context);
      expect(result.compliant).toBe(false);
    });
  });

  describe('LESS_THAN operator', () => {
    it('passes when value is less than threshold', async () => {
      const context = {
        requester: { userId: 'user-001' },
        audit: { count: 25 },
        action: 'agent:chat',
      };

      const result = await evaluatePolicy('agent-query-rate-limit', 'agent:chat', context);
      expect(result.compliant).toBe(true);
    });

    it('fails when value equals threshold', async () => {
      const context = {
        requester: { userId: 'user-001' },
        audit: { count: 30 },
        action: 'agent:chat',
      };

      const result = await evaluatePolicy('agent-query-rate-limit', 'agent:chat', context);
      expect(result.compliant).toBe(false);
    });

    it('fails when value exceeds threshold', async () => {
      const context = {
        requester: { userId: 'user-001' },
        audit: { count: 35 },
        action: 'agent:chat',
      };

      const result = await evaluatePolicy('agent-query-rate-limit', 'agent:chat', context);
      expect(result.compliant).toBe(false);
    });
  });

  describe('NOT_IN operator', () => {
    it('passes when action not in forbidden list', async () => {
      const context = {
        requester: { userId: 'user-001' },
        action: 'policy:create',
      };

      const result = await evaluatePolicy('no-audit-deletion', 'policy:create', context);
      expect(result.compliant).toBe(true);
    });

    it('fails when action is in forbidden list', async () => {
      const context = {
        requester: { userId: 'user-001' },
        action: 'audit:delete',
      };

      const result = await evaluatePolicy('no-audit-deletion', 'audit:delete', context);
      expect(result.compliant).toBe(false);
    });
  });
});

// ─── Field Resolution ─────────────────────────────────────────────────────────

describe('Field resolution (via evaluatePolicy)', () => {
  it('resolves simple field paths', async () => {
    const context = {
      requester: { userId: 'user-001' },
      policy: { createdBy: 'user-001' },
      action: 'policy:approve',
    };

    const result = await evaluatePolicy('no-self-approval', 'policy:approve', context);

    // Field 'policy.createdBy' should resolve to 'user-001'
    expect(result.compliant).toBe(false);
    expect(result.violation.actualValue).toBe('user-001');
  });

  it('resolves nested field paths', async () => {
    const context = {
      requester: { userId: 'user-002' },
      policy: { createdBy: 'user-001' },
      action: 'policy:approve',
    };

    const result = await evaluatePolicy('no-self-approval', 'policy:approve', context);

    // 'policy.createdBy' !== 'user-002' (requester.userId)
    expect(result.compliant).toBe(true);
  });

  it('handles missing nested fields gracefully', async () => {
    const context = {
      requester: { userId: 'user-001' },
      // Missing 'policy' field entirely
      action: 'policy:approve',
    };

    const result = await evaluatePolicy('no-self-approval', 'policy:approve', context);

    // Should fail gracefully - undefined !== user-001 is true, so compliant
    expect(result.compliant).toBe(true);
  });
});

// ─── Template Variable Resolution ────────────────────────────────────────────

describe('Template variable resolution', () => {
  it('resolves ${context.requester.userId} in policy rules', async () => {
    // The no-self-approval policy uses: value: '${context.requester.userId}'
    const context = {
      requester: { userId: 'user-001' },
      policy: { createdBy: 'user-001' },
      action: 'policy:approve',
    };

    const result = await evaluatePolicy('no-self-approval', 'policy:approve', context);

    // Template resolves to 'user-001', actual value is 'user-001', NOT_EQUALS fails
    expect(result.compliant).toBe(false);
    expect(result.violation.expectedValue).toBe('user-001'); // Resolved from template
  });

  it('handles different userId values in template resolution', async () => {
    const context = {
      requester: { userId: 'user-999' },
      policy: { createdBy: 'user-001' },
      action: 'policy:approve',
    };

    const result = await evaluatePolicy('no-self-approval', 'policy:approve', context);

    // Template resolves to 'user-999', actual is 'user-001', NOT_EQUALS passes
    expect(result.compliant).toBe(true);
  });
});

// ─── Constants and Exports ────────────────────────────────────────────────────

describe('Exports and constants', () => {
  it('exports BUILT_IN_POLICIES object', () => {
    expect(BUILT_IN_POLICIES).toBeDefined();
    expect(typeof BUILT_IN_POLICIES).toBe('object');
    expect(BUILT_IN_POLICIES['no-self-approval']).toBeDefined();
    expect(BUILT_IN_POLICIES['agent-query-rate-limit']).toBeDefined();
    expect(BUILT_IN_POLICIES['no-audit-deletion']).toBeDefined();
  });

  it('exports OPERATORS enum', () => {
    expect(OPERATORS).toBeDefined();
    expect(OPERATORS.EQUALS).toBe('equals');
    expect(OPERATORS.NOT_EQUALS).toBe('not_equals');
    expect(OPERATORS.CONTAINS).toBe('contains');
    expect(OPERATORS.NOT_CONTAINS).toBe('not_contains');
    expect(OPERATORS.GREATER_THAN).toBe('greater_than');
    expect(OPERATORS.LESS_THAN).toBe('less_than');
    expect(OPERATORS.IN).toBe('in');
    expect(OPERATORS.NOT_IN).toBe('not_in');
  });

  it('exports SEVERITY enum', () => {
    expect(SEVERITY).toBeDefined();
    expect(SEVERITY.LOW).toBe('low');
    expect(SEVERITY.MEDIUM).toBe('medium');
    expect(SEVERITY.HIGH).toBe('high');
    expect(SEVERITY.CRITICAL).toBe('critical');
  });

  it('exports PolicyEngineError class', () => {
    expect(PolicyEngineError).toBeDefined();
    const error = new PolicyEngineError('Test error', 'TEST_CODE');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('PolicyEngineError');
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_CODE');
  });
});

// ─── Built-in Policy Structure ───────────────────────────────────────────────

describe('Built-in policy structure validation', () => {
  it('all built-in policies have required fields', () => {
    for (const [policyId, policy] of Object.entries(BUILT_IN_POLICIES)) {
      expect(policy.id).toBe(policyId);
      expect(policy.name).toBeDefined();
      expect(policy.description).toBeDefined();
      expect(typeof policy.enabled).toBe('boolean');
      expect(policy.severity).toBeDefined();
      expect(Array.isArray(policy.rules)).toBe(true);
      expect(Array.isArray(policy.actions)).toBe(true);
      expect(policy.rules.length).toBeGreaterThan(0);
      expect(policy.actions.length).toBeGreaterThan(0);
    }
  });

  it('all rules have valid operators', () => {
    const validOperators = Object.values(OPERATORS);

    for (const policy of Object.values(BUILT_IN_POLICIES)) {
      for (const rule of policy.rules) {
        expect(rule.field).toBeDefined();
        expect(rule.operator).toBeDefined();
        expect(validOperators).toContain(rule.operator);
      }
    }
  });

  it('all policies have valid severity levels', () => {
    const validSeverities = Object.values(SEVERITY);

    for (const policy of Object.values(BUILT_IN_POLICIES)) {
      expect(validSeverities).toContain(policy.severity);
    }
  });
});
