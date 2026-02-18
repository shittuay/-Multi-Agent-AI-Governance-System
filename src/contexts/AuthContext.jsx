/**
 * Authentication Context
 *
 * Provides auth state and user info throughout the React app.
 * Handles session timeout, MFA checks, and auth event listeners.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../auth/authService.js';
import { handleError } from '../utils/errorHandler.js';

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [error, setError] = useState(null);

  // ─── Initialization ─────────────────────────────────────────────────────────

  useEffect(() => {
    const initAuth = async () => {
      try {
        // Check if returning from OAuth callback
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const state = params.get('state');

        if (code && state) {
          // Handle OAuth callback
          const userProfile = await authService.handleCallback(code, state);
          setUser(userProfile);
          setIsAuthenticated(true);
          // Clean up URL - remove auth params from browser history
          window.history.replaceState({}, '', window.location.pathname);
        } else if (authService.isAuthenticated()) {
          // Restore existing session (token still in memory from prior navigation)
          // In a real SPA, you may restore from a secure session endpoint
          setIsAuthenticated(true);
        }
      } catch (err) {
        const safe = handleError(err, { context: 'auth-init' });
        setError(safe.message);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  // ─── Session Timeout Listener ───────────────────────────────────────────────

  useEffect(() => {
    const handleTimeout = () => {
      setUser(null);
      setIsAuthenticated(false);
      setSessionExpired(true);
    };

    const handleUnauthorized = () => {
      setUser(null);
      setIsAuthenticated(false);
      setError('Your session has expired. Please sign in again.');
    };

    window.addEventListener('session:timeout', handleTimeout);
    window.addEventListener('auth:unauthorized', handleUnauthorized);

    return () => {
      window.removeEventListener('session:timeout', handleTimeout);
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  // ─── Activity Tracking ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAuthenticated) return;

    const events = ['mousedown', 'keypress', 'scroll', 'touchstart'];
    const handleActivity = () => authService.recordActivity();

    events.forEach((e) => document.addEventListener(e, handleActivity, { passive: true }));
    return () => events.forEach((e) => document.removeEventListener(e, handleActivity));
  }, [isAuthenticated]);

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const signIn = useCallback(() => {
    setError(null);
    setSessionExpired(false);
    authService.signIn();
  }, []);

  const signOut = useCallback(async () => {
    try {
      setUser(null);
      setIsAuthenticated(false);
      await authService.signOut();
    } catch (err) {
      handleError(err, { context: 'sign-out' });
    }
  }, []);

  const dismissSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  // ─── Context Value ───────────────────────────────────────────────────────────

  const value = {
    user,
    isAuthenticated,
    isLoading,
    sessionExpired,
    error,
    signIn,
    signOut,
    dismissSessionExpired,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
