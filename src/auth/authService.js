/**
 * Authentication Service
 *
 * Manages authentication via AWS Cognito.
 * Handles token storage, refresh, expiry, and secure session management.
 *
 * Security guardrails:
 * - Tokens stored in memory (not localStorage) to prevent XSS token theft
 * - Refresh tokens handled server-side via httpOnly cookies
 * - Session timeout enforced
 * - Auth state is cleared on logout everywhere
 */

import { handleError, AppError, ErrorTypes } from '../utils/errorHandler.js';
import { authRateLimiter } from '../utils/rateLimiter.js';

// ─── Config ───────────────────────────────────────────────────────────────────

const COGNITO_CONFIG = {
  region: import.meta.env.VITE_COGNITO_REGION || 'us-east-1',
  userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID,
  domain: import.meta.env.VITE_COGNITO_DOMAIN,
};

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes idle timeout
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000; // Refresh 5 min before expiry

// ─── In-Memory Token Store ────────────────────────────────────────────────────
// Tokens are stored in memory only - NOT in localStorage or sessionStorage.
// This protects against XSS-based token theft.

let _accessToken = null;
let _tokenExpiry = null;
let _sessionTimer = null;
let _lastActivity = Date.now();

// ─── Auth Service ─────────────────────────────────────────────────────────────

