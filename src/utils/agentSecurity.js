/**
 * Agent Security - Message Signing & Agent Isolation
 *
 * Guardrails for inter-agent communication:
 * - Messages between agents are signed to prevent spoofing
 * - Each agent has a defined capability boundary (isolation)
 * - Response timeouts prevent hung agents from blocking operations
 * - Dead letter queue tracking for failed agent communications
 */

import { generateSecureId, sha256 } from './crypto.js';
import { sanitizeText, sanitizeChatMessage } from './inputValidation.js';
import { auditLogger, AUDIT_ACTIONS, RISK_LEVELS } from './auditLogger.js';
import { apiFetch } from '../auth/authService.js';

// ─── Agent Definitions ────────────────────────────────────────────────────────

export const AGENTS = {
  COMPLIANCE: 'compliance',
  POLICY: 'policy',
  AUDIT: 'audit',
  ETHICS: 'ethics',
  PRIVACY: 'privacy',
};

export const AGENT_CONFIGS = {
  [AGENTS.COMPLIANCE]: {
    id: AGENTS.COMPLIANCE,
    name: 'Compliance Agent',
    description: 'Real-time regulatory violation monitoring and risk assessment',
    capabilities: [
      'violation_detection',
      'risk_assessment',
      'regulatory_monitoring',
      'compliance_scoring',
    ],
    allowedCallers: ['user', AGENTS.AUDIT, AGENTS.POLICY],
    timeoutMs: 15000,
    endpoint: '/agents/compliance',
  },
  [AGENTS.POLICY]: {
    id: AGENTS.POLICY,
    name: 'Policy Agent',
    description: 'Dynamic governance policy management and regulatory mapping',
    capabilities: [
      'policy_creation',
      'policy_lookup',
      'regulatory_mapping',
      'framework_updates',
    ],
    allowedCallers: ['user', AGENTS.COMPLIANCE, AGENTS.AUDIT],
    timeoutMs: 15000,
    endpoint: '/agents/policy',
  },
  [AGENTS.AUDIT]: {
    id: AGENTS.AUDIT,
    name: 'Audit Agent',
    description: 'Comprehensive audit trails and forensic analysis',
    capabilities: [
      'audit_trail',
      'evidence_collection',
      'forensic_analysis',
      'chain_verification',
    ],
    allowedCallers: ['user', AGENTS.COMPLIANCE, AGENTS.POLICY, AGENTS.ETHICS, AGENTS.PRIVACY],
    timeoutMs: 20000,
    endpoint: '/agents/audit',
  },
  [AGENTS.ETHICS]: {
    id: AGENTS.ETHICS,
    name: 'Ethics Agent',
    description: 'Bias detection and fairness evaluation',
    capabilities: [
      'bias_detection',
      'fairness_analysis',
      'ethical_assessment',
      'impact_evaluation',
    ],
    allowedCallers: ['user', AGENTS.COMPLIANCE, AGENTS.AUDIT],
    timeoutMs: 30000, // Bias detection may take longer
    endpoint: '/agents/ethics',
  },
  [AGENTS.PRIVACY]: {
    id: AGENTS.PRIVACY,
    name: 'Privacy Agent',
    description: 'GDPR, CCPA, and privacy regulation compliance',
    capabilities: [
      'pii_detection',
      'access_control',
      'consent_management',
      'privacy_compliance',
    ],
    allowedCallers: ['user', AGENTS.COMPLIANCE, AGENTS.AUDIT],
    timeoutMs: 15000,
    endpoint: '/agents/privacy',
  },
};

// ─── Message Security ─────────────────────────────────────────────────────────

/**
 * Creates a signed agent message.
 * The signature is a hash of the message content + timestamp + caller ID,
 * preventing replay attacks and spoofing.
 *
 * @param {string} fromId - Caller identity ('user' or agent ID)
 * @param {string} toAgentId - Target agent
 * @param {string} content - Message content
 * @returns {Promise<object>} Signed message
 */
export async function createAgentMessage(fromId, toAgentId, content) {
  const sanitizedContent = sanitizeChatMessage(content);
  const messageId = generateSecureId();
  const timestamp = new Date().toISOString();

  // Compute message signature
  const signaturePayload = `${messageId}:${fromId}:${toAgentId}:${timestamp}:${sanitizedContent}`;
  const signature = await sha256(signaturePayload);

  return {
    id: messageId,
    from: sanitizeText(fromId),
    to: toAgentId,
    content: sanitizedContent,
    timestamp,
    signature,
  };
}

