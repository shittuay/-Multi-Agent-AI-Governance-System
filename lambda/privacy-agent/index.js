/**
 * Privacy Agent Lambda - Bedrock-powered
 *
 * Uses AWS Bedrock to provide intelligent privacy governance analysis.
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

  const authResult = await requireAuth(event, 'agent:chat');
  if (authResult.statusCode) return Object.assign({}, authResult, { headers });
  const { user } = authResult;

  const rateLimitResult = await checkRateLimit(
    user.id, '/agents/privacy',
    event.requestContext && event.requestContext.identity && event.requestContext.identity.sourceIp
  );
  if (rateLimitResult) return Object.assign({}, rateLimitResult, { headers });

  const { valid, body, error } = validateRequest(event);
  if (!valid) return Object.assign({}, error, { headers });

  if (!body || !body.content || typeof body.content !== 'string') {
    return Object.assign({}, createErrorResponse(400, 'Missing or invalid message content'), { headers });
  }

  const query = sanitizeString(body.content).slice(0, 2000);
  if (!query) {
    return Object.assign({}, createErrorResponse(400, 'Message content cannot be empty'), { headers });
  }

  const conversationHistory = Array.isArray(body.history) ? body.history.slice(-6) : [];

  try {
    const bedrockResult = await callBedrock('privacy', query, conversationHistory);
    const riskLevel = extractRiskLevel(bedrockResult.content);
    const recommendations = extractRecommendations(bedrockResult.content);

    await logAuditEvent(user.id, 'agent.query', 'success', 'Privacy Agent query processed via Bedrock');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        agentId: 'privacy',
        content: bedrockResult.content,
        risk: riskLevel,
        confidence: bedrockResult.stopReason === 'end_turn' ? 0.90 : 0.75,
        recommendations: recommendations,
        model: process.env.BEDROCK_MODEL_ID || 'bedrock-default',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err) {
    await logAuditEvent(user.id, 'agent.query', 'failure', 'Privacy Agent Bedrock error');
    return Object.assign(
      {}, createErrorResponse(503, 'Privacy Agent is temporarily unavailable. Please try again.'),
      { headers }
    );
  }
};

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
        agent: { S: 'Privacy Agent' },
        userId: { S: sanitizeString(userId) },
        result: { S: sanitizeString(result) },
        risk: { S: 'low' },
        details: { S: sanitizeString(details) },
        ttl: { N: ttl },
      },
    }));
  } catch (err) {
    console.error('[AuditLog] Failed to write privacy audit entry:', err.message);
  }
}
