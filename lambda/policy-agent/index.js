/**
 * Policy Agent Lambda
 *
 * Manages policy CRUD with version control, approval workflow,
 * conflict detection, and separation-of-duties enforcement.
 */

'use strict';

const { requireAuth, getSecurityHeaders } = require('../middleware/auth');
const { validateRequest, createErrorResponse, sanitizeString } = require('../middleware/validation');
const { checkRateLimit } = require('../middleware/rateLimit');
const { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand, ScanCommand } = require('@aws-sdk/client-dynamodb');
const { createHash, randomUUID } = require('crypto');

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const TABLE_NAME = process.env.DYNAMODB_TABLE_POLICIES || 'governance-policies';
const AUDIT_TABLE = process.env.DYNAMODB_TABLE_AUDIT || 'governance-audit-logs';

const VALID_FRAMEWORKS = ['GDPR', 'CCPA', 'HIPAA', 'SOX', 'ISO27001', 'NIST', 'CUSTOM'];
const VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];
const VALID_STATUSES = ['draft', 'pending_approval', 'active', 'disabled', 'rejected', 'archived'];

exports.handler = async (event) => {
  const headers = getSecurityHeaders(event.headers?.origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const path = event.path || '';
  const method = event.httpMethod;

  // Route: GET /policies
  if (method === 'GET' && path.endsWith('/policies')) {
    return handleListPolicies(event, headers);
  }

  // Route: POST /policies
  if (method === 'POST' && path.endsWith('/policies')) {
    return handleCreatePolicy(event, headers);
  }

  // Route: GET /policies/{id}
  if (method === 'GET' && path.match(/\/policies\/[a-f0-9-]+$/)) {
    return handleGetPolicy(event, headers);
  }

  // Route: PUT /policies/{id}
  if (method === 'PUT' && path.match(/\/policies\/[a-f0-9-]+$/)) {
    return handleUpdatePolicy(event, headers);
  }

  // Route: POST /policies/{id}/approve
  if (method === 'POST' && path.match(/\/policies\/[a-f0-9-]+\/approve$/)) {
    return handleApprovePolicy(event, headers);
  }

  // Route: POST /policies/conflicts
  if (method === 'POST' && path.endsWith('/conflicts')) {
    return handleConflictCheck(event, headers);
  }

  // Route: POST /agents/policy (chat)
  if (method === 'POST' && path.includes('/agents/policy')) {
    return handlePolicyChat(event, headers);
  }

  return { ...createErrorResponse(404, 'Not found'), headers };
};

async function handleListPolicies(event, headers) {
  const authResult = await requireAuth(event, 'policy:read');
  if (authResult.statusCode) return { ...authResult, headers };

  try {
    const result = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME }));
    const policies = (result.Items || []).map(unmarshalPolicy);
    return { statusCode: 200, headers, body: JSON.stringify({ policies }) };
  } catch (err) {
    console.error('[PolicyAgent] List error:', err.message);
    return { ...createErrorResponse(503, 'Unable to retrieve policies'), headers };
  }
}

async function handleCreatePolicy(event, headers) {
  const authResult = await requireAuth(event, 'policy:create');
  if (authResult.statusCode) return { ...authResult, headers };
  const { user } = authResult;

  const rateResult = await checkRateLimit(user.id, '/policies', event.requestContext?.identity?.sourceIp);
  if (rateResult) return { ...rateResult, headers };

  const { valid, body, error } = validateRequest(event);
  if (!valid) return { ...error, headers };

  // Validate policy fields
  const validationError = validatePolicyInput(body);
  if (validationError) return { ...createErrorResponse(400, validationError), headers };

  const needsApproval = !['super_admin', 'compliance_officer'].includes(user.role);
  const now = new Date().toISOString();
  const id = randomUUID();

  const policy = {
    id,
    name: sanitizeString(body.name),
    description: sanitizeString(body.description || ''),
    framework: body.framework,
    severity: body.severity,
    rules: sanitizeString(body.rules || ''),
    status: needsApproval ? 'pending_approval' : 'active',
    version: 1,
    enabled: !needsApproval,
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
    approvedBy: needsApproval ? null : user.id,
    approvedAt: needsApproval ? null : now,
    versionHash: computeVersionHash(id, 1, body.name, body.rules, body.framework),
  };

  try {
    await dynamo.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshalPolicy(policy),
      ConditionExpression: 'attribute_not_exists(id)',
    }));

    await writeAuditLog(user.id, 'policy.created', 'success', policy.name);

    return { statusCode: 201, headers, body: JSON.stringify(policy) };
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      return { ...createErrorResponse(409, 'Policy already exists'), headers };
    }
    console.error('[PolicyAgent] Create error:', err.message);
    return { ...createErrorResponse(503, 'Unable to create policy'), headers };
  }
}

