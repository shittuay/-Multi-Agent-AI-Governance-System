/**
 * useRealTimeUpdates Hook
 *
 * Manages WebSocket connection for real-time agent events.
 *
 * Security guardrails:
 * - Only connects if user is authenticated
 * - Validates all incoming messages before processing
 * - Enforces message size limits
 * - Auto-reconnects with exponential backoff (max 5 retries)
 * - Connection closed cleanly on logout
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { authService } from '../auth/authService.js';
import { sanitizeText } from '../utils/inputValidation.js';

const MAX_MESSAGE_SIZE = 64 * 1024; // 64KB max WebSocket message
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 1000;

export const WS_EVENTS = {
  AGENT_STATUS_CHANGE: 'agent.status_change',
  COMPLIANCE_ALERT: 'compliance.alert',
  POLICY_UPDATE: 'policy.update',
  AUDIT_EVENT: 'audit.event',
  ETHICS_ALERT: 'ethics.alert',
  PRIVACY_ALERT: 'privacy.alert',
};

export function useRealTimeUpdates({ onEvent, enabled = true } = {}) {
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastEvent, setLastEvent] = useState(null);
  const wsRef = useRef(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef(null);
  const isMounted = useRef(true);
  const onEventRef = useRef(onEvent);

  // Keep callback ref up to date
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const connect = useCallback(async () => {
    if (!isMounted.current) return;
    if (!enabled) return;
    if (!import.meta.env.VITE_WEBSOCKET_URL) return; // No WebSocket URL configured

    // Don't connect if not authenticated
    const token = await authService.getAccessToken();
    if (!token) return;

    const wsUrl = `${import.meta.env.VITE_WEBSOCKET_URL}?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      setConnectionStatus('connecting');

      ws.onopen = () => {
        if (!isMounted.current) return;
        setConnectionStatus('connected');
        retryCountRef.current = 0; // Reset retry count on success
      };

      ws.onmessage = (event) => {
        if (!isMounted.current) return;

        // Enforce message size limit
        if (event.data?.length > MAX_MESSAGE_SIZE) {
          // Silently drop oversized messages - do not log raw data
          return;
        }

        let parsed;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          // Silently drop malformed JSON - prevents log spam from malformed messages
          return;
        }

        // Validate message structure
        if (!isValidWebSocketEvent(parsed)) {
          // Silently drop unexpected event types
          return;
        }

        // Sanitize string fields
        const sanitized = sanitizeWebSocketEvent(parsed);
        setLastEvent(sanitized);
        onEventRef.current?.(sanitized);
      };

      ws.onerror = () => {
        if (!isMounted.current) return;
        setConnectionStatus('error');
      };

      ws.onclose = (event) => {
        if (!isMounted.current) return;
        setConnectionStatus('disconnected');
        wsRef.current = null;

        // Attempt reconnect with exponential backoff (unless intentional close)
        if (event.code !== 1000 && retryCountRef.current < MAX_RETRIES) {
          const delay = BASE_RETRY_DELAY_MS * Math.pow(2, retryCountRef.current);
          retryCountRef.current += 1;

          retryTimerRef.current = setTimeout(() => {
            if (isMounted.current) connect();
          }, delay);
        }
      };
    } catch {
      setConnectionStatus('error');
    }
  }, [enabled]);

  const disconnect = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'Client logout'); // Normal closure
      wsRef.current = null;
    }
    setConnectionStatus('disconnected');
  }, []);

  // Connect on mount, listen for auth events
  useEffect(() => {
    isMounted.current = true;

    if (enabled && import.meta.env.VITE_ENABLE_REAL_TIME_UPDATES === 'true') {
      connect();
    }

    // Disconnect on logout
    const handleUnauthorized = () => disconnect();
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    window.addEventListener('session:timeout', handleUnauthorized);

    return () => {
      isMounted.current = false;
      disconnect();
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
      window.removeEventListener('session:timeout', handleUnauthorized);
    };
  }, [enabled, connect, disconnect]);

  return {
    connectionStatus,
    lastEvent,
    reconnect: connect,
    disconnect,
  };
}

// ─── Validation Helpers ───────────────────────────────────────────────────────

function isValidWebSocketEvent(event) {
  return (
    event !== null &&
    typeof event === 'object' &&
    typeof event.type === 'string' &&
    Object.values(WS_EVENTS).includes(event.type) &&
    typeof event.timestamp === 'string'
  );
}

function sanitizeWebSocketEvent(event) {
  return {
    type: event.type,
    timestamp: event.timestamp,
    agentId: event.agentId ? sanitizeText(String(event.agentId)) : undefined,
    data: event.data && typeof event.data === 'object'
      ? sanitizeEventData(event.data)
      : {},
  };
}

function sanitizeEventData(data) {
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      // eslint-disable-next-line security/detect-object-injection
      sanitized[key] = sanitizeText(value).slice(0, 500);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      // eslint-disable-next-line security/detect-object-injection
      sanitized[key] = value;
    }
    // Drop any nested objects or arrays from event data
  }
  return sanitized;
}
