/**
 * Main Application
 *
 * Entry point for the Multi-Agent AI Governance System.
 * Orchestrates routing, auth, agent communication, and all guardrails.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import {
  Shield, FileText, Eye, Brain, Lock,
  LogOut, User, Wifi, WifiOff, Menu, X, Bell
} from 'lucide-react';

import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { ProtectedRoute } from './components/ProtectedRoute.jsx';
import { LoginPage } from './components/LoginPage.jsx';
import { AgentDashboard } from './components/AgentDashboard.jsx';
import { ChatInterface } from './components/ChatInterface.jsx';
import { PolicyPanel } from './components/PolicyPanel.jsx';
import { AuditLog } from './components/AuditLog.jsx';

import { useAgentStatus } from './hooks/useAgentStatus.js';
import { useRealTimeUpdates, WS_EVENTS } from './hooks/useRealTimeUpdates.js';

import { queryAgent, AGENTS } from './utils/agentSecurity.js';
import { getMockResponse } from './utils/agentResponses.js';
import { auditLogger, AUDIT_ACTIONS, RISK_LEVELS } from './utils/auditLogger.js';
import { buildMetricsSummary } from './utils/complianceMetrics.js';
import { RESOURCES } from './auth/rbac.js';
import { handleError } from './utils/errorHandler.js';

// ─── Navigation ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: Shield, path: '/' },
  { id: 'compliance', label: 'Compliance', icon: Shield, path: '/agent/compliance' },
  { id: 'policy', label: 'Policies', icon: FileText, path: '/agent/policy' },
  { id: 'audit', label: 'Audit', icon: Eye, path: '/agent/audit' },
  { id: 'ethics', label: 'Ethics', icon: Brain, path: '/agent/ethics' },
  { id: 'privacy', label: 'Privacy', icon: Lock, path: '/agent/privacy' },
];

function Sidebar({ connectionStatus, onSignOut }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isOnline = connectionStatus === 'connected';

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 bg-gray-800 p-2 rounded-lg"
        onClick={() => setMobileOpen((v) => !v)}
      >
        {mobileOpen ? <X className="h-5 w-5 text-white" /> : <Menu className="h-5 w-5 text-white" />}
      </button>

      {/* Sidebar */}
      <aside className={`
        fixed left-0 top-0 h-full w-56 bg-gray-900 border-r border-gray-800
        flex flex-col z-40 transition-transform duration-300
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-800">
          <div className="bg-blue-600/20 p-2 rounded-lg border border-blue-500/30">
            <Shield className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">AI Governance</p>
            <p className="text-gray-600 text-xs">Enterprise Edition</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ id, label, icon: Icon, path }) => {
            const isActive = location.pathname === path ||
              (path !== '/' && location.pathname.startsWith(path));
            return (
              <button
                key={id}
                onClick={() => { navigate(path); setMobileOpen(false); }}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                  transition-colors text-left
                  ${isActive
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-600/30'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }
                `}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {label}
              </button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-gray-800 space-y-3">
          {/* Connection status */}
          <div className={`flex items-center gap-2 text-xs ${isOnline ? 'text-green-400' : 'text-gray-600'}`}>
            {isOnline ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {isOnline ? 'Real-time connected' : 'Polling mode'}
          </div>

          {/* User info */}
          <div className="flex items-center gap-2">
            <div className="bg-gray-700 p-1.5 rounded-full">
              <User className="h-3 w-3 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.name || user?.email}</p>
              <p className="text-gray-600 text-xs capitalize">{user?.role?.replace(/_/g, ' ')}</p>
            </div>
          </div>

          <button
            onClick={onSignOut}
            className="w-full flex items-center gap-2 text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            <LogOut className="h-3 w-3" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}

// ─── OAuth Callback Handler ───────────────────────────────────────────────────

function AuthCallback() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <Shield className="h-10 w-10 text-blue-400 animate-pulse mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Completing authentication...</p>
      </div>
    </div>
  );
}

// ─── Main Dashboard Shell ─────────────────────────────────────────────────────

