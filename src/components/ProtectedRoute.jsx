/**
 * Protected Route Component
 *
 * Guardrails:
 * - Redirects unauthenticated users to login
 * - Checks RBAC permissions before rendering
 * - Shows session expired notice
 * - Blocks rendering until auth state is resolved
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Shield, Clock, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { hasPermission, hasAnyPermission } from '../auth/rbac.js';

export function ProtectedRoute({ children, requiredPermission, anyOfPermissions }) {
  const { isAuthenticated, isLoading, user, sessionExpired, dismissSessionExpired } = useAuth();
  const location = useLocation();

  // Show loading state while auth is resolving
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <Shield className="h-12 w-12 text-blue-400 animate-pulse mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  // Session expired notice
  if (sessionExpired) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="bg-gray-900 border border-yellow-500/30 rounded-xl p-8 max-w-md w-full mx-4">
          <div className="text-center">
            <Clock className="h-12 w-12 text-yellow-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Session Expired</h2>
            <p className="text-gray-400 text-sm mb-6">
              Your session has expired due to inactivity. Please sign in again to continue.
            </p>
            <button
              onClick={dismissSessionExpired}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Sign In Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check specific permission
  if (requiredPermission && !hasPermission(user, requiredPermission)) {
    return <AccessDenied permission={requiredPermission} />;
  }

  // Check any-of permissions
  if (anyOfPermissions && !hasAnyPermission(user, anyOfPermissions)) {
    return <AccessDenied permission={anyOfPermissions.join(' or ')} />;
  }

  return children;
}

function AccessDenied({ permission }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 border border-red-500/30 rounded-xl p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <Lock className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
          <p className="text-gray-400 text-sm">
            You do not have the required permission to view this page.
          </p>
          <p className="text-gray-600 text-xs mt-2 font-mono">
            Required: {permission}
          </p>
        </div>
      </div>
    </div>
  );
}
