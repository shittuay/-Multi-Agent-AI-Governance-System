/**
 * Alert System - Policy Violation Notifications
 *
 * Sends alerts when governance policies are violated.
 * Uses SNS for email/SMS/webhook delivery.
 */

'use strict';

const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const sns = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });

// Helper to get topic ARN (allows for testing by reading env at call time)
function getAlertTopicArn() {
  return process.env.SNS_ALERT_TOPIC_ARN;
}

// ─── Alert Sending ────────────────────────────────────────────────────────────

/**
 * Sends a policy violation alert via SNS.
 *
 * @param {object} violation - The policy violation details
 * @param {object} context - Additional context (requester, action, etc.)
 * @returns {Promise<void>}
 */
async function sendViolationAlert(violation, context) {
  const topicArn = getAlertTopicArn();
  if (!topicArn) {
    console.warn('[Alerts] SNS_ALERT_TOPIC_ARN not configured. Skipping alert.');
    return;
  }

  try {
    const message = buildAlertMessage(violation, context);
    const subject = buildAlertSubject(violation);

    await sns.send(new PublishCommand({
      TopicArn: topicArn,
      Subject: subject,
      Message: message,
      MessageAttributes: {
        severity: {
          DataType: 'String',
          StringValue: violation.severity || 'medium',
        },
        policyId: {
          DataType: 'String',
          StringValue: violation.policyId || 'unknown',
        },
        userId: {
          DataType: 'String',
          StringValue: context.requester?.userId || 'unknown',
        },
      },
    }));

    console.log(`[Alerts] Sent ${violation.severity} alert for policy ${violation.policyId}`);
  } catch (err) {
    // Alert failures should not break the main flow
    console.error('[Alerts] Failed to send SNS alert:', err.message);
  }
}

/**
 * Builds the alert message body
 */
function buildAlertMessage(violation, context) {
  const timestamp = new Date().toISOString();
  const requester = context.requester || {};

  return `
┌─────────────────────────────────────────────────────────────
│ 🚨 GOVERNANCE POLICY VIOLATION
└─────────────────────────────────────────────────────────────

Policy:     ${violation.policyName} (${violation.policyId})
Severity:   ${violation.severity.toUpperCase()}
Timestamp:  ${timestamp}

Violation:
  ${violation.message}

Requester:
  User ID:  ${requester.userId || 'unknown'}
  Role:     ${requester.role || 'unknown'}
  Email:    ${requester.email || 'unknown'}

Context:
  Action:   ${context.action || 'unknown'}
  ${context.policy ? `Policy:   ${context.policy.name} (${context.policy.id})` : ''}
  ${context.resourceId ? `Resource: ${context.resourceId}` : ''}

Recommended Actions:
  1. Review the audit logs for additional context
  2. Verify this was not a legitimate action
  3. Contact the user if suspicious behavior is detected
  4. Update policies if this rule is too restrictive

View audit logs: ${process.env.FRONTEND_URL || 'https://governance.example.com'}/audit

────────────────────────────────────────────────────────────────
This is an automated alert from the Multi-Agent AI Governance System.
`;
}

/**
 * Builds the alert subject line
 */
function buildAlertSubject(violation) {
  const emoji = getSeverityEmoji(violation.severity);
  return `${emoji} [${violation.severity.toUpperCase()}] Policy Violation: ${violation.policyName}`;
}

/**
 * Maps severity to emoji for better visibility
 */
function getSeverityEmoji(severity) {
  switch (severity) {
    case 'critical': return '🔴';
    case 'high': return '🟠';
    case 'medium': return '🟡';
    case 'low': return '🟢';
    default: return '⚠️';
  }
}

// ─── Generic Alert Function ──────────────────────────────────────────────────

/**
 * Sends a generic alert (not tied to policy violations)
 *
 * @param {string} severity - low|medium|high|critical
 * @param {string} subject - Alert subject
 * @param {string} message - Alert message body
 * @returns {Promise<void>}
 */
async function sendAlert(severity, subject, message) {
  const topicArn = getAlertTopicArn();
  if (!topicArn) {
    console.warn('[Alerts] SNS_ALERT_TOPIC_ARN not configured. Skipping alert.');
    return;
  }

  try {
    const emoji = getSeverityEmoji(severity);
    const fullSubject = `${emoji} [${severity.toUpperCase()}] ${subject}`;

    await sns.send(new PublishCommand({
      TopicArn: topicArn,
      Subject: fullSubject,
      Message: message,
      MessageAttributes: {
        severity: {
          DataType: 'String',
          StringValue: severity,
        },
      },
    }));

    console.log(`[Alerts] Sent ${severity} alert: ${subject}`);
  } catch (err) {
    console.error('[Alerts] Failed to send SNS alert:', err.message);
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  sendViolationAlert,
  sendAlert,
};
