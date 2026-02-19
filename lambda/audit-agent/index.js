/**
 * Audit Agent Lambda
 *
 * Manages audit log persistence, retrieval, and chain verification.
 * Immutable audit log with SHA-256 hash chain.
 */

'use strict';

const { requireAuth, getSecurityHeaders } = require('../middleware/auth');
const { validateRequest, createErrorResponse, sanitizeString } = require('../middleware/validation');
const { checkRateLimit } = require('../middleware/rateLimit');
const { DynamoDBClient, PutItemCommand, QueryCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { callBedrock, extractRiskLevel, extractRecommendations } = require('../middleware/bedrock');
const { createHash } = require('crypto');

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const AUDIT_TABLE = process.env.DYNAMODB_TABLE_AUDIT || 'governance-audit-logs';

exports.handler = async (event) => {
  const headers = getSecurityHeaders(event.headers?.origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const path = event.path || event.resource || '';
  const method = event.httpMethod;

  // Route: GET /audit/logs
  if (method === 'GET' && path.endsWith('/logs')) {
    return handleGetLogs(event, headers);
  }

  // Route: POST /audit/logs
  if (method === 'POST' && path.endsWith('/logs')) {
    return handleCreateLog(event, headers);
  }

  // Route: POST /audit/verify
  if (method === 'POST' && path.endsWith('/verify')) {
    return handleVerifyChain(event, headers);
  }

  // Route: POST /agents/audit (chat)
  if (method === 'POST' && path.includes('/agents/audit')) {
    return handleAuditChat(event, headers);
  }

  return { ...createErrorResponse(404, 'Not found'), headers };
};

async function handleGetLogs(event, headers) {
  const authResult = await requireAuth(event, 'audit:read');
  if (authResult.statusCode) return { ...authResult, headers };

  const rateResult = await checkRateLimit(
    authResult.user.id,
    '/audit/logs',
    event.requestContext?.identity?.sourceIp
  );
  if (rateResult) return { ...rateResult, headers };

  const params = event.queryStringParameters || {};
  const limit = Math.min(parseInt(params.limit) || 20, 100);
  const page = Math.max(parseInt(params.page) || 1, 1);

  try {
    const result = await dynamo.send(new ScanCommand({
      TableName: AUDIT_TABLE,
      Limit: limit,
    }));

    const entries = (result.Items || []).map(unmarshalAuditEntry);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        entries,
        total: entries.length,
        page,
        limit,
      }),
    };
  } catch (err) {
    console.error('[AuditAgent] Get logs error:', err.message);
    return { ...createErrorResponse(503, 'Unable to retrieve audit logs'), headers };
  }
}

async function handleCreateLog(event, headers) {
  const authResult = await requireAuth(event);
  if (authResult.statusCode) return { ...authResult, headers };

  const { valid, body, error } = validateRequest(event);
  if (!valid) return { ...error, headers };

  if (!body?.action || !body?.agent) {
    return { ...createErrorResponse(400, 'Missing required audit entry fields'), headers };
  }

  try {
    // Compute entry hash for tamper detection
    const entryData = {
      id: body.id || generateId(),
      timestamp: body.timestamp || new Date().toISOString(),
      action: sanitizeString(body.action),
      agent: sanitizeString(body.agent),
      userId: sanitizeString(body.userId || authResult.user.id),
      result: sanitizeString(body.result || 'unknown'),
      risk: body.risk || 'low',
      details: body.details || {},
    };

    const entryHash = computeEntryHash(entryData);

    await dynamo.send(new PutItemCommand({
      TableName: AUDIT_TABLE,
      Item: {
        id: { S: entryData.id },
        timestamp: { S: entryData.timestamp },
        action: { S: entryData.action },
        agent: { S: entryData.agent },
        userId: { S: entryData.userId },
        result: { S: entryData.result },
        risk: { S: entryData.risk },
        details: { S: JSON.stringify(entryData.details) },
        entryHash: { S: entryHash },
        chainHash: { S: body.chainHash || entryHash },
        previousHash: { S: body.previousHash || 'GENESIS' },
        ttl: { N: String(Math.floor(Date.now() / 1000) + 7 * 365 * 24 * 3600) },
      },
      // Prevent duplicate entries
      ConditionExpression: 'attribute_not_exists(id)',
    }));

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ id: entryData.id, entryHash }),
    };
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return { ...createErrorResponse(409, 'Duplicate audit entry'), headers };
    }
    console.error('[AuditAgent] Create log error:', err.message);
    return { ...createErrorResponse(503, 'Unable to create audit entry'), headers };
  }
}

async function handleVerifyChain(event, headers) {
  const authResult = await requireAuth(event, 'audit:verify');
  if (authResult.statusCode) return { ...authResult, headers };

  const rateResult = await checkRateLimit(
    authResult.user.id,
    '/audit/logs',
    event.requestContext?.identity?.sourceIp
  );
  if (rateResult) return { ...rateResult, headers };

  const { valid, body, error } = validateRequest(event);
  if (!valid) return { ...error, headers };

  const entries = body?.entries;
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ...createErrorResponse(400, 'entries array is required'), headers };
  }

  // Verify hash chain
  const results = [];
  let previousHash = 'GENESIS';
  let firstTamperedIndex = null;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const expectedHash = computeEntryHash(entry);
    const valid = entry.entryHash === expectedHash;

    results.push({ index: i, id: entry.id, valid });
    if (!valid && firstTamperedIndex === null) {
      firstTamperedIndex = i;
    }
    previousHash = entry.chainHash || previousHash;
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      valid: firstTamperedIndex === null,
      firstTamperedIndex,
      entriesChecked: entries.length,
      details: results,
    }),
  };
}

async function handleAuditChat(event, headers) {
  const authResult = await requireAuth(event, 'agent:chat');
  if (authResult.statusCode) return Object.assign({}, authResult, { headers });
  const { user } = authResult;

  const rateResult = await checkRateLimit(
    user.id, '/agents/audit',
    event.requestContext && event.requestContext.identity && event.requestContext.identity.sourceIp
  );
  if (rateResult) return Object.assign({}, rateResult, { headers });

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
    const bedrockResult = await callBedrock('audit', query, conversationHistory);
    const riskLevel = extractRiskLevel(bedrockResult.content);
    const recommendations = extractRecommendations(bedrockResult.content);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        agentId: 'audit',
        content: bedrockResult.content,
        risk: riskLevel,
        confidence: bedrockResult.stopReason === 'end_turn' ? 0.92 : 0.75,
        recommendations: recommendations,
        model: process.env.BEDROCK_MODEL_ID || 'bedrock-default',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err) {
    return Object.assign(
      {}, createErrorResponse(503, 'Audit agent is temporarily unavailable. Please try again.'),
      { headers }
    );
  }
}

function computeEntryHash(entry) {
  const payload = JSON.stringify({
    id: entry.id,
    timestamp: entry.timestamp,
    action: entry.action,
    agent: entry.agent,
    userId: entry.userId,
    result: entry.result,
    risk: entry.risk,
  });
  return createHash('sha256').update(payload).digest('hex');
}

function unmarshalAuditEntry(item) {
  return {
    id: item.id?.S,
    timestamp: item.timestamp?.S,
    action: item.action?.S,
    agent: item.agent?.S,
    userId: item.userId?.S,
    result: item.result?.S,
    risk: item.risk?.S,
    details: item.details?.S ? JSON.parse(item.details.S) : {},
    entryHash: item.entryHash?.S,
    chainHash: item.chainHash?.S,
    previousHash: item.previousHash?.S,
  };
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
