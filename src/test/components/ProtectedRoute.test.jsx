/**
 * Tests: ProtectedRoute Component
 *
 * Verifies authentication guards, session expiry notices,
 * RBAC permission enforcement, and redirect behavior.
 * Uses native Vitest assertions (no jest-dom dependency needed).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../../components/ProtectedRoute.jsx';
import { RESOURCES, ROLES } from '../../auth/rbac.js';

// ─── Mock AuthContext ──────────────────────────────────────────────────────────

const mockAuthState = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  sessionExpired: false,
  dismissSessionExpired: vi.fn(),
};

vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => mockAuthState,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setAuth(overrides) {
  Object.assign(mockAuthState, {
    isAuthenticated: false,
    isLoading: false,
    user: null,
    sessionExpired: false,
    dismissSessionExpired: vi.fn(),
    ...overrides,
  });
}

function makeUser(role, permissions = []) {
  return { id: `user-${role}`, email: `${role}@test.com`, role, permissions };
}

function renderProtected(props = {}) {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login Page</div>} />
        <Route
          path="*"
          element={
            <ProtectedRoute {...props}>
              <div data-testid="protected-content">Protected Content</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ProtectedRoute - Loading state', () => {
  beforeEach(() => setAuth({ isLoading: true }));

  it('shows loading indicator while auth is resolving', () => {
    renderProtected();
    expect(screen.getByText(/verifying authentication/i)).toBeTruthy();
  });

  it('does not render children while loading', () => {
    renderProtected();
    expect(screen.queryByTestId('protected-content')).toBeNull();
  });
});

describe('ProtectedRoute - Session expired', () => {
  beforeEach(() => setAuth({ sessionExpired: true, isAuthenticated: false }));

  it('shows session expired notice', () => {
    renderProtected();
    expect(screen.getByText(/session expired/i)).toBeTruthy();
  });

  it('shows sign in again button', () => {
    renderProtected();
    const btn = screen.getByRole('button', { name: /sign in again/i });
    expect(btn).toBeTruthy();
  });

  it('calls dismissSessionExpired when button is clicked', () => {
    const dismissFn = vi.fn();
    setAuth({ sessionExpired: true, dismissSessionExpired: dismissFn });
    renderProtected();
    fireEvent.click(screen.getByRole('button', { name: /sign in again/i }));
    expect(dismissFn).toHaveBeenCalledOnce();
  });

  it('does not show protected content', () => {
    renderProtected();
    expect(screen.queryByTestId('protected-content')).toBeNull();
  });
});

describe('ProtectedRoute - Unauthenticated user', () => {
  beforeEach(() => setAuth({ isAuthenticated: false, isLoading: false }));

  it('redirects to /login when not authenticated', () => {
    renderProtected();
    expect(screen.getByTestId('login-page')).toBeTruthy();
  });

  it('does not render protected content', () => {
    renderProtected();
    expect(screen.queryByTestId('protected-content')).toBeNull();
  });
});

describe('ProtectedRoute - Authenticated user with no permission check', () => {
  beforeEach(() => {
    setAuth({
      isAuthenticated: true,
      user: makeUser(ROLES.VIEWER),
    });
  });

  it('renders children when authenticated and no permission required', () => {
    renderProtected();
    expect(screen.getByTestId('protected-content')).toBeTruthy();
  });
});

describe('ProtectedRoute - Permission checks (requiredPermission)', () => {
  it('renders children when user has the required permission', () => {
    setAuth({
      isAuthenticated: true,
      user: makeUser(ROLES.AUDITOR),
    });
    renderProtected({ requiredPermission: RESOURCES.AUDIT_READ });
    expect(screen.getByTestId('protected-content')).toBeTruthy();
  });

  it('shows Access Denied when user lacks required permission', () => {
    setAuth({
      isAuthenticated: true,
      user: makeUser(ROLES.VIEWER),
    });
    renderProtected({ requiredPermission: RESOURCES.POLICY_CREATE });
    expect(screen.getByText(/access denied/i)).toBeTruthy();
  });

  it('does not show protected content when permission denied', () => {
    setAuth({
      isAuthenticated: true,
      user: makeUser(ROLES.VIEWER),
    });
    renderProtected({ requiredPermission: RESOURCES.POLICY_CREATE });
    expect(screen.queryByTestId('protected-content')).toBeNull();
  });

  it('shows "Required:" label in Access Denied message', () => {
    setAuth({
      isAuthenticated: true,
      user: makeUser(ROLES.VIEWER),
    });
    renderProtected({ requiredPermission: RESOURCES.AUDIT_EXPORT });
    // The component renders: Required: {permission}
    expect(screen.getByText(/required:/i)).toBeTruthy();
  });

  it('super_admin can access any protected route', () => {
    setAuth({
      isAuthenticated: true,
      user: makeUser(ROLES.SUPER_ADMIN),
    });
    renderProtected({ requiredPermission: RESOURCES.USER_MANAGE });
    expect(screen.getByTestId('protected-content')).toBeTruthy();
  });
});

describe('ProtectedRoute - anyOfPermissions checks', () => {
  it('renders children when user has any of the required permissions', () => {
    setAuth({
      isAuthenticated: true,
      user: makeUser(ROLES.AUDITOR),
    });
    renderProtected({
      anyOfPermissions: [RESOURCES.POLICY_CREATE, RESOURCES.AUDIT_READ],
    });
    expect(screen.getByTestId('protected-content')).toBeTruthy();
  });

  it('shows Access Denied when user has none of the required permissions', () => {
    setAuth({
      isAuthenticated: true,
      user: makeUser(ROLES.VIEWER),
    });
    renderProtected({
      anyOfPermissions: [RESOURCES.POLICY_CREATE, RESOURCES.AUDIT_EXPORT],
    });
    expect(screen.getByText(/access denied/i)).toBeTruthy();
  });
});

describe('ProtectedRoute - User-level permission overrides', () => {
  it('grants access via user-level permissions beyond role', () => {
    setAuth({
      isAuthenticated: true,
      user: makeUser(ROLES.VIEWER, [RESOURCES.AUDIT_EXPORT]), // Extra permission
    });
    renderProtected({ requiredPermission: RESOURCES.AUDIT_EXPORT });
    expect(screen.getByTestId('protected-content')).toBeTruthy();
  });
});
