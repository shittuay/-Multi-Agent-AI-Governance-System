/**
 * Compliance Agent Lambda - Bedrock-powered
 *
 * Handles compliance monitoring, violation detection, and risk assessment
 * using AWS Bedrock foundation models for intelligent analysis.
 */

'use strict';

const { requireAuth, getSecurityHeaders } = require('../middleware/auth');
const { validateRequest, createErrorResponse, sanitizeString } = require('../middleware/validation');
const { checkRateLimit } = require('../middleware/rateLimit');
const { callBedrock, extractRiskLevel, extractRecommendations } = require('../middleware/bedrock');
const { DynamoDBClient, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const AUDIT_TABLE = process.env.DYNAMODB_TABLE_AUDIT || 'governance-audit-logs';

exports.handler = async (event) => {
  const headers = getSecurityHeaders(event.headers && event.headers.origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // 1. Auth
  const authResult = await requireAuth(event, 'agent:chat');
  if (authResult.statusCode) return Object.assign({}, authResult, { headers });
  const { user } = authResult;

  // 2. Rate limiting
  const rateLimitResult = await checkRateLimit(
    user.id, '/agents/compliance',
    event.requestContext && event.requestContext.identity && event.requestContext.identity.sourceIp
  );
  if (rateLimitResult) return Object.assign({}, rateLimitResult, { headers });

  // 3. Validation
  const { valid, body, error } = validateRequest(event);
  if (!valid) return Object.assign({}, error, { headers });

  if (!body || !body.content || typeof body.content !== 'string') {
    return Object.assign({}, createErrorResponse(400, 'Missing or invalid message content'), { headers });
  }

  const query = sanitizeString(body.content).slice(0, 2000);
  if (!query) {
    return Object.assign({}, createErrorResponse(400, 'Message content cannot be empty'), { headers });
  }

  // 4. Verify message signature
  if (body.signature && body.id) {
    const isValid = await verifyMessageSignature(body);
    if (!isValid) {
      await logAuditEvent(user.id, 'compliance.query', 'failure', 'Message signature invalid');
      return Object.assign({}, createErrorResponse(400, 'Message integrity check failed'), { headers });
    }
  }

  const conversationHistory = Array.isArray(body.history) ? body.history.slice(-6) : [];

  try {
    // 5. Call Bedrock
    const bedrockResult = await callBedrock('compliance', query, conversationHistory);
    const riskLevel = extractRiskLevel(bedrockResult.content);
    const recommendations = extractRecommendations(bedrockResult.content);

    await logAuditEvent(user.id, 'agent.query', 'success', 'Compliance query processed via Bedrock');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        agentId: 'compliance',
        content: bedrockResult.content,
        risk: riskLevel,
        confidence: computeConfidence(bedrockResult),
        recommendations: recommendations,
        model: process.env.BEDROCK_MODEL_ID || 'bedrock-default',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err) {
    const isTimeout = err.code === 'TIMEOUT';
    await logAuditEvent(user.id, 'agent.query', 'failure', isTimeout ? 'Bedrock timeout' : 'Bedrock error');
    return Object.assign(
      {}, createErrorResponse(503, 'Compliance agent is temporarily unavailable. Please try again.'),
      { headers }
    );
  }
};

function computeConfidence(bedrockResult) {
  if (bedrockResult.stopReason === 'end_turn' && bedrockResult.outputTokens > 100) return 0.92;
  if (bedrockResult.stopReason === 'max_tokens') return 0.75;
  return 0.85;
}

async function verifyMessageSignature(message) {
  const crypto = require('crypto');
  const payload = message.id + ':' + message.from + ':' + message.to + ':' + message.timestamp + ':' + message.content;
  const expected = crypto.createHash('sha256').update(payload).digest('hex');
  return expected === message.signature;
}

async function logAuditEvent(userId, action, result, details) {
  try {
    const now = new Date().toISOString();
    const id = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    const ttl = String(Math.floor(Date.now() / 1000) + 7 * 365 * 24 * 3600);
    await dynamo.send(new PutItemCommand({
      TableName: AUDIT_TABLE,
      Item: {
        id: { S: id },
        timestamp: { S: now },
        action: { S: sanitizeString(action) },
        agent: { S: 'Compliance Agent' },
        userId: { S: sanitizeString(userId) },
        result: { S: sanitizeString(result) },
        risk: { S: 'low' },
        details: { S: sanitizeString(details) },
        ttl: { N: ttl },
      },
    }));
  } catch (err) {
    console.error('[AuditLog] Failed to write compliance audit entry:', err.message);
  }
}
