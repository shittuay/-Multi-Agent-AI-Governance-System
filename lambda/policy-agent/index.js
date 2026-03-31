/**
 * Policy Agent Lambda
 *
 * Full CRUD for governance policies + approval workflow + Bedrock chat.
 * Enforces "no-self-approval" policy using the policy engine.
 */

'use strict';

const { requireAuth, getSecurityHeaders } = require('../middleware/auth');
const { validateRequest, createErrorResponse, sanitizeString } = require('../middleware/validation');
const { checkRateLimit } = require('../middleware/rateLimit');
const { callBedrock } = require('../middleware/bedrock');
const { evaluatePolicy } = require('../middleware/policyEngine');
const { sendViolationAlert } = require('../middleware/alerts');
const { DynamoDBClient, PutItemCommand, GetItemCommand, ScanCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const POLICY_TABLE = process.env.DYNAMODB_TABLE_POLICIES || 'governance-policies';
const AUDIT_TABLE = process.env.DYNAMODB_TABLE_AUDIT || 'governance-audit-logs';

exports.handler = async (event) => {
  const headers = getSecurityHeaders(event.headers && event.headers.origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const path = event.path || event.resource || '';
  const method = event.httpMethod;

  // Route: GET /policies
  if (method === 'GET' && path === '/policies') {
    return handleListPolicies(event, headers);
  }

  // Route: POST /policies
  if (method === 'POST' && path === '/policies') {
    return handleCreatePolicy(event, headers);
  }

  // Route: GET /policies/{id}
  if (method === 'GET' && path.match(/^\/policies\/[^/]+$/)) {
    return handleGetPolicy(event, headers);
  }

  // Route: PUT /policies/{id}
  if (method === 'PUT' && path.match(/^\/policies\/[^/]+$/)) {
    return handleUpdatePolicy(event, headers);
  }

  // Route: POST /policies/{id}/approve
  if (method === 'POST' && path.match(/^\/policies\/[^/]+\/approve$/)) {
    return handleApprovePolicy(event, headers);
  }

  // Route: POST /agents/policy (chat)
  if (method === 'POST' && path.includes('/agents/policy')) {
    return handlePolicyChat(event, headers);
  }

  return Object.assign({}, createErrorResponse(404, 'Not found'), { headers });
};

// ─── List Policies ────────────────────────────────────────────────────────────

async function handleListPolicies(event, headers) {
  const authResult = await requireAuth(event, 'policy:read');
  if (authResult.statusCode) return Object.assign({}, authResult, { headers });

  try {
    const result = await dynamo.send(new ScanCommand({
      TableName: POLICY_TABLE,
      Limit: 100,
    }));

    const policies = (result.Items || []).map(unmarshalPolicy);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ policies, total: policies.length }),
    };
  } catch (err) {
    return Object.assign({}, createErrorResponse(500, 'Failed to list policies'), { headers });
  }
}

// ─── Create Policy ────────────────────────────────────────────────────────────

async function handleCreatePolicy(event, headers) {
  const authResult = await requireAuth(event, 'policy:create');
  if (authResult.statusCode) return Object.assign({}, authResult, { headers });
  const { user } = authResult;

  const { valid, body, error } = validateRequest(event);
  if (!valid) return Object.assign({}, error, { headers });

  if (!body.name || !body.framework || !body.rules) {
    return Object.assign({}, createErrorResponse(400, 'Missing required fields: name, framework, rules'), { headers });
  }

  const policy = {
    id: generateId(),
    name: sanitizeString(body.name),
    description: sanitizeString(body.description || ''),
    framework: body.framework,
    severity: body.severity || 'medium',
    rules: sanitizeString(body.rules),
    enabled: false,
    status: 'pending_approval',
    createdBy: user.id,
    createdAt: new Date().toISOString(),
    version: 1,
  };

  try {
    await dynamo.send(new PutItemCommand({
      TableName: POLICY_TABLE,
      Item: marshalPolicy(policy),
    }));

    await logAudit(user.id, 'policy.create', 'success', 'Policy created (pending approval)', policy.id);

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ policy }),
    };
  } catch (err) {
    return Object.assign({}, createErrorResponse(500, 'Failed to create policy'), { headers });
  }
}

// ─── Get Policy ───────────────────────────────────────────────────────────────

