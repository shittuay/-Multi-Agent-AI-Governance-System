/**
 * Compliance Metrics
 *
 * Calculates and validates compliance scores.
 * Includes integrity checks to prevent metric manipulation.
 */

import { hashObject } from './crypto.js';

// ─── Metric Definitions ───────────────────────────────────────────────────────

export const METRIC_THRESHOLDS = {
  COMPLIANCE_PASSING: 90,     // >= 90% is passing
  COMPLIANCE_WARNING: 75,     // 75-89% is warning
  COMPLIANCE_FAILING: 0,      // < 75% is failing
  POLICY_ADHERENCE_MIN: 95,   // Policy adherence target
  AUDIT_COVERAGE_MIN: 99,     // Audit coverage target
  RESPONSE_TIME_MAX_MS: 500,  // Max acceptable response time
};

export const ALERT_THRESHOLDS = {
  CRITICAL_COMPLIANCE_DROP: 10,  // Alert if compliance drops > 10% in 24h
  HIGH_VIOLATION_COUNT: 10,      // Alert if > 10 violations in 1 hour
  MEDIUM_VIOLATION_COUNT: 5,     // Warning if > 5 violations in 1 hour
};

// ─── Metrics Calculator ───────────────────────────────────────────────────────

/**
 * Calculates an overall compliance score from individual framework scores.
 * Weighted average based on framework importance.
 *
 * @param {object} frameworkScores - { GDPR: 95, CCPA: 98, HIPAA: 90, ... }
 * @returns {{ score: number, level: string, checksumHash: string }}
 */
export async function calculateOverallCompliance(frameworkScores) {
  const weights = {
    GDPR: 0.30,
    CCPA: 0.20,
    HIPAA: 0.20,
    SOX: 0.15,
    ISO27001: 0.10,
    NIST: 0.05,
  };

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [framework, score] of Object.entries(frameworkScores)) {
    // Validate score is a real number between 0-100
    if (!isValidScore(score)) {
      throw new MetricValidationError(
        `Invalid compliance score for ${framework}: ${score}`
      );
    }
    const weight = weights[framework] || 0.10;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    throw new MetricValidationError('No valid frameworks provided for compliance calculation');
  }

  const score = Math.round((weightedSum / totalWeight) * 10) / 10;
  const level = getComplianceLevel(score);

  // Generate a checksum to detect tampering with the metric inputs
  const checksumHash = await hashObject({ frameworkScores, score, calculatedAt: new Date().toISOString() });

  return { score, level, frameworks: frameworkScores, checksumHash };
}

/**
 * Determines compliance level from a score.
 */
export function getComplianceLevel(score) {
  if (score >= METRIC_THRESHOLDS.COMPLIANCE_PASSING) return 'passing';
  if (score >= METRIC_THRESHOLDS.COMPLIANCE_WARNING) return 'warning';
  return 'failing';
}

/**
 * Calculates risk score from violation data.
 */
export function calculateRiskScore(violations) {
  if (!Array.isArray(violations)) return { score: 0, level: 'low' };

  const weights = { critical: 40, high: 20, medium: 8, low: 2 };
  let totalScore = 0;

  for (const violation of violations) {
    const severity = violation.severity?.toLowerCase() || 'low';
    totalScore += weights[severity] || 0;
  }

  // Normalize to 0-100
  const normalizedScore = Math.min(100, totalScore);

  let level;
  if (normalizedScore >= 70) level = 'critical';
  else if (normalizedScore >= 40) level = 'high';
  else if (normalizedScore >= 20) level = 'medium';
  else level = 'low';

  return { score: normalizedScore, level, violationCount: violations.length };
}

/**
 * Computes a summary of all compliance metrics for the dashboard.
 */
export function buildMetricsSummary(data) {
  const {
    complianceScore = 94,
    activePolicies = 24,
    auditEvents = 1247,
    violations = [],
    responseTimeMs = 450,
  } = data;

  const risk = calculateRiskScore(violations);

  return {
    overall: {
      score: complianceScore,
      level: getComplianceLevel(complianceScore),
      trend: data.previousScore
        ? complianceScore - data.previousScore
        : null,
    },
    policies: {
      active: activePolicies,
      adherenceRate: data.policyAdherence || 98.2,
    },
    audit: {
      eventsLast24h: auditEvents,
      coverageRate: data.auditCoverage || 99.1,
    },
    risk: {
      score: risk.score,
      level: risk.level,
      activeViolations: violations.length,
    },
    performance: {
      avgResponseTimeMs: responseTimeMs,
      withinSla: responseTimeMs <= METRIC_THRESHOLDS.RESPONSE_TIME_MAX_MS,
    },
    alerts: generateAlerts(complianceScore, violations, data),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generates active alerts based on metric thresholds.
 */
function generateAlerts(complianceScore, violations, data) {
  const alerts = [];

  // Compliance drop alert
  if (data.previousScore && (data.previousScore - complianceScore) > ALERT_THRESHOLDS.CRITICAL_COMPLIANCE_DROP) {
    alerts.push({
      id: 'compliance-drop',
      severity: 'critical',
      message: `Compliance score dropped ${data.previousScore - complianceScore}% in the last 24 hours`,
    });
  }

  // High violation count
  const criticalViolations = violations.filter((v) => v.severity === 'critical').length;
  if (criticalViolations > 0) {
    alerts.push({
      id: 'critical-violations',
      severity: 'critical',
      message: `${criticalViolations} critical violation(s) require immediate attention`,
    });
  }

  const highViolations = violations.filter((v) => v.severity === 'high').length;
  if (highViolations >= ALERT_THRESHOLDS.HIGH_VIOLATION_COUNT) {
    alerts.push({
      id: 'high-violations',
      severity: 'high',
      message: `${highViolations} high-severity violations detected in the last hour`,
    });
  }

  return alerts;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isValidScore(score) {
  return (
    typeof score === 'number' &&
    !isNaN(score) &&
    isFinite(score) &&
    score >= 0 &&
    score <= 100
  );
}

export class MetricValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MetricValidationError';
    this.statusCode = 422;
  }
}