export const authService = {
  /**
   * Initiates sign-in via Cognito Hosted UI (OAuth2 PKCE flow).
   * Redirects to Cognito login page.
   */
  signIn() {
    const { allowed } = authRateLimiter.check('signin');
    if (!allowed) {
      throw new AppError(
        ErrorTypes.RATE_LIMIT,
        'Too many sign-in attempts. Please wait.',
        { statusCode: 429, retryable: true }
      );
    }

    const codeVerifier = generateCodeVerifier();
    // Store verifier in sessionStorage temporarily for PKCE flow
    sessionStorage.setItem('pkce_verifier', codeVerifier);

    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();
    sessionStorage.setItem('oauth_state', state);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: COGNITO_CONFIG.clientId,
      redirect_uri: `${window.location.origin}/auth/callback`,
      scope: 'openid email profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });

    window.location.href = `https://${COGNITO_CONFIG.domain}/oauth2/authorize?${params}`;
  },

  /**
   * Handles the OAuth callback. Exchanges auth code for tokens.
   * @param {string} code - Authorization code from URL
   * @param {string} state - State parameter for CSRF check
   * @returns {Promise<object>} User profile
   */
  async handleCallback(code, state) {
    // Verify CSRF state
    const storedState = sessionStorage.getItem('oauth_state');
    sessionStorage.removeItem('oauth_state');

    if (!storedState || storedState !== state) {
      throw new AppError(
        ErrorTypes.AUTHENTICATION,
        'Invalid OAuth state - possible CSRF attack',
        { statusCode: 401 }
      );
    }

    const codeVerifier = sessionStorage.getItem('pkce_verifier');
    sessionStorage.removeItem('pkce_verifier');

    if (!codeVerifier) {
      throw new AppError(
        ErrorTypes.AUTHENTICATION,
        'Missing PKCE verifier',
        { statusCode: 401 }
      );
    }

    const response = await fetch(
      `https://${COGNITO_CONFIG.domain}/oauth2/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: COGNITO_CONFIG.clientId,
          code,
          redirect_uri: `${window.location.origin}/auth/callback`,
          code_verifier: codeVerifier,
        }),
      }
    );

    if (!response.ok) {
      throw new AppError(
        ErrorTypes.AUTHENTICATION,
        'Token exchange failed',
        { statusCode: 401 }
      );
    }

    const tokens = await response.json();
    this._storeTokens(tokens);
    this._startSessionTimer();

    return this._parseUserFromToken(tokens.id_token);
  },

  /**
   * Returns the current access token (from memory).
   * Automatically refreshes if near expiry.
   */
  async getAccessToken() {
    if (!_accessToken) return null;

    // Check if token needs refresh
    if (_tokenExpiry && Date.now() > _tokenExpiry - TOKEN_REFRESH_BUFFER_MS) {
      await this._refreshToken();
    }

    return _accessToken;
  },

  /**
   * Checks if the user is currently authenticated.
   */
  isAuthenticated() {
    return !!_accessToken && (!_tokenExpiry || Date.now() < _tokenExpiry);
  },

  /**
   * Signs out the user and clears ALL auth state.
   */
  async signOut() {
    this._clearTokens();

    // Clear session storage
    sessionStorage.clear();

    // Redirect to Cognito logout
    const params = new URLSearchParams({
      client_id: COGNITO_CONFIG.clientId,
      logout_uri: window.location.origin,
    });

    window.location.href = `https://${COGNITO_CONFIG.domain}/logout?${params}`;
  },

  /**
   * Updates the last activity timestamp (call on user interactions).
   */
  recordActivity() {
    _lastActivity = Date.now();
  },

  // ─── Private Methods ────────────────────────────────────────────────────────

  _storeTokens(tokens) {
    _accessToken = tokens.access_token;
    if (tokens.expires_in) {
      _tokenExpiry = Date.now() + tokens.expires_in * 1000;
    }
    // Refresh token is handled via httpOnly cookie by the server
    // We intentionally do NOT store refresh_token in JS
  },

  _clearTokens() {
    _accessToken = null;
    _tokenExpiry = null;
    if (_sessionTimer) {
      clearInterval(_sessionTimer);
      _sessionTimer = null;
    }
  },

  _startSessionTimer() {
    if (_sessionTimer) clearInterval(_sessionTimer);

    _sessionTimer = setInterval(() => {
      const idleTime = Date.now() - _lastActivity;
      if (idleTime >= SESSION_TIMEOUT_MS) {
        this._handleSessionTimeout();
      }
    }, 60 * 1000); // Check every minute
  },

  _handleSessionTimeout() {
    this._clearTokens();
    // Dispatch event so UI can show "session expired" message
    window.dispatchEvent(new CustomEvent('session:timeout'));
  },

  async _refreshToken() {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include', // Send httpOnly refresh token cookie
      });

      if (!response.ok) {
        this._clearTokens();
        return;
      }

      const tokens = await response.json();
      this._storeTokens(tokens);
    } catch {
      this._clearTokens();
    }
  },

  _parseUserFromToken(idToken) {
    try {
      // Parse JWT payload (not verification - server verifies)
      const [, payload] = idToken.split('.');
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      return {
        id: decoded.sub,
        email: decoded.email,
        name: decoded.name || decoded.email,
        role: decoded['custom:role'] || 'viewer',
        permissions: decoded['custom:permissions']
          ? JSON.parse(decoded['custom:permissions'])
          : [],
        mfaEnabled: decoded.amr?.includes('mfa') || false,
      };
    } catch {
      throw new AppError(
        ErrorTypes.AUTHENTICATION,
        'Failed to parse user token',
        { statusCode: 401 }
      );
    }
  },
};

// ─── PKCE Helpers ─────────────────────────────────────────────────────────────

function generateCodeVerifier() {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return btoa(String.fromCharCode(...buffer))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateState() {
  const buffer = new Uint8Array(16);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── API Client (Auth-aware) ──────────────────────────────────────────────────

/**
 * Makes an authenticated API request.
 * Automatically attaches Authorization header.
 * Handles 401 by clearing session and redirecting.
 */
export async function apiFetch(endpoint, options = {}) {
  const token = await authService.getAccessToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const baseUrl = import.meta.env.VITE_API_BASE_URL || '';
  const url = endpoint.startsWith('http') ? endpoint : `${baseUrl}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
    // Enforce timeout to prevent hanging requests
    signal: options.signal || AbortSignal.timeout(30000), // 30s timeout
  });

  if (response.status === 401) {
    authService._clearTokens();
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    throw new AppError(
      ErrorTypes.AUTHENTICATION,
      'Session expired',
      { statusCode: 401 }
    );
  }

  authService.recordActivity();
  return response;
}