async function handleGetPolicy(event, headers) {
  const authResult = await requireAuth(event, 'policy:read');
  if (authResult.statusCode) return Object.assign({}, authResult, { headers });

  const policyId = event.pathParameters && event.pathParameters.id;
  if (!policyId) {
    return Object.assign({}, createErrorResponse(400, 'Missing policy ID'), { headers });
  }

  try {
    const result = await dynamo.send(new GetItemCommand({
      TableName: POLICY_TABLE,
      Key: { id: { S: policyId } },
    }));

    if (!result.Item) {
      return Object.assign({}, createErrorResponse(404, 'Policy not found'), { headers });
    }

    const policy = unmarshalPolicy(result.Item);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ policy }),
    };
  } catch (err) {
    return Object.assign({}, createErrorResponse(500, 'Failed to get policy'), { headers });
  }
}

// ─── Update Policy ────────────────────────────────────────────────────────────

async function handleUpdatePolicy(event, headers) {
  const authResult = await requireAuth(event, 'policy:update');
  if (authResult.statusCode) return Object.assign({}, authResult, { headers });
  const { user } = authResult;

  const policyId = event.pathParameters && event.pathParameters.id;
  if (!policyId) {
    return Object.assign({}, createErrorResponse(400, 'Missing policy ID'), { headers });
  }

  const { valid, body, error } = validateRequest(event);
  if (!valid) return Object.assign({}, error, { headers });

  try {
    await dynamo.send(new UpdateItemCommand({
      TableName: POLICY_TABLE,
      Key: { id: { S: policyId } },
      UpdateExpression: 'SET #name = :name, description = :desc, rules = :rules, updatedBy = :updatedBy, updatedAt = :updatedAt, version = version + :inc',
      ExpressionAttributeNames: { '#name': 'name' },
      ExpressionAttributeValues: {
        ':name': { S: sanitizeString(body.name || '') },
        ':desc': { S: sanitizeString(body.description || '') },
        ':rules': { S: sanitizeString(body.rules || '') },
        ':updatedBy': { S: user.id },
        ':updatedAt': { S: new Date().toISOString() },
        ':inc': { N: '1' },
      },
    }));

    await logAudit(user.id, 'policy.update', 'success', 'Policy updated', policyId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Policy updated successfully' }),
    };
  } catch (err) {
    return Object.assign({}, createErrorResponse(500, 'Failed to update policy'), { headers });
  }
}

// ─── Approve Policy (WITH POLICY ENGINE ENFORCEMENT) ──────────────────────────

async function handleApprovePolicy(event, headers) {
  const authResult = await requireAuth(event, 'policy:approve');
  if (authResult.statusCode) return Object.assign({}, authResult, { headers });
  const { user } = authResult;

  const policyId = event.pathParameters && event.pathParameters.id;
  if (!policyId) {
    return Object.assign({}, createErrorResponse(400, 'Missing policy ID'), { headers });
  }

  // 1. Fetch the policy from DynamoDB
  let policy;
  try {
    const result = await dynamo.send(new GetItemCommand({
      TableName: POLICY_TABLE,
      Key: { id: { S: policyId } },
    }));

    if (!result.Item) {
      return Object.assign({}, createErrorResponse(404, 'Policy not found'), { headers });
    }

    policy = unmarshalPolicy(result.Item);
  } catch (err) {
    return Object.assign({}, createErrorResponse(500, 'Failed to fetch policy'), { headers });
  }

  // 2. POLICY ENGINE: Evaluate "no-self-approval" policy
  const context = {
    requester: { userId: user.id, role: user.role, email: user.email },
    policy: { id: policy.id, createdBy: policy.createdBy, name: policy.name },
    action: 'policy:approve',
  };

  let evaluationResult;
  try {
    evaluationResult = await evaluatePolicy('no-self-approval', 'policy:approve', context);
  } catch (err) {
    return Object.assign({}, createErrorResponse(500, 'Policy engine error'), { headers });
  }

  // 3. If violation: BLOCK, log, alert
  if (!evaluationResult.compliant) {
    const violation = evaluationResult.violation;

    // Log violation to audit table
    await logAudit(user.id, 'policy.approve', 'violation', violation.message, policyId);

    // Send alert
    await sendViolationAlert(violation, context);

    // Return 403 Forbidden
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({
        error: 'Policy Violation',
        message: violation.message,
        policyId: violation.policyId,
        severity: violation.severity,
      }),
    };
  }

  // 4. Compliant: proceed with approval
  try {
    await dynamo.send(new UpdateItemCommand({
      TableName: POLICY_TABLE,
      Key: { id: { S: policyId } },
      UpdateExpression: 'SET #status = :status, enabled = :enabled, approvedBy = :approvedBy, approvedAt = :approvedAt',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': { S: 'approved' },
        ':enabled': { BOOL: true },
        ':approvedBy': { S: user.id },
        ':approvedAt': { S: new Date().toISOString() },
      },
    }));

    await logAudit(user.id, 'policy.approve', 'success', 'Policy approved successfully', policyId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Policy approved successfully', policyId }),
    };
  } catch (err) {
    return Object.assign({}, createErrorResponse(500, 'Failed to approve policy'), { headers });
  }
}

