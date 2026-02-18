/**
 * Policy Panel - Policy Management with Approval Workflow
 *
 * Displays all policies, their status, and version history.
 * Enforces RBAC: only authorized users see edit/approve controls.
 */

import React, { useState } from 'react';
import {
  FileText, Plus, CheckCircle, XCircle, Clock,
  AlertTriangle, ChevronDown, ChevronUp, Eye, Lock,
  History, Shield
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { hasPermission, RESOURCES } from '../auth/rbac.js';
import { POLICY_STATUS } from '../utils/policyManager.js';
import { handleError } from '../utils/errorHandler.js';

const STATUS_CONFIG = {
  [POLICY_STATUS.ACTIVE]: { icon: CheckCircle, color: 'text-green-400', label: 'Active', bg: 'bg-green-400/10' },
  [POLICY_STATUS.PENDING_APPROVAL]: { icon: Clock, color: 'text-yellow-400', label: 'Pending Approval', bg: 'bg-yellow-400/10' },
  [POLICY_STATUS.DRAFT]: { icon: FileText, color: 'text-gray-400', label: 'Draft', bg: 'bg-gray-400/10' },
  [POLICY_STATUS.DISABLED]: { icon: XCircle, color: 'text-gray-500', label: 'Disabled', bg: 'bg-gray-500/10' },
  [POLICY_STATUS.REJECTED]: { icon: XCircle, color: 'text-red-400', label: 'Rejected', bg: 'bg-red-400/10' },
  [POLICY_STATUS.ARCHIVED]: { icon: History, color: 'text-gray-600', label: 'Archived', bg: 'bg-gray-600/10' },
};

const SEVERITY_COLORS = {
  low: 'text-green-400 bg-green-400/10',
  medium: 'text-yellow-400 bg-yellow-400/10',
  high: 'text-red-400 bg-red-400/10',
  critical: 'text-purple-400 bg-purple-400/10',
};

function PolicyCard({ policy, onApprove, onReject, onToggle, onViewHistory }) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);

  const canApprove = hasPermission(user, RESOURCES.POLICY_APPROVE);
  const canToggle = hasPermission(user, RESOURCES.POLICY_ENABLE_DISABLE);
  const canViewHistory = hasPermission(user, RESOURCES.AUDIT_READ);

  const status = STATUS_CONFIG[policy.status] || STATUS_CONFIG[POLICY_STATUS.DRAFT];
  const StatusIcon = status.icon;
  const isOwnPolicy = policy.createdBy === user?.id || policy.updatedBy === user?.id;

  return (
    <div className="bg-gray-900 border border-gray-700/50 rounded-xl overflow-hidden">
      <div
        className="flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-800/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-medium text-sm truncate">{policy.name}</h3>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.bg} ${status.color} flex items-center gap-1`}>
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_COLORS[policy.severity] || SEVERITY_COLORS.low}`}>
              {policy.severity}
            </span>
          </div>
          <p className="text-gray-500 text-xs mt-1 truncate">{policy.description}</p>
          <div className="flex items-center gap-3 mt-1.5 text-gray-600 text-xs">
            <span>Framework: {policy.framework}</span>
            <span>v{policy.version}</span>
            {policy.conflicts?.length > 0 && (
              <span className="text-yellow-400 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {policy.conflicts.length} conflict(s)
              </span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">
          {expanded ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-700/50 p-4 space-y-3">
          {/* Rules preview */}
          <div>
            <p className="text-gray-500 text-xs font-medium mb-1">Policy Rules</p>
            <pre className="text-gray-300 text-xs bg-gray-800/50 rounded-lg p-3 whitespace-pre-wrap max-h-32 overflow-y-auto font-mono">
              {policy.rules || 'No rules defined.'}
            </pre>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
            <span>Created: {new Date(policy.createdAt).toLocaleDateString()}</span>
            <span>Updated: {new Date(policy.updatedAt).toLocaleDateString()}</span>
            {policy.approvedBy && <span>Approved by: {policy.approvedBy}</span>}
          </div>

          {/* Integrity hash */}
          <div className="flex items-center gap-2 text-xs text-gray-600 font-mono bg-gray-800/30 rounded p-2">
            <Shield className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">Hash: {policy.versionHash}</span>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            {/* Approval actions - only for pending policies, and not your own */}
            {policy.status === POLICY_STATUS.PENDING_APPROVAL && canApprove && !isOwnPolicy && (
              <>
                <button
                  onClick={() => onApprove?.(policy.id)}
                  className="flex items-center gap-1.5 text-xs bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/30 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <CheckCircle className="h-3 w-3" />
                  Approve
                </button>
                <button
                  onClick={() => onReject?.(policy.id)}
                  className="flex items-center gap-1.5 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/30 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <XCircle className="h-3 w-3" />
                  Reject
                </button>
              </>
            )}

            {/* Separation of duties notice */}
            {policy.status === POLICY_STATUS.PENDING_APPROVAL && canApprove && isOwnPolicy && (
              <p className="text-xs text-yellow-400 flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Cannot approve your own policy (separation of duties)
              </p>
            )}

            {/* Enable/Disable */}
            {canToggle && policy.status !== POLICY_STATUS.PENDING_APPROVAL && (
              <button
                onClick={() => onToggle?.(policy.id, policy.status !== POLICY_STATUS.ACTIVE)}
                className="flex items-center gap-1.5 text-xs bg-gray-700/50 hover:bg-gray-700 text-gray-300 border border-gray-600/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                {policy.status === POLICY_STATUS.ACTIVE ? 'Disable' : 'Enable'}
              </button>
            )}

            {/* View history */}
            {canViewHistory && policy.history?.length > 0 && (
              <button
                onClick={() => onViewHistory?.(policy)}
                className="flex items-center gap-1.5 text-xs bg-gray-700/50 hover:bg-gray-700 text-gray-400 border border-gray-600/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                <History className="h-3 w-3" />
                History ({policy.history.length})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function PolicyPanel({ policies = [], onCreatePolicy, onApprove, onReject, onToggle, isLoading }) {
  const { user } = useAuth();
  const [filter, setFilter] = useState('all');
  const [historyPolicy, setHistoryPolicy] = useState(null);

  const canCreate = hasPermission(user, RESOURCES.POLICY_CREATE);

  const filtered = filter === 'all'
    ? policies
    : policies.filter((p) => p.status === filter);

  const pendingCount = policies.filter((p) => p.status === POLICY_STATUS.PENDING_APPROVAL).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-400" />
            Policy Management
          </h2>
          <p className="text-gray-500 text-xs mt-0.5">
            {policies.filter((p) => p.status === POLICY_STATUS.ACTIVE).length} active of {policies.length} total
            {pendingCount > 0 && (
              <span className="text-yellow-400 ml-2">· {pendingCount} pending approval</span>
            )}
          </p>
        </div>
        {canCreate && (
          <button
            onClick={onCreatePolicy}
            className="flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Policy
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {['all', POLICY_STATUS.ACTIVE, POLICY_STATUS.PENDING_APPROVAL, POLICY_STATUS.DISABLED].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-lg transition-colors capitalize ${
              filter === f
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {f === 'all' ? 'All' : f.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {/* Policy List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-900 border border-gray-700/50 rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-gray-700 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-800 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-600">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No policies found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((policy) => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              onApprove={onApprove}
              onReject={onReject}
              onToggle={onToggle}
              onViewHistory={setHistoryPolicy}
            />
          ))}
        </div>
      )}

      {/* History Modal */}
      {historyPolicy && (
        <PolicyHistoryModal
          policy={historyPolicy}
          onClose={() => setHistoryPolicy(null)}
        />
      )}
    </div>
  );
}

function PolicyHistoryModal({ policy, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-white font-medium">
            <History className="h-4 w-4 inline mr-2 text-purple-400" />
            Version History: {policy.name}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <XCircle className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3">
          {policy.history?.map((entry, i) => (
            <div key={entry.id || i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="h-2 w-2 rounded-full bg-blue-400 mt-1.5" />
                {i < policy.history.length - 1 && <div className="w-px flex-1 bg-gray-700 mt-1" />}
              </div>
              <div className="flex-1 pb-3">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <span className="capitalize font-medium text-white">{entry.action}</span>
                  <span>by {entry.userId}</span>
                  <span className="text-gray-600">{new Date(entry.timestamp).toLocaleString()}</span>
                </div>
                {entry.changes && Object.keys(entry.changes).length > 0 && (
                  <div className="mt-1 text-xs text-gray-600 space-y-0.5">
                    {Object.entries(entry.changes).map(([field, change]) => (
                      <div key={field}>
                        <span className="text-gray-500">{field}: </span>
                        <span className="text-red-400 line-through">{String(change.from).slice(0, 40)}</span>
                        {' → '}
                        <span className="text-green-400">{String(change.to).slice(0, 40)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
