/**
 * Agent Dashboard
 *
 * Displays status of all 5 governance agents with real-time metrics.
 * Includes guardrail indicators showing what's protecting the system.
 */

import React from 'react';
import {
  Shield, FileText, Eye, Brain, Lock,
  CheckCircle, AlertTriangle, XCircle, Activity,
  TrendingUp, TrendingDown, Minus
} from 'lucide-react';
import { RISK_LEVELS } from '../utils/auditLogger.js';

const AGENT_META = {
  compliance: {
    icon: Shield,
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    borderColor: 'border-green-400/30',
    label: 'Compliance Agent',
    description: 'Regulatory monitoring & risk assessment',
  },
  policy: {
    icon: FileText,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    borderColor: 'border-blue-400/30',
    label: 'Policy Agent',
    description: 'Governance policy management',
  },
  audit: {
    icon: Eye,
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
    borderColor: 'border-purple-400/30',
    label: 'Audit Agent',
    description: 'Audit trails & forensic analysis',
  },
  ethics: {
    icon: Brain,
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
    borderColor: 'border-orange-400/30',
    label: 'Ethics Agent',
    description: 'Bias detection & fairness evaluation',
  },
  privacy: {
    icon: Lock,
    color: 'text-pink-400',
    bgColor: 'bg-pink-400/10',
    borderColor: 'border-pink-400/30',
    label: 'Privacy Agent',
    description: 'GDPR/CCPA compliance',
  },
};

function StatusBadge({ status }) {
  const configs = {
    active: { icon: CheckCircle, text: 'Active', className: 'text-green-400 bg-green-400/10' },
    monitoring: { icon: Activity, text: 'Monitoring', className: 'text-blue-400 bg-blue-400/10' },
    warning: { icon: AlertTriangle, text: 'Warning', className: 'text-yellow-400 bg-yellow-400/10' },
    error: { icon: XCircle, text: 'Error', className: 'text-red-400 bg-red-400/10' },
    idle: { icon: Minus, text: 'Idle', className: 'text-gray-400 bg-gray-400/10' },
  };
  const { icon: Icon, text, className } = configs[status] || configs.idle;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${className}`}>
      <Icon className="h-3 w-3" />
      {text}
    </span>
  );
}

function RiskBadge({ risk }) {
  const configs = {
    [RISK_LEVELS.LOW]: 'text-green-400 bg-green-400/10',
    [RISK_LEVELS.MEDIUM]: 'text-yellow-400 bg-yellow-400/10',
    [RISK_LEVELS.HIGH]: 'text-red-400 bg-red-400/10',
    [RISK_LEVELS.CRITICAL]: 'text-purple-400 bg-purple-400/10',
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${configs[risk] || configs.low}`}>
      {risk} risk
    </span>
  );
}

function MetricCard({ label, value, trend, unit = '' }) {
  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend > 0 ? 'text-green-400' : trend < 0 ? 'text-red-400' : 'text-gray-400';
  return (
    <div className="bg-gray-800/50 rounded-lg p-3">
      <p className="text-gray-500 text-xs mb-1">{label}</p>
      <div className="flex items-end gap-2">
        <p className="text-white font-semibold text-lg">{value}{unit}</p>
        {trend !== undefined && (
          <TrendIcon className={`h-4 w-4 mb-0.5 ${trendColor}`} />
        )}
      </div>
    </div>
  );
}

export function AgentDashboard({ agents, metrics, onSelectAgent }) {
  return (
    <div className="space-y-6">
      {/* Header Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Overall Compliance"
            value={metrics.overall?.score}
            unit="%"
            trend={metrics.overall?.trend}
          />
          <MetricCard
            label="Active Policies"
            value={metrics.policies?.active}
          />
          <MetricCard
            label="Audit Events (24h)"
            value={metrics.audit?.eventsLast24h?.toLocaleString()}
          />
          <MetricCard
            label="Active Violations"
            value={metrics.risk?.activeViolations}
            trend={metrics.risk?.activeViolations > 0 ? -1 : 0}
          />
        </div>
      )}

      {/* Agent Cards */}
      <div>
        <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-400" />
          Governance Agents
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Object.entries(agents).map(([agentId, agent]) => {
            const meta = AGENT_META[agentId];
            if (!meta) return null;
            const Icon = meta.icon;
            return (
              <div
                key={agentId}
                onClick={() => onSelectAgent?.(agentId)}
                className={`
                  bg-gray-900 border rounded-xl p-4 cursor-pointer
                  transition-all duration-200 hover:bg-gray-800
                  ${meta.borderColor}
                `}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${meta.bgColor}`}>
                      <Icon className={`h-5 w-5 ${meta.color}`} />
                    </div>
                    <div>
                      <h3 className="text-white font-medium text-sm">{meta.label}</h3>
                      <p className="text-gray-500 text-xs">{meta.description}</p>
                    </div>
                  </div>
                  <StatusBadge status={agent.status} />
                </div>

                <div className="flex items-center justify-between mt-3">
                  <RiskBadge risk={agent.riskLevel || RISK_LEVELS.LOW} />
                  {agent.alerts > 0 && (
                    <span className="flex items-center gap-1 text-xs text-yellow-400">
                      <AlertTriangle className="h-3 w-3" />
                      {agent.alerts} alert{agent.alerts !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {agent.lastAction && (
                  <p className="text-gray-600 text-xs mt-2 truncate">
                    Last: {agent.lastAction}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Alerts */}
      {metrics?.alerts && metrics.alerts.length > 0 && (
        <div>
          <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400" />
            Active Alerts
          </h2>
          <div className="space-y-2">
            {metrics.alerts.map((alert) => (
              <div
                key={alert.id}
                className={`
                  flex items-center gap-3 p-3 rounded-lg border text-sm
                  ${alert.severity === 'critical'
                    ? 'bg-red-500/5 border-red-500/30 text-red-300'
                    : 'bg-yellow-500/5 border-yellow-500/30 text-yellow-300'
                  }
                `}
              >
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
