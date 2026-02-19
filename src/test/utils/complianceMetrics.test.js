/**
 * Tests: Compliance Metrics Utilities
 *
 * Verifies score calculations, risk assessment, and metric summary generation.
 * NOTE: calculateOverallCompliance is async (generates a checksum hash).
 * NOTE: generateAlerts is an internal function - tested via buildMetricsSummary.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateOverallCompliance,
  getComplianceLevel,
  calculateRiskScore,
  buildMetricsSummary,
  METRIC_THRESHOLDS,
} from '../../utils/complianceMetrics.js';

// ─── calculateOverallCompliance ───────────────────────────────────────────────
// Accepts { FRAMEWORK_NAME: numericScore } - uppercase keys, plain numbers

describe('calculateOverallCompliance', () => {
  it('returns an object with score, level, and checksumHash', async () => {
    const result = await calculateOverallCompliance({ GDPR: 92, CCPA: 88 });
    expect(typeof result.score).toBe('number');
    expect(typeof result.level).toBe('string');
    expect(typeof result.checksumHash).toBe('string');
  });

  it('score is between 0 and 100', async () => {
    const result = await calculateOverallCompliance({ GDPR: 85, CCPA: 90, HIPAA: 78 });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('returns level=passing for perfect scores (100)', async () => {
    const result = await calculateOverallCompliance({ GDPR: 100, CCPA: 100 });
    expect(result.level).toBe('passing');
    expect(result.score).toBe(100);
  });

  it('returns level=passing for scores >= 90', async () => {
    const result = await calculateOverallCompliance({ GDPR: 95, CCPA: 92 });
    expect(result.level).toBe('passing');
  });

  it('returns level=warning for scores in 75-89 range', async () => {
    const result = await calculateOverallCompliance({ GDPR: 80, CCPA: 78 });
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.score).toBeLessThan(90);
    expect(result.level).toBe('warning');
  });

  it('returns level=failing for scores below 75', async () => {
    const result = await calculateOverallCompliance({ GDPR: 50, CCPA: 60 });
    expect(result.level).toBe('failing');
  });

  it('includes the input frameworks in the result', async () => {
    const frameworks = { GDPR: 90, HIPAA: 85 };
    const result = await calculateOverallCompliance(frameworks);
    expect(result.frameworks).toEqual(frameworks);
  });

  it('throws MetricValidationError for empty object', async () => {
    await expect(calculateOverallCompliance({})).rejects.toThrow('No valid frameworks provided');
  });

  it('throws MetricValidationError for score over 100', async () => {
    await expect(
      calculateOverallCompliance({ GDPR: 150 })
    ).rejects.toThrow('Invalid compliance score');
  });

  it('throws MetricValidationError for NaN score', async () => {
    await expect(
      calculateOverallCompliance({ GDPR: NaN })
    ).rejects.toThrow('Invalid compliance score');
  });

  it('throws MetricValidationError for object value instead of number', async () => {
    await expect(
      calculateOverallCompliance({ GDPR: { score: 90 } })
    ).rejects.toThrow('Invalid compliance score');
  });

  it('lower input scores produce lower overall score', async () => {
    const highResult = await calculateOverallCompliance({ GDPR: 95, CCPA: 95 });
    const lowResult = await calculateOverallCompliance({ GDPR: 50, CCPA: 50 });
    expect(lowResult.score).toBeLessThan(highResult.score);
  });

  it('checksumHash is a 64-char hex string (SHA-256 mocked)', async () => {
    const result = await calculateOverallCompliance({ GDPR: 88 });
    expect(result.checksumHash).toMatch(/^[0-9a-f]{64}$/i);
  });
});

// ─── getComplianceLevel ───────────────────────────────────────────────────────

describe('getComplianceLevel', () => {
  it('returns "passing" for scores >= 90', () => {
    expect(getComplianceLevel(90)).toBe('passing');
    expect(getComplianceLevel(100)).toBe('passing');
    expect(getComplianceLevel(95)).toBe('passing');
  });

  it('returns "warning" for scores 75-89', () => {
    expect(getComplianceLevel(75)).toBe('warning');
    expect(getComplianceLevel(89)).toBe('warning');
    expect(getComplianceLevel(80)).toBe('warning');
  });

  it('returns "failing" for scores below 75', () => {
    expect(getComplianceLevel(74)).toBe('failing');
    expect(getComplianceLevel(0)).toBe('failing');
    expect(getComplianceLevel(50)).toBe('failing');
  });

  it('handles boundary values at COMPLIANCE_PASSING threshold', () => {
    expect(getComplianceLevel(METRIC_THRESHOLDS.COMPLIANCE_PASSING)).toBe('passing');
    expect(getComplianceLevel(METRIC_THRESHOLDS.COMPLIANCE_PASSING - 1)).toBe('warning');
  });

  it('handles boundary values at COMPLIANCE_WARNING threshold', () => {
    expect(getComplianceLevel(METRIC_THRESHOLDS.COMPLIANCE_WARNING)).toBe('warning');
    expect(getComplianceLevel(METRIC_THRESHOLDS.COMPLIANCE_WARNING - 1)).toBe('failing');
  });
});

// ─── calculateRiskScore ───────────────────────────────────────────────────────
// Accepts an ARRAY of violations: [{ severity: 'critical'|'high'|'medium'|'low' }]

describe('calculateRiskScore', () => {
  it('returns { score, level, violationCount } shape', () => {
    const result = calculateRiskScore([]);
    expect(typeof result.score).toBe('number');
    expect(typeof result.level).toBe('string');
    expect(typeof result.violationCount).toBe('number');
  });

  it('returns score=0, level=low for empty violations array', () => {
    const result = calculateRiskScore([]);
    expect(result.score).toBe(0);
    expect(result.level).toBe('low');
    expect(result.violationCount).toBe(0);
  });

  it('returns { score: 0, level: "low" } for non-array (null)', () => {
    const result = calculateRiskScore(null);
    expect(result.score).toBe(0);
    expect(result.level).toBe('low');
  });

  it('critical violations have higher weight than low violations', () => {
    const criticalResult = calculateRiskScore([{ severity: 'critical' }]);
    const lowResult = calculateRiskScore([{ severity: 'low' }]);
    expect(criticalResult.score).toBeGreaterThan(lowResult.score);
  });

  it('returns level=critical for score >= 70 (2 critical violations = 80)', () => {
    const violations = [{ severity: 'critical' }, { severity: 'critical' }]; // 80 pts
    const result = calculateRiskScore(violations);
    expect(result.level).toBe('critical');
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it('returns level=high for score 40-69', () => {
    const violations = [{ severity: 'critical' }, { severity: 'medium' }]; // 40+8=48
    const result = calculateRiskScore(violations);
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(70);
    expect(result.level).toBe('high');
  });

  it('returns level=medium for score 20-39 (1 high = 20)', () => {
    const result = calculateRiskScore([{ severity: 'high' }]);
    expect(result.score).toBeGreaterThanOrEqual(20);
    expect(result.score).toBeLessThan(40);
    expect(result.level).toBe('medium');
  });

  it('returns level=low for score < 20 (2 low = 4)', () => {
    const result = calculateRiskScore([{ severity: 'low' }, { severity: 'low' }]);
    expect(result.score).toBeLessThan(20);
    expect(result.level).toBe('low');
  });

  it('caps score at 100 regardless of violation count', () => {
    const manyViolations = Array(10).fill({ severity: 'critical' }); // Would be 400
    const result = calculateRiskScore(manyViolations);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('counts violations correctly', () => {
    const violations = [
      { severity: 'critical' },
      { severity: 'high' },
      { severity: 'low' },
    ];
    const result = calculateRiskScore(violations);
    expect(result.violationCount).toBe(3);
  });

  it('defaults missing severity to low (2 pts)', () => {
    const result = calculateRiskScore([{ id: 'v1' }]); // No severity
    expect(result.score).toBe(2); // low weight = 2
  });
});

// ─── buildMetricsSummary ──────────────────────────────────────────────────────

describe('buildMetricsSummary', () => {
  const validData = {
    complianceScore: 94,
    activePolicies: 24,
    auditEvents: 1247,
    violations: [],
    responseTimeMs: 450,
  };

  it('returns object with all expected top-level keys', () => {
    const summary = buildMetricsSummary(validData);
    expect(summary.overall).toBeDefined();
    expect(summary.policies).toBeDefined();
    expect(summary.audit).toBeDefined();
    expect(summary.risk).toBeDefined();
    expect(summary.performance).toBeDefined();
    expect(summary.alerts).toBeDefined();
    expect(typeof summary.generatedAt).toBe('string');
  });

  it('overall.score reflects complianceScore input', () => {
    const summary = buildMetricsSummary({ ...validData, complianceScore: 85 });
    expect(summary.overall.score).toBe(85);
  });

  it('overall.level is "passing" for score >= 90', () => {
    const summary = buildMetricsSummary({ ...validData, complianceScore: 94 });
    expect(summary.overall.level).toBe('passing');
  });

  it('overall.level is "warning" for score 75-89', () => {
    const summary = buildMetricsSummary({ ...validData, complianceScore: 80 });
    expect(summary.overall.level).toBe('warning');
  });

  it('overall.level is "failing" for score < 75', () => {
    const summary = buildMetricsSummary({ ...validData, complianceScore: 60 });
    expect(summary.overall.level).toBe('failing');
  });

  it('overall.trend is the score difference when previousScore provided', () => {
    const summary = buildMetricsSummary({ ...validData, complianceScore: 94, previousScore: 90 });
    expect(summary.overall.trend).toBe(4);
  });

  it('overall.trend is null when no previousScore', () => {
    const summary = buildMetricsSummary(validData);
    expect(summary.overall.trend).toBeNull();
  });

  it('performance.withinSla is true when responseTimeMs <= 500', () => {
    const summary = buildMetricsSummary({ ...validData, responseTimeMs: 450 });
    expect(summary.performance.withinSla).toBe(true);
  });

  it('performance.withinSla is false when responseTimeMs > 500', () => {
    const summary = buildMetricsSummary({ ...validData, responseTimeMs: 600 });
    expect(summary.performance.withinSla).toBe(false);
  });

  it('alerts is an array', () => {
    const summary = buildMetricsSummary(validData);
    expect(Array.isArray(summary.alerts)).toBe(true);
  });

  it('generates compliance-drop alert when score drops > 10%', () => {
    const summary = buildMetricsSummary({
      ...validData,
      complianceScore: 75,
      previousScore: 90, // Drop of 15 > 10
    });
    expect(summary.alerts.some((a) => a.id === 'compliance-drop')).toBe(true);
  });

  it('no compliance-drop alert when drop <= 10%', () => {
    const summary = buildMetricsSummary({
      ...validData,
      complianceScore: 85,
      previousScore: 90, // Drop of 5
    });
    expect(summary.alerts.some((a) => a.id === 'compliance-drop')).toBe(false);
  });

  it('generates critical-violations alert when critical violations exist', () => {
    const summary = buildMetricsSummary({
      ...validData,
      violations: [{ severity: 'critical' }, { severity: 'critical' }],
    });
    expect(summary.alerts.some((a) => a.id === 'critical-violations')).toBe(true);
  });

  it('no alerts for perfect data with no violations', () => {
    const summary = buildMetricsSummary({
      ...validData,
      complianceScore: 100,
      violations: [],
    });
    expect(summary.alerts).toHaveLength(0);
  });

  it('uses default values when empty object is passed', () => {
    const summary = buildMetricsSummary({});
    expect(summary.overall.score).toBe(94); // Default
    expect(summary.policies.active).toBe(24); // Default
  });
});