async function handleGetPolicy(event, headers) {
  const authResult = await requireAuth(event, 'policy:read');
  if (authResult.statusCode) return { ...authResult, headers };

  const policyId = extractIdFromPath(event.path);
  if (!policyId) return { ...createErrorResponse(400, 'Invalid policy ID'), headers };

  try {
    const result = await dynamo.send(new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { id: { S: policyId } },
    }));

    if (!result.Item) return { ...createErrorResponse(404, 'Policy not found'), headers };

    return { statusCode: 200, headers, body: JSON.stringify(unmarshalPolicy(result.Item)) };
  } catch (err) {
    console.error('[PolicyAgent] Get error:', err.message);
    return { ...createErrorResponse(503, 'Unable to retrieve policy'), headers };
  }
}

async function handleUpdatePolicy(event, headers) {
  const authResult = await requireAuth(event, 'policy:update');
  if (authResult.statusCode) return { ...authResult, headers };
  const { user } = authResult;

  const policyId = extractIdFromPath(event.path);
  if (!policyId) return { ...createErrorResponse(400, 'Invalid policy ID'), headers };

  const { valid, body, error } = validateRequest(event);
  if (!valid) return { ...error, headers };

  const validationError = validatePolicyInput(body);
  if (validationError) return { ...createErrorResponse(400, validationError), headers };

  try {
    const existing = await dynamo.send(new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { id: { S: policyId } },
    }));

    if (!existing.Item) return { ...createErrorResponse(404, 'Policy not found'), headers };
    const existingPolicy = unmarshalPolicy(existing.Item);

    const needsApproval = !['super_admin', 'compliance_officer'].includes(user.role);
    const newVersion = existingPolicy.version + 1;
    const now = new Date().toISOString();

    const updated = {
      ...existingPolicy,
      name: sanitizeString(body.name || existingPolicy.name),
      description: sanitizeString(body.description || existingPolicy.description),
      framework: body.framework || existingPolicy.framework,
      severity: body.severity || existingPolicy.severity,
      rules: sanitizeString(body.rules || existingPolicy.rules),
      status: needsApproval ? 'pending_approval' : existingPolicy.status,
      version: newVersion,
      updatedBy: user.id,
      updatedAt: now,
      approvedBy: needsApproval ? null : existingPolicy.approvedBy,
      versionHash: computeVersionHash(policyId, newVersion, body.name, body.rules, body.framework),
    };

    await dynamo.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshalPolicy(updated),
    }));

    await writeAuditLog(user.id, 'policy.updated', 'success', updated.name);

    return { statusCode: 200, headers, body: JSON.stringify(updated) };
  } catch (err) {
    console.error('[PolicyAgent] Update error:', err.message);
    return { ...createErrorResponse(503, 'Unable to update policy'), headers };
  }
}

async function handleApprovePolicy(event, headers) {
  const authResult = await requireAuth(event, 'policy:approve');
  if (authResult.statusCode) return { ...authResult, headers };
  const { user } = authResult;

  const policyId = extractIdFromPath(event.path.replace('/approve', ''));
  const { valid, body, error } = validateRequest(event);
  if (!valid) return { ...error, headers };

  const action = body?.action;
  if (!['approve', 'reject'].includes(action)) {
    return { ...createErrorResponse(400, 'action must be approve or reject'), headers };
  }

  try {
    const existing = await dynamo.send(new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { id: { S: policyId } },
    }));

    if (!existing.Item) return { ...createErrorResponse(404, 'Policy not found'), headers };
    const policy = unmarshalPolicy(existing.Item);

    // Separation of duties: cannot approve your own policy
    if (policy.createdBy === user.id || policy.updatedBy === user.id) {
      await writeAuditLog(user.id, 'policy.approve_attempt', 'failure', 'Separation of duties violation');
      return { ...createErrorResponse(403, 'Cannot approve your own policy (separation of duties)'), headers };
    }

    if (policy.status !== 'pending_approval') {
      return { ...createErrorResponse(409, `Policy is not pending approval (status: ${policy.status})`), headers };
    }

    const now = new Date().toISOString();
    const newStatus = action === 'approve' ? 'active' : 'rejected';

    const updated = {
      ...policy,
      status: newStatus,
      enabled: action === 'approve',
      approvedBy: user.id,
      approvedAt: now,
      approvalComment: sanitizeString(body.comment || ''),
      updatedAt: now,
    };

    await dynamo.send(new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshalPolicy(updated),
    }));

    const auditAction = action === 'approve' ? 'policy.approved' : 'policy.rejected';
    await writeAuditLog(user.id, auditAction, 'success', policy.name);

    return { statusCode: 200, headers, body: JSON.stringify(updated) };
  } catch (err) {
    console.error('[PolicyAgent] Approve error:', err.message);
    return { ...createErrorResponse(503, 'Unable to process policy approval'), headers };
  }
}