function GovernanceApp() {
  const { user, signOut } = useAuth();
  const { agents, refresh: refreshAgents, updateAgentStatus } = useAgentStatus(true);
  const [auditEntries, setAuditEntries] = useState([]);
  const [policies, setPolicies] = useState(DEMO_POLICIES);
  const [verificationResult, setVerificationResult] = useState(null);
  const [isAuditLoading, setIsAuditLoading] = useState(false);

  const metrics = buildMetricsSummary({
    complianceScore: 94,
    activePolicies: policies.filter((p) => p.status === 'active').length,
    auditEvents: auditEntries.length,
    violations: [],
    policyAdherence: 98.2,
    auditCoverage: 99.1,
    responseTimeMs: 420,
  });

  // Real-time event handler
  const handleRealtimeEvent = useCallback((event) => {
    switch (event.type) {
      case WS_EVENTS.AGENT_STATUS_CHANGE:
        if (event.agentId) updateAgentStatus(event.agentId, event.data);
        break;
      case WS_EVENTS.AUDIT_EVENT:
        setAuditEntries((prev) => [event.data, ...prev].slice(0, 200));
        break;
      default:
        break;
    }
  }, [updateAgentStatus]);

  const { connectionStatus } = useRealTimeUpdates({
    onEvent: handleRealtimeEvent,
    enabled: true,
  });

  // Load audit entries
  useEffect(() => {
    const entries = auditLogger.getLocalEntries(50);
    setAuditEntries(entries);
  }, []);

  // Send message to agent
  const handleAgentMessage = useCallback(async (agentId, message) => {
    try {
      // In production: use queryAgent(agentId, message, user)
      // In development: use mock responses
      const isDev = import.meta.env.VITE_APP_ENV !== 'production';
      if (isDev) {
        // Simulate network delay
        await new Promise((r) => setTimeout(r, 1000 + Math.random() * 500));
        return getMockResponse(agentId, message);
      }
      return await queryAgent(agentId, message, user);
    } catch (err) {
      const safe = handleError(err, { agentId });
      throw new Error(safe.message);
    }
  }, [user]);

  // Audit log actions
  const handleVerifyAudit = useCallback(async () => {
    setIsAuditLoading(true);
    try {
      const result = await auditLogger.verifyIntegrity(auditEntries);
      setVerificationResult(result);
    } catch (err) {
      handleError(err, { action: 'verify-audit' });
    } finally {
      setIsAuditLoading(false);
    }
  }, [auditEntries]);

  const handleExportAudit = useCallback(async (entries) => {
    const exportData = await auditLogger.exportLogs(entries);
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Policy actions
  const handleApprovePolicy = useCallback((policyId) => {
    setPolicies((prev) =>
      prev.map((p) => p.id === policyId ? { ...p, status: 'active', approvedBy: user?.id } : p)
    );
  }, [user]);

  const handleRejectPolicy = useCallback((policyId) => {
    setPolicies((prev) =>
      prev.map((p) => p.id === policyId ? { ...p, status: 'rejected' } : p)
    );
  }, []);

  const handleTogglePolicy = useCallback((policyId, enabled) => {
    setPolicies((prev) =>
      prev.map((p) => p.id === policyId ? { ...p, status: enabled ? 'active' : 'disabled' } : p)
    );
  }, []);

  return (
    <div className="flex min-h-screen bg-gray-950">
      <Sidebar connectionStatus={connectionStatus} onSignOut={signOut} />

      <main className="flex-1 lg:ml-56 p-4 lg:p-6 overflow-auto">
        <Routes>
          <Route
            path="/"
            element={
              <AgentDashboard
                agents={agents}
                metrics={metrics}
                onSelectAgent={(id) => window.location.hash = `#/agent/${id}`}
              />
            }
          />
          {Object.values(AGENTS).map((agentId) => (
            <Route
              key={agentId}
              path={`/agent/${agentId}`}
              element={
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-[calc(100vh-3rem)]">
                  <div className="h-[500px] xl:h-full">
                    <ChatInterface agentId={agentId} onSendMessage={handleAgentMessage} />
                  </div>
                  {agentId === 'audit' && (
                    <AuditLog
                      entries={auditEntries}
                      verificationResult={verificationResult}
                      isLoading={isAuditLoading}
                      onVerify={handleVerifyAudit}
                      onExport={handleExportAudit}
                      onRefresh={() => setAuditEntries(auditLogger.getLocalEntries(50))}
                    />
                  )}
                  {agentId === 'policy' && (
                    <PolicyPanel
                      policies={policies}
                      onApprove={handleApprovePolicy}
                      onReject={handleRejectPolicy}
                      onToggle={handleTogglePolicy}
                    />
                  )}
                </div>
              }
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <GovernanceApp />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

// ─── Demo Data ────────────────────────────────────────────────────────────────

const DEMO_POLICIES = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'GDPR Data Retention Policy',
    description: 'Personal data must not be retained beyond its stated purpose',
    framework: 'GDPR',
    severity: 'high',
    status: 'active',
    version: 3,
    rules: 'Personal data shall be kept for no longer than is necessary.\nData subjects must be informed of retention periods.',
    createdBy: 'admin',
    createdAt: '2024-01-15T09:00:00Z',
    updatedAt: '2024-06-20T14:30:00Z',
    approvedBy: 'compliance-officer',
    approvedAt: '2024-06-20T16:00:00Z',
    versionHash: 'abc123def456',
    history: [
      { id: 'h1', action: 'created', userId: 'admin', timestamp: '2024-01-15T09:00:00Z', changes: null },
      { id: 'h2', action: 'approved', userId: 'compliance-officer', timestamp: '2024-01-15T11:00:00Z', changes: null },
    ],
  },
  {
    id: '22222222-2222-2222-2222-222222222222',
    name: 'AI Bias Detection Protocol',
    description: 'All AI models must pass bias detection before deployment',
    framework: 'CUSTOM',
    severity: 'critical',
    status: 'pending_approval',
    version: 1,
    rules: 'AI models must achieve >95% fairness score.\nBias detection must run before each deployment.',
    createdBy: 'policy-manager-1',
    createdAt: '2026-02-15T10:00:00Z',
    updatedAt: '2026-02-15T10:00:00Z',
    approvedBy: null,
    approvedAt: null,
    versionHash: 'xyz789abc012',
    history: [
      { id: 'h3', action: 'created', userId: 'policy-manager-1', timestamp: '2026-02-15T10:00:00Z', changes: null },
    ],
  },
  {
    id: '33333333-3333-3333-3333-333333333333',
    name: 'CCPA Consumer Rights Policy',
    description: 'California consumers have the right to know, delete, and opt-out',
    framework: 'CCPA',
    severity: 'high',
    status: 'active',
    version: 2,
    rules: 'Must respond to consumer requests within 45 days.\nProvide opt-out mechanisms on all data collection points.',
    createdBy: 'admin',
    createdAt: '2024-03-01T08:00:00Z',
    updatedAt: '2024-09-10T12:00:00Z',
    approvedBy: 'compliance-officer',
    approvedAt: '2024-09-10T14:00:00Z',
    versionHash: 'def456ghi789',
    history: [
      { id: 'h4', action: 'created', userId: 'admin', timestamp: '2024-03-01T08:00:00Z', changes: null },
    ],
  },
];
