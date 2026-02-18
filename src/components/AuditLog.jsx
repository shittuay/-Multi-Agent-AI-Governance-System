/**
 * Audit Log Component
 *
 * Displays the immutable audit trail with:
 * - Hash chain integrity verification
 * - Risk-level color coding
 * - Filtering by agent, date range, result
 * - Secure export (logs the export event itself)
 * - Tamper detection UI
 */

import React, { useState, useCallback } from 'react';
import {
  Eye, Download, Shield, CheckCircle, XCircle,
  AlertTriangle, Filter, RefreshCw, Lock
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext.jsx';
import { hasPermission, RESOURCES } from '../auth/rbac.js';
import { auditExportRateLimiter } from '../utils/rateLimiter.js';
import { handleError } from '../utils/errorHandler.js';
import { RISK_LEVELS } from '../utils/auditLogger.js';

const RISK_COLORS = {
  [RISK_LEVELS.LOW]: 'text-green-400 bg-green-400/10 border-green-400/20',
  [RISK_LEVELS.MEDIUM]: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  [RISK_LEVELS.HIGH]: 'text-red-400 bg-red-400/10 border-red-400/20',
  [RISK_LEVELS.CRITICAL]: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
};

const RESULT_ICONS = {
  success: { icon: CheckCircle, className: 'text-green-400' },
  failure: { icon: XCircle, className: 'text-red-400' },
  warning: { icon: AlertTriangle, className: 'text-yellow-400' },
  pending: { icon: RefreshCw, className: 'text-blue-400 animate-spin' },
};

function AuditEntry({ entry, showHash }) {
  const resultCfg = RESULT_ICONS[entry.result] || RESULT_ICONS.pending;
  const ResultIcon = resultCfg.icon;

  return (
    <div className="flex gap-3 py-3 border-b border-gray-800/60 hover:bg-gray-800/20 transition-colors px-2 rounded">
      <div className="flex-shrink-0 pt-0.5">
        <ResultIcon className={`h-4 w-4 ${resultCfg.className}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-white text-sm font-medium truncate">{entry.action}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${RISK_COLORS[entry.risk] || RISK_COLORS.low}`}>
            {entry.risk}
          </span>
          <span className="text-gray-500 text-xs">{entry.agent}</span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-gray-600 text-xs">
          <span>{format(new Date(entry.timestamp), 'MMM d, HH:mm:ss')}</span>
          <span>User: {entry.userId}</span>
          {Object.keys(entry.details || {}).length > 0 && (
            <span className="truncate max-w-xs">
              {Object.entries(entry.details)
                .slice(0, 2)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · ')}
            </span>
          )}
        </div>
        {showHash && (
          <div className="flex items-center gap-1 mt-1 text-gray-700 text-xs font-mono">
            <Shield className="h-2.5 w-2.5" />
            <span className="truncate">{entry.entryHash}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function AuditLog({ entries = [], verificationResult, isLoading, onVerify, onExport, onRefresh }) {
  const { user } = useAuth();
  const [filter, setFilter] = useState({ agent: 'all', result: 'all', risk: 'all' });
  const [showHashes, setShowHashes] = useState(false);
  const [exportError, setExportError] = useState(null);

  const canExport = hasPermission(user, RESOURCES.AUDIT_EXPORT);
  const canVerify = hasPermission(user, RESOURCES.AUDIT_VERIFY);

  // Filter entries
  const filtered = entries.filter((e) => {
    if (filter.agent !== 'all' && !e.agent?.toLowerCase().includes(filter.agent)) return false;
    if (filter.result !== 'all' && e.result !== filter.result) return false;
    if (filter.risk !== 'all' && e.risk !== filter.risk) return false;
    return true;
  });

  const handleExport = useCallback(async () => {
    const { allowed } = auditExportRateLimiter.check(user?.id || 'anonymous');
    if (!allowed) {
      setExportError('Export rate limit reached. Please wait before exporting again.');
      return;
    }
    setExportError(null);
    try {
      await onExport?.(filtered);
    } catch (err) {
      const safe = handleError(err, { action: 'audit-export' });
      setExportError(safe.message);
    }
  }, [filtered, onExport, user]);

  const integrityOk = verificationResult?.valid;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Eye className="h-4 w-4 text-purple-400" />
            Audit Trail
          </h2>
          <p className="text-gray-500 text-xs mt-0.5">{entries.length} events · SHA-256 hash chain</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </button>
          {canVerify && (
            <button
              onClick={onVerify}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors ${
                verificationResult === null
                  ? 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                  : integrityOk
                  ? 'bg-green-600/20 text-green-400 border border-green-600/30'
                  : 'bg-red-600/20 text-red-400 border border-red-600/30'
              }`}
            >
              <Shield className="h-3 w-3" />
              {verificationResult === null ? 'Verify Integrity' : integrityOk ? 'Chain Valid' : 'TAMPERED!'}
            </button>
          )}
          {canExport && (
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg transition-colors"
            >
              <Download className="h-3 w-3" />
              Export
            </button>
          )}
          {!canExport && (
            <div className="flex items-center gap-1.5 text-xs text-gray-600 px-3 py-2">
              <Lock className="h-3 w-3" />
              Export restricted
            </div>
          )}
        </div>
      </div>

      {/* Integrity status */}
      {verificationResult !== null && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${
          integrityOk
            ? 'bg-green-500/10 border border-green-500/20 text-green-300'
            : 'bg-red-500/10 border border-red-500/20 text-red-300'
        }`}>
          {integrityOk ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          {integrityOk
            ? `Audit chain integrity verified. All ${entries.length} entries are tamper-free.`
            : `INTEGRITY FAILURE at entry ${verificationResult.firstTamperedIndex}. Evidence of tampering detected!`
          }
        </div>
      )}

      {exportError && (
        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <AlertTriangle className="h-3 w-3" />
          {exportError}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <Filter className="h-4 w-4 text-gray-500" />
        <select
          value={filter.result}
          onChange={(e) => setFilter((f) => ({ ...f, result: e.target.value }))}
          className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1.5"
        >
          <option value="all">All Results</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
          <option value="warning">Warning</option>
        </select>
        <select
          value={filter.risk}
          onChange={(e) => setFilter((f) => ({ ...f, risk: e.target.value }))}
          className="text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded-lg px-2 py-1.5"
        >
          <option value="all">All Risk Levels</option>
          <option value={RISK_LEVELS.LOW}>Low</option>
          <option value={RISK_LEVELS.MEDIUM}>Medium</option>
          <option value={RISK_LEVELS.HIGH}>High</option>
          <option value={RISK_LEVELS.CRITICAL}>Critical</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer ml-auto">
          <input
            type="checkbox"
            checked={showHashes}
            onChange={(e) => setShowHashes(e.target.checked)}
            className="rounded"
          />
          Show hashes
        </label>
      </div>

      {/* Log Entries */}
      <div className="bg-gray-900 border border-gray-700/50 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <RefreshCw className="h-6 w-6 text-gray-600 animate-spin mx-auto mb-2" />
            <p className="text-gray-600 text-sm">Loading audit log...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center">
            <Eye className="h-6 w-6 text-gray-700 mx-auto mb-2" />
            <p className="text-gray-600 text-sm">No audit events found</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-800/0 px-2 py-1 max-h-96 overflow-y-auto">
            {filtered.map((entry) => (
              <AuditEntry key={entry.id} entry={entry} showHash={showHashes} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
