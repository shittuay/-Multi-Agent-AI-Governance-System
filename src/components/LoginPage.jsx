/**
 * Login Page
 *
 * Entry point for authentication via AWS Cognito Hosted UI (PKCE).
 * No credentials are ever entered directly in this app.
 */

import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Shield, Lock, Eye, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';

export function LoginPage() {
  const { isAuthenticated, isLoading, signIn, error } = useAuth();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  // Already authenticated
  if (!isLoading && isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-blue-600/20 p-4 rounded-2xl border border-blue-500/30">
              <Shield className="h-10 w-10 text-blue-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">AI Governance System</h1>
          <p className="text-gray-400 text-sm mt-2">
            Enterprise Compliance & Ethical AI Oversight
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-gray-900 border border-gray-700/50 rounded-2xl p-8">
          <h2 className="text-lg font-semibold text-white mb-2">Secure Sign In</h2>
          <p className="text-gray-400 text-sm mb-6">
            Authentication is handled securely via AWS Cognito with MFA support.
          </p>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Sign In Button */}
          <button
            onClick={signIn}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Authenticating...
              </>
            ) : (
              <>
                <Lock className="h-4 w-4" />
                Sign In with Cognito
              </>
            )}
          </button>

          {/* Security Features */}
          <div className="mt-6 space-y-2">
            {[
              { icon: Lock, text: 'PKCE OAuth2 flow (no password in app)' },
              { icon: Shield, text: 'MFA supported for all accounts' },
              { icon: Eye, text: 'All sessions are audit logged' },
              { icon: CheckCircle, text: '30-minute idle session timeout' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-gray-500 text-xs">
                <Icon className="h-3 w-3 text-gray-600 flex-shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-gray-600 text-xs mt-6">
          Access restricted to authorized personnel only.
          <br />
          All access attempts are logged and monitored.
        </p>
      </div>
    </div>
  );
}