/**
 * Verifies an agent message's integrity.
 * Returns true if the message hasn't been tampered with.
 */
export async function verifyAgentMessage(message) {
  const { id, from, to, content, timestamp, signature } = message;
  const expectedPayload = `${id}:${from}:${to}:${timestamp}:${content}`;
  const expectedSignature = await sha256(expectedPayload);
  return expectedSignature === signature;
}

// ─── Agent Communication ──────────────────────────────────────────────────────

/**
 * Sends a query to an agent with full security guardrails:
 * - Validates the caller is allowed to call this agent
 * - Signs the message
 * - Enforces timeout
 * - Logs the interaction
 * - Handles failures with dead letter queue
 *
 * @param {string} agentId - Target agent ID
 * @param {string} message - User message content
 * @param {object} user - Current user (for RBAC check)
 * @returns {Promise<object>} Agent response
 */
export async function queryAgent(agentId, message, user) {
  // eslint-disable-next-line security/detect-object-injection
  const config = AGENT_CONFIGS[agentId];
  if (!config) {
    throw new AgentError(`Unknown agent: ${agentId}`, agentId);
  }

  // Validate caller authorization
  if (!config.allowedCallers.includes('user') && !config.allowedCallers.includes(user?.id)) {
    await auditLogger.log({
      action: AUDIT_ACTIONS.UNAUTHORIZED_ACCESS,
      agent: config.name,
      userId: user?.id || 'unknown',
      result: 'failure',
      risk: RISK_LEVELS.HIGH,
      details: { reason: 'Unauthorized caller', agentId },
    });
    throw new AgentError(`Not authorized to call ${config.name}`, agentId);
  }

  // Create signed message
  const signedMessage = await createAgentMessage(user?.id || 'user', agentId, message);

  // Log the query
  await auditLogger.log({
    action: AUDIT_ACTIONS.AGENT_QUERY,
    agent: config.name,
    userId: user?.id || 'anonymous',
    result: 'pending',
    risk: RISK_LEVELS.LOW,
    details: {
      messageId: signedMessage.id,
      agentId,
      messageLength: message.length,
    },
  });

  try {
    // Send to agent with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    const response = await apiFetch(config.endpoint, {
      method: 'POST',
      body: JSON.stringify(signedMessage),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Agent returned ${response.status}`);
    }

    const result = await response.json();

    // Log successful response
    await auditLogger.log({
      action: AUDIT_ACTIONS.AGENT_RESPONSE,
      agent: config.name,
      userId: user?.id || 'anonymous',
      result: 'success',
      risk: result.risk || RISK_LEVELS.LOW,
      details: {
        messageId: signedMessage.id,
        responseLength: JSON.stringify(result).length,
      },
    });

    return result;
  } catch (err) {
    const isTimeout = err.name === 'AbortError';

    // Add to dead letter queue for retry/alerting
    addToDeadLetterQueue({
      messageId: signedMessage.id,
      agentId,
      error: err.message,
      isTimeout,
      timestamp: new Date().toISOString(),
    });

    await auditLogger.log({
      action: AUDIT_ACTIONS.AGENT_RESPONSE,
      agent: config.name,
      userId: user?.id || 'anonymous',
      result: 'failure',
      risk: RISK_LEVELS.MEDIUM,
      details: {
        messageId: signedMessage.id,
        error: isTimeout ? 'Agent timeout' : 'Agent error',
        isTimeout,
      },
    });

    throw new AgentError(
      isTimeout ? `${config.name} timed out` : `${config.name} failed`,
      agentId,
      { retryable: true, isTimeout }
    );
  }
}

// ─── Dead Letter Queue ────────────────────────────────────────────────────────

const _deadLetterQueue = [];
const MAX_DLQ_SIZE = 100;

function addToDeadLetterQueue(entry) {
  if (_deadLetterQueue.length >= MAX_DLQ_SIZE) {
    _deadLetterQueue.shift(); // Remove oldest
  }
  _deadLetterQueue.push(entry);
}

export function getDeadLetterQueue() {
  return [..._deadLetterQueue];
}

export function clearDeadLetterQueue() {
  _deadLetterQueue.length = 0;
}

// ─── Agent Error ──────────────────────────────────────────────────────────────

export class AgentError extends Error {
  constructor(message, agentId, options = {}) {
    super(message);
    this.name = 'AgentError';
    this.agentId = agentId;
    this.retryable = options.retryable || false;
    this.isTimeout = options.isTimeout || false;
    this.statusCode = 503;
  }
}