// ─── Policy Chat (Bedrock) ────────────────────────────────────────────────────

async function handlePolicyChat(event, headers) {
  const authResult = await requireAuth(event, 'agent:chat');
  if (authResult.statusCode) return Object.assign({}, authResult, { headers });
  const { user } = authResult;

  const { valid, body, error } = validateRequest(event);
  if (!valid) return Object.assign({}, error, { headers });

  if (!body || !body.content) {
    return Object.assign({}, createErrorResponse(400, 'Missing message content'), { headers });
  }

  const query = sanitizeString(body.content).slice(0, 2000);
  const conversationHistory = Array.isArray(body.history) ? body.history.slice(-6) : [];

  try {
    const bedrockResult = await callBedrock('policy', query, conversationHistory);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        agentId: 'policy',
        content: bedrockResult.content,
        risk: 'low',
        confidence: bedrockResult.stopReason === 'end_turn' ? 0.90 : 0.75,
        model: process.env.BEDROCK_MODEL_ID || 'bedrock-default',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err) {
    return Object.assign({}, createErrorResponse(503, 'Policy agent is temporarily unavailable'), { headers });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId() {
  return String(Date.now()) + '-' + Math.random().toString(36).slice(2, 9);
}

async function logAudit(userId, action, result, details, resourceId) {
  try {
    const id = generateId();
    const ttl = String(Math.floor(Date.now() / 1000) + 7 * 365 * 24 * 3600);
    await dynamo.send(new PutItemCommand({
      TableName: AUDIT_TABLE,
      Item: {
        id: { S: id },
        timestamp: { S: new Date().toISOString() },
        action: { S: sanitizeString(action) },
        agent: { S: 'Policy Agent' },
        userId: { S: sanitizeString(userId) },
        result: { S: sanitizeString(result) },
        risk: { S: result === 'violation' ? 'high' : 'low' },
        details: { S: sanitizeString(details) },
        resourceId: { S: resourceId || '' },
        ttl: { N: ttl },
      },
    }));
  } catch (err) {
    console.error('[AuditLog] Failed to write policy audit entry:', err.message);
  }
}

function marshalPolicy(policy) {
  return {
    id: { S: policy.id },
    name: { S: policy.name },
    description: { S: policy.description || '' },
    framework: { S: policy.framework },
    severity: { S: policy.severity },
    rules: { S: policy.rules },
    enabled: { BOOL: policy.enabled },
    status: { S: policy.status },
    createdBy: { S: policy.createdBy },
    createdAt: { S: policy.createdAt },
    version: { N: String(policy.version) },
    approvedBy: policy.approvedBy ? { S: policy.approvedBy } : { NULL: true },
    approvedAt: policy.approvedAt ? { S: policy.approvedAt } : { NULL: true },
    updatedBy: policy.updatedBy ? { S: policy.updatedBy } : { NULL: true },
    updatedAt: policy.updatedAt ? { S: policy.updatedAt } : { NULL: true },
  };
}

function unmarshalPolicy(item) {
  return {
    id: item.id && item.id.S,
    name: item.name && item.name.S,
    description: item.description && item.description.S,
    framework: item.framework && item.framework.S,
    severity: item.severity && item.severity.S,
    rules: item.rules && item.rules.S,
    enabled: item.enabled && item.enabled.BOOL,
    status: item.status && item.status.S,
    createdBy: item.createdBy && item.createdBy.S,
    createdAt: item.createdAt && item.createdAt.S,
    version: item.version && item.version.N ? parseInt(item.version.N) : 1,
    approvedBy: item.approvedBy && item.approvedBy.S,
    approvedAt: item.approvedAt && item.approvedAt.S,
    updatedBy: item.updatedBy && item.updatedBy.S,
    updatedAt: item.updatedAt && item.updatedAt.S,
  };
}
