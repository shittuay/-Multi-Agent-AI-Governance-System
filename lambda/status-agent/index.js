/**
 * Agent Status Lambda
 *
 * Returns real-time health and status of all 5 governance agents.
 * Polled by the frontend useAgentStatus hook.
 */

'use strict';

const { requireAuth, getSecurityHeaders } = require('../middleware/auth');
const { createErrorResponse } = require('../middleware/validation');
const { checkRateLimit } = require('../middleware/rateLimit');
const { DynamoDBClient, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const lambda = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });

const AGENT_FUNCTION_NAMES = {
  compliance: process.env.COMPLIANCE_FUNCTION_NAME || 'governance-compliance-agent-dev',
  policy: process.env.POLICY_FUNCTION_NAME || 'governance-policy-agent-dev',
  audit: process.env.AUDIT_FUNCTION_NAME || 'governance-audit-agent-dev',
  ethics: process.env.ETHICS_FUNCTION_NAME || 'governance-ethics-agent-dev',
  privacy: process.env.PRIVACY_FUNCTION_NAME || 'governance-privacy-agent-dev',
};

exports.handler = async (event) => {
  const headers = getSecurityHeaders(event.headers?.origin);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Auth required (viewer and above)
  const authResult = await requireAuth(event, 'agent:status');
  if (authResult.statusCode) return { ...authResult, headers };
  const { user } = authResult;

  // Rate limit - status polls can be frequent but throttle hard abusers
  const rateResult = await checkRateLimit(
    user.id,
    '/agents/status',
    event.requestContext?.identity?.sourceIp
  );
  if (rateResult) return { ...rateResult, headers };

  try {
    // Check each agent concurrently using Lambda ping (DryRun)
    const statusChecks = await Promise.allSettled(
      Object.entries(AGENT_FUNCTION_NAMES).map(async ([agentId, functionName]) => {
        const status = await checkAgentHealth(functionName);
        return [agentId, status];
      })
    );

    const agents = {};
    for (const result of statusChecks) {
      if (result.status === 'fulfilled') {
        const [agentId, status] = result.value;
        agents[agentId] = status;
      }
    }

    // Fill in defaults for any that failed
    const agentIds = Object.keys(AGENT_FUNCTION_NAMES);
    for (const agentId of agentIds) {
      if (!agents[agentId]) {
        agents[agentId] = {
          status: 'error',
          riskLevel: 'high',
          alerts: 1,
          lastAction: 'Health check failed',
          lastChecked: new Date().toISOString(),
        };
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        agents,
        systemStatus: computeSystemStatus(agents),
        checkedAt: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error('[StatusAgent] Error:', err.message);
    return { ...createErrorResponse(503, 'Unable to retrieve agent status'), headers };
  }
};

/**
 * Pings a Lambda function to check if it's healthy.
 * Uses DryRun invocation (no actual execution, just connectivity check).
 */
async function checkAgentHealth(functionName) {
  try {
    // Use a lightweight GET-style ping payload
    await lambda.send(new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'DryRun', // No execution, just validates permissions/config
    }));

    return {
      status: 'active',
      riskLevel: 'low',
      alerts: 0,
      lastAction: 'Health check passed',
      lastChecked: new Date().toISOString(),
    };
  } catch (err) {
    // DryRun throws "DryRunOperation" on success - that's expected
    if (err.name === 'DryRunOperation' || err.message?.includes('DryRun')) {
      return {
        status: 'active',
        riskLevel: 'low',
        alerts: 0,
        lastAction: 'Health check passed',
        lastChecked: new Date().toISOString(),
      };
    }

    // Real error
    return {
      status: 'error',
      riskLevel: 'high',
      alerts: 1,
      lastAction: `Health check failed: ${err.name}`,
      lastChecked: new Date().toISOString(),
    };
  }
}

/**
 * Computes overall system status from individual agent statuses.
 */
function computeSystemStatus(agents) {
  const statuses = Object.values(agents).map((a) => a.status);
  const totalAlerts = Object.values(agents).reduce((sum, a) => sum + (a.alerts || 0), 0);

  if (statuses.includes('error')) return { level: 'degraded', alerts: totalAlerts };
  if (statuses.includes('warning')) return { level: 'warning', alerts: totalAlerts };
  return { level: 'operational', alerts: totalAlerts };
}
