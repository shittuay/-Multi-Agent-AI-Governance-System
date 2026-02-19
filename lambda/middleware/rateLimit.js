/**
 * Server-Side Rate Limiting Middleware (DynamoDB Token Bucket)
 *
 * Implements server-side rate limiting using DynamoDB as the store.
 * This is the primary rate limiting layer (client-side is secondary).
 *
 * Uses token bucket algorithm with configurable limits per endpoint.
 */

'use strict';

const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { getSecurityHeaders } = require('./auth');

const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const TABLE_NAME = process.env.DYNAMODB_TABLE_SESSIONS || 'governance-rate-limits';

const RATE_LIMITS = {
  '/agents/compliance': { requests: 30, windowSeconds: 60 },
  '/agents/policy': { requests: 30, windowSeconds: 60 },
  '/agents/audit': { requests: 20, windowSeconds: 60 },
  '/agents/ethics': { requests: 15, windowSeconds: 60 },
  '/agents/privacy': { requests: 20, windowSeconds: 60 },
  '/policies': { requests: 10, windowSeconds: 60 },
  '/audit/logs': { requests: 30, windowSeconds: 60 },
  '/audit/export': { requests: 5, windowSeconds: 300 },
  default: { requests: 60, windowSeconds: 60 },
};

/**
 * Checks and enforces rate limit for a user/IP on a path.
 * Returns null if allowed, or an error response if rate limited.
 */
async function checkRateLimit(userId, path, sourceIp) {
  const limit = RATE_LIMITS[path] || RATE_LIMITS.default;
  const key = `${userId || sourceIp}:${path}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - limit.windowSeconds;

  try {
    // Atomically increment request count and get current value
    const result = await dynamo.send(new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: { S: `rate:${key}` },
        sk: { S: 'count' },
      },
      UpdateExpression: 'SET #count = if_not_exists(#count, :zero) + :inc, #ttl = :ttl, #window = if_not_exists(#window, :windowStart)',
      ExpressionAttributeNames: {
        '#count': 'requestCount',
        '#ttl': 'ttl',
        '#window': 'windowStart',
      },
      ExpressionAttributeValues: {
        ':zero': { N: '0' },
        ':inc': { N: '1' },
        ':ttl': { N: String(now + limit.windowSeconds) },
        ':windowStart': { N: String(windowStart) },
      },
      ReturnValues: 'ALL_NEW',
    }));

    const count = parseInt(result.Attributes?.requestCount?.N || '0');
    const windowStartActual = parseInt(result.Attributes?.windowStart?.N || String(windowStart));

    // If window has expired, reset
    if (now - windowStartActual > limit.windowSeconds) {
      await resetRateLimit(key, windowStart, limit.windowSeconds, now);
      return null; // Allow the request
    }

    if (count > limit.requests) {
      const resetAt = windowStartActual + limit.windowSeconds;
      return {
        statusCode: 429,
        headers: {
          ...getSecurityHeaders(),
          'Retry-After': String(resetAt - now),
          'X-RateLimit-Limit': String(limit.requests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(resetAt),
        },
        body: JSON.stringify({
          message: 'Rate limit exceeded. Please try again later.',
        }),
      };
    }

    return null; // Request allowed
  } catch (err) {
    // On DynamoDB error, allow the request (fail open for availability)
    console.error('[RateLimit] DynamoDB error:', err.message);
    return null;
  }
}

async function resetRateLimit(key, windowStart, windowSeconds, now) {
  try {
    await dynamo.send(new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: {
        pk: { S: `rate:${key}` },
        sk: { S: 'count' },
      },
      UpdateExpression: 'SET #count = :one, #window = :window, #ttl = :ttl',
      ExpressionAttributeNames: {
        '#count': 'requestCount',
        '#window': 'windowStart',
        '#ttl': 'ttl',
      },
      ExpressionAttributeValues: {
        ':one': { N: '1' },
        ':window': { N: String(windowStart) },
        ':ttl': { N: String(now + windowSeconds) },
      },
    }));
  } catch (err) {
    console.error('[RateLimit] Reset error:', err.message);
  }
}

module.exports = { checkRateLimit };
