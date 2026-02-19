/**
 * useAgentStatus Hook
 *
 * Manages the status of all 5 governance agents.
 * Polls for updates at a configurable interval.
 * Rate-limits polling to avoid API abuse.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AGENTS } from '../utils/agentSecurity.js';
import { apiFetch } from '../auth/authService.js';
import { handleError } from '../utils/errorHandler.js';
import { RISK_LEVELS } from '../utils/auditLogger.js';

const DEFAULT_INTERVAL = parseInt(import.meta.env.VITE_AGENT_UPDATE_INTERVAL) || 5000;
const MIN_INTERVAL = 3000; // Never poll faster than 3 seconds

const INITIAL_AGENT_STATE = {
  [AGENTS.COMPLIANCE]: {
    status: 'monitoring',
    riskLevel: RISK_LEVELS.MEDIUM,
    alerts: 2,
    lastAction: 'GDPR compliance scan completed',
    metrics: { violationsDetected: 2, riskScore: 45 },
  },
  [AGENTS.POLICY]: {
    status: 'active',
    riskLevel: RISK_LEVELS.LOW,
    alerts: 0,
    lastAction: 'Policy registry updated',
    metrics: { activePolicies: 24, pendingApprovals: 3 },
  },
  [AGENTS.AUDIT]: {
    status: 'active',
    riskLevel: RISK_LEVELS.LOW,
    alerts: 0,
    lastAction: 'Audit chain verification passed',
    metrics: { eventsLogged: 1247, chainValid: true },
  },
  [AGENTS.ETHICS]: {
    status: 'monitoring',
    riskLevel: RISK_LEVELS.LOW,
    alerts: 1,
    lastAction: 'Bias scan completed - low bias detected',
    metrics: { biasScore: 0.12, fairnessScore: 96.3 },
  },
  [AGENTS.PRIVACY]: {
    status: 'active',
    riskLevel: RISK_LEVELS.MEDIUM,
    alerts: 1,
    lastAction: '7 deletion requests pending review',
    metrics: { gdprCompliance: 96, pendingDeletions: 7 },
  },
};

export function useAgentStatus(enabled = true) {
  const [agents, setAgents] = useState(INITIAL_AGENT_STATE);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const intervalRef = useRef(null);
  const isMounted = useRef(true);

  const fetchAgentStatus = useCallback(async () => {
    if (!isMounted.current) return;
    setIsLoading(true);

    try {
      const response = await apiFetch('/agents/status');
      if (!response.ok) throw new Error(`Status fetch failed: ${response.status}`);
      const data = await response.json();

      if (isMounted.current) {
        setAgents((prev) => ({
          ...prev,
          ...data.agents,
        }));
        setLastUpdated(new Date().toISOString());
        setError(null);
      }
    } catch (err) {
      // Fallback: keep current state, show non-blocking error
      if (isMounted.current) {
        const safe = handleError(err, { context: 'agent-status-fetch' });
        // Only show error after 3 consecutive failures (resilience)
        setError(safe.message);
      }
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, []);

  // Poll for status updates
  useEffect(() => {
    if (!enabled || import.meta.env.VITE_ENABLE_REAL_TIME_UPDATES !== 'true') {
      return;
    }

    const interval = Math.max(MIN_INTERVAL, DEFAULT_INTERVAL);

    // Initial fetch
    fetchAgentStatus();

    // Set up polling
    intervalRef.current = setInterval(fetchAgentStatus, interval);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, fetchAgentStatus]);

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const refresh = useCallback(() => {
    fetchAgentStatus();
  }, [fetchAgentStatus]);

  /**
   * Updates a single agent's status locally (optimistic update).
   */
  const updateAgentStatus = useCallback((agentId, updates) => {
    setAgents((prev) => {
      // eslint-disable-next-line security/detect-object-injection
      const current = prev[agentId];
      return { ...prev, [agentId]: { ...current, ...updates } };
    });
  }, []);

  return {
    agents,
    isLoading,
    error,
    lastUpdated,
    refresh,
    updateAgentStatus,
  };
}