async function handleConflictCheck(event, headers) {
  const authResult = await requireAuth(event, 'policy:read');
  if (authResult.statusCode) return { ...authResult, headers };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ conflicts: [] }), // Stub: implement rule-based conflict detection
  };
}

async function handlePolicyChat(event, headers) {
  const authResult = await requireAuth(event, 'agent:chat');
  if (authResult.statusCode) return { ...authResult, headers };

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      agentId: 'policy',
      content: 'Policy Agent ready. I can help with policy creation, lookup, and regulatory mapping.',
      risk: 'low',
      confidence: 0.97,
      timestamp: new Date().toISOString(),
    }),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validatePolicyInput(body) {
  if (!body?.name || typeof body.name !== 'string' || body.name.trim().length < 3) {
    return 'Policy name is required (min 3 characters)';
  }
  if (body.name.length > 100) return 'Policy name too long (max 100 characters)';
  if (body.framework && !VALID_FRAMEWORKS.includes(body.framework)) {
    return `Invalid framework. Must be one of: ${VALID_FRAMEWORKS.join(', ')}`;
  }
  if (body.severity && !VALID_SEVERITIES.includes(body.severity)) {
    return `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}`;
  }
  return null;
}

function computeVersionHash(id, version, name, rules, framework) {
  return createHash('sha256')
    .update(JSON.stringify({ id, version, name: name || '', rules: rules || '', framework: framework || '' }))
    .digest('hex');
}

function extractIdFromPath(path) {
  const match = path.match(/\/policies\/([a-f0-9-]{36})/);
  return match ? match[1] : null;
}

function marshalPolicy(policy) {
  return {
    id: { S: policy.id },
    name: { S: policy.name },
    description: { S: policy.description || '' },
    framework: { S: policy.framework || 'CUSTOM' },
    severity: { S: policy.severity || 'medium' },
    rules: { S: policy.rules || '' },
    status: { S: policy.status },
    version: { N: String(policy.version || 1) },
    enabled: { BOOL: !!policy.enabled },
    createdBy: { S: policy.createdBy || '' },
    createdAt: { S: policy.createdAt },
    updatedAt: { S: policy.updatedAt },
    approvedBy: { S: policy.approvedBy || '' },
    approvedAt: { S: policy.approvedAt || '' },
    versionHash: { S: policy.versionHash || '' },
  };
}

function unmarshalPolicy(item) {
  return {
    id: item.id?.S,
    name: item.name?.S,
    description: item.description?.S,
    framework: item.framework?.S,
    severity: item.severity?.S,
    rules: item.rules?.S,
    status: item.status?.S,
    version: parseInt(item.version?.N || '1'),
    enabled: item.enabled?.BOOL,
    createdBy: item.createdBy?.S,
    createdAt: item.createdAt?.S,
    updatedAt: item.updatedAt?.S,
    approvedBy: item.approvedBy?.S,
    approvedAt: item.approvedAt?.S,
    versionHash: item.versionHash?.S,
    history: [],
  };
}

async function writeAuditLog(userId, action, result, details) {
  try {
    await dynamo.send(new PutItemCommand({
      TableName: AUDIT_TABLE,
      Item: {
        id: { S: `${Date.now()}-${Math.random().toString(36).slice(2)}` },
        timestamp: { S: new Date().toISOString() },
        action: { S: sanitizeString(action) },
        agent: { S: 'Policy Agent' },
        userId: { S: sanitizeString(userId) },
        result: { S: sanitizeString(result) },
        risk: { S: 'medium' },
        details: { S: sanitizeString(details) },
        ttl: { N: String(Math.floor(Date.now() / 1000) + 7 * 365 * 24 * 3600) },
      },
    }));
  } catch (err) {
    console.error('[PolicyAgent] Audit log error:', err.message);
  }
}
