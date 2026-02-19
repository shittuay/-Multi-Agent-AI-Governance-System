/**
 * Agent Response Patterns
 *
 * Defines structured response formats and simulated responses for development/demo.
 * In production these come from Lambda agents. In development they are mocked here.
 */

import { RISK_LEVELS } from './auditLogger.js';

// ─── Response Builder ─────────────────────────────────────────────────────────

export function buildAgentResponse(agentId, content, options = {}) {
  return {
    agentId,
    content,
    timestamp: new Date().toISOString(),
    risk: options.risk || RISK_LEVELS.LOW,
    confidence: options.confidence || 0.95,
    references: options.references || [],
    recommendations: options.recommendations || [],
    metadata: options.metadata || {},
  };
}

// ─── Response Keyword Patterns ────────────────────────────────────────────────

const COMPLIANCE_PATTERNS = [
  { keywords: ['gdpr', 'data protection', 'eu regulation'], framework: 'GDPR' },
  { keywords: ['ccpa', 'california', 'consumer privacy'], framework: 'CCPA' },
  { keywords: ['hipaa', 'health', 'medical', 'phi'], framework: 'HIPAA' },
  { keywords: ['sox', 'sarbanes', 'financial reporting'], framework: 'SOX' },
];

/**
 * Determines the most relevant compliance framework from a query.
 */
export function detectFramework(query) {
  const lower = query.toLowerCase();
  for (const { keywords, framework } of COMPLIANCE_PATTERNS) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return framework;
    }
  }
  return 'General';
}

// ─── Mock Responses (Development/Demo only) ───────────────────────────────────

export const MOCK_RESPONSES = {
  compliance: (query) => {
    const framework = detectFramework(query);
    return buildAgentResponse('compliance', [
      `Compliance analysis complete for your query regarding ${framework}.`,
      '',
      `**Current Status**: 94% compliance rate across monitored systems.`,
      `**Active Violations**: 2 medium-severity violations detected.`,
      `**Risk Assessment**: Medium risk level. Immediate review recommended for data retention policies.`,
      '',
      `**Recommendations**:`,
      `1. Review data processing agreements with third-party vendors`,
      `2. Update consent management records for EU users`,
      `3. Schedule quarterly compliance audit for ${framework} requirements`,
    ].join('\n'), {
      risk: RISK_LEVELS.MEDIUM,
      confidence: 0.94,
      references: [`${framework} Article 5`, `${framework} Article 25`],
      recommendations: [
        'Update data processing agreements',
        'Review consent records',
        'Schedule compliance audit',
      ],
    });
  },

  policy: (_query) => {
    return buildAgentResponse('policy', [
      `Policy analysis for your query:`,
      '',
      `**Active Policies**: 24 policies currently enforced.`,
      `**Policy Adherence**: 98.2% across all systems.`,
      `**Recent Changes**: 3 policies updated in the last 7 days.`,
      '',
      `**Relevant Policies**:`,
      `- Data Retention Policy (v2.3) - Currently active`,
      `- Access Control Policy (v1.8) - Currently active`,
      `- Incident Response Policy (v3.1) - Under review`,
    ].join('\n'), {
      risk: RISK_LEVELS.LOW,
      confidence: 0.97,
      references: ['Policy Registry v2.3'],
    });
  },

  audit: (_query) => {
    return buildAgentResponse('audit', [
      `Audit trail analysis complete:`,
      '',
      `**Events in Last 24h**: 1,247 events logged.`,
      `**Chain Integrity**: Verified - No tampering detected.`,
      `**High-Priority Events**: 3 events flagged for review.`,
      '',
      `**Summary**:`,
      `- 1,201 routine operations`,
      `- 43 policy enforcement events`,
      `- 3 security alerts`,
      `- 0 integrity violations`,
    ].join('\n'), {
      risk: RISK_LEVELS.LOW,
      confidence: 0.99,
      metadata: { eventsAnalyzed: 1247, chainValid: true },
    });
  },

  ethics: (_query) => {
    return buildAgentResponse('ethics', [
      `Ethics and bias analysis complete:`,
      '',
      `**Bias Detection Score**: 0.12 (low bias detected)`,
      `**Fairness Metrics**: Demographic parity at 96.3%`,
      `**Ethical Risk Level**: Low`,
      '',
      `**Findings**:`,
      `- Minor gender representation imbalance in training data (2.3% deviation)`,
      `- Geographic diversity within acceptable parameters`,
      `- No protected class disparate impact detected`,
      '',
      `**Recommendations**:`,
      `1. Increase diversity in training datasets`,
      `2. Quarterly fairness audits recommended`,
    ].join('\n'), {
      risk: RISK_LEVELS.LOW,
      confidence: 0.91,
      recommendations: [
        'Increase training data diversity',
        'Schedule fairness audit',
      ],
    });
  },

  privacy: (_query) => {
    return buildAgentResponse('privacy', [
      `Privacy compliance analysis:`,
      '',
      `**GDPR Compliance**: 96% (Target: >95%)`,
      `**CCPA Compliance**: 98% (Target: >95%)`,
      `**PII Exposure Risk**: Low`,
      '',
      `**Active Data Subjects**: 14,382 (with active consent)`,
      `**Consent Rate**: 89.3%`,
      `**Pending Deletion Requests**: 7`,
      '',
      `**Action Required**:`,
      `- 7 deletion requests pending (SLA: 30 days, 12 days remaining)`,
      `- 2 data sharing agreements expiring in 14 days`,
    ].join('\n'), {
      risk: RISK_LEVELS.MEDIUM,
      confidence: 0.96,
      recommendations: [
        'Process pending deletion requests',
        'Renew data sharing agreements',
      ],
    });
  },
};

/**
 * Gets a mock response for an agent (for development/demo).
 * In production, responses come from Lambda endpoints.
 */
export function getMockResponse(agentId, query) {
  // eslint-disable-next-line security/detect-object-injection
  const handler = MOCK_RESPONSES[agentId];
  if (!handler) {
    return buildAgentResponse(agentId, `Agent ${agentId} is not available.`, {
      risk: RISK_LEVELS.LOW,
    });
  }
  return handler(query);
}
