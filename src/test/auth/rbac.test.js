/**
 * Tests: Role-Based Access Control (RBAC)
 *
 * Verifies the permission matrix, enforcement functions,
 * and separation-of-duties rules are correctly implemented.
 */
import { describe, it, expect } from 'vitest';
import {
  ROLES,
  RESOURCES,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  assertPermission,
  getPermissionsForRole,
  getRolesWithPermission,
  requiresApproval,
  AuthorizationError,
} from '../../auth/rbac.js';

// ─── Test Fixtures ────────────────────────────────────────────────────────────

const makeUser = (role, extraPermissions = []) => ({
  id: `user-${role}`,
  email: `${role}@example.com`,
  role,
  permissions: extraPermissions,
});

// ─── hasPermission ────────────────────────────────────────────────────────────

describe('hasPermission', () => {
  it('returns false for null/undefined user', () => {
    expect(hasPermission(null, RESOURCES.AGENT_CHAT)).toBe(false);
    expect(hasPermission(undefined, RESOURCES.AGENT_CHAT)).toBe(false);
  });

  it('returns false for user with no role', () => {
    expect(hasPermission({ id: 'u1' }, RESOURCES.AGENT_CHAT)).toBe(false);
  });

  // ─── super_admin ───────────────────────────────────────────────────────────

  describe('super_admin', () => {
    const admin = makeUser(ROLES.SUPER_ADMIN);

    it('has ALL permissions', () => {
      Object.values(RESOURCES).forEach((resource) => {
        expect(hasPermission(admin, resource)).toBe(true);
      });
    });

    it('can delete policies', () => {
      expect(hasPermission(admin, RESOURCES.POLICY_DELETE)).toBe(true);
    });

    it('can manage users', () => {
      expect(hasPermission(admin, RESOURCES.USER_MANAGE)).toBe(true);
    });

    it('can configure system', () => {
      expect(hasPermission(admin, RESOURCES.SYSTEM_CONFIG)).toBe(true);
    });
  });

  // ─── compliance_officer ───────────────────────────────────────────────────

  describe('compliance_officer', () => {
    const co = makeUser(ROLES.COMPLIANCE_OFFICER);

    it('can chat with agents', () => {
      expect(hasPermission(co, RESOURCES.AGENT_CHAT)).toBe(true);
    });

    it('can create and approve policies', () => {
      expect(hasPermission(co, RESOURCES.POLICY_CREATE)).toBe(true);
      expect(hasPermission(co, RESOURCES.POLICY_APPROVE)).toBe(true);
    });

    it('can read, export, and verify audit logs', () => {
      expect(hasPermission(co, RESOURCES.AUDIT_READ)).toBe(true);
      expect(hasPermission(co, RESOURCES.AUDIT_EXPORT)).toBe(true);
      expect(hasPermission(co, RESOURCES.AUDIT_VERIFY)).toBe(true);
    });

    it('can override compliance', () => {
      expect(hasPermission(co, RESOURCES.COMPLIANCE_OVERRIDE)).toBe(true);
    });

    it('CANNOT manage users (that is super_admin only)', () => {
      expect(hasPermission(co, RESOURCES.USER_MANAGE)).toBe(false);
    });

    it('CANNOT configure system', () => {
      expect(hasPermission(co, RESOURCES.SYSTEM_CONFIG)).toBe(false);
    });

    it('CANNOT delete policies', () => {
      expect(hasPermission(co, RESOURCES.POLICY_DELETE)).toBe(false);
    });
  });

  // ─── auditor ──────────────────────────────────────────────────────────────

  describe('auditor', () => {
    const auditor = makeUser(ROLES.AUDITOR);

    it('can read audit logs and export them', () => {
      expect(hasPermission(auditor, RESOURCES.AUDIT_READ)).toBe(true);
      expect(hasPermission(auditor, RESOURCES.AUDIT_EXPORT)).toBe(true);
      expect(hasPermission(auditor, RESOURCES.AUDIT_VERIFY)).toBe(true);
    });

    it('can view agent status', () => {
      expect(hasPermission(auditor, RESOURCES.AGENT_STATUS)).toBe(true);
    });

    it('CANNOT create policies', () => {
      expect(hasPermission(auditor, RESOURCES.POLICY_CREATE)).toBe(false);
    });

    it('CANNOT approve policies', () => {
      expect(hasPermission(auditor, RESOURCES.POLICY_APPROVE)).toBe(false);
    });

    it('CANNOT override compliance', () => {
      expect(hasPermission(auditor, RESOURCES.COMPLIANCE_OVERRIDE)).toBe(false);
    });
  });

  // ─── policy_manager ───────────────────────────────────────────────────────

  describe('policy_manager', () => {
    const pm = makeUser(ROLES.POLICY_MANAGER);

    it('can create and update policies', () => {
      expect(hasPermission(pm, RESOURCES.POLICY_CREATE)).toBe(true);
      expect(hasPermission(pm, RESOURCES.POLICY_UPDATE)).toBe(true);
    });

    it('CANNOT approve own policies (no approve permission)', () => {
      expect(hasPermission(pm, RESOURCES.POLICY_APPROVE)).toBe(false);
    });

    it('CANNOT export audit logs', () => {
      expect(hasPermission(pm, RESOURCES.AUDIT_EXPORT)).toBe(false);
    });

    it('CANNOT override compliance', () => {
      expect(hasPermission(pm, RESOURCES.COMPLIANCE_OVERRIDE)).toBe(false);
    });
  });

  // ─── analyst ──────────────────────────────────────────────────────────────

  describe('analyst', () => {
    const analyst = makeUser(ROLES.ANALYST);

    it('can read policies and audit logs', () => {
      expect(hasPermission(analyst, RESOURCES.POLICY_READ)).toBe(true);
      expect(hasPermission(analyst, RESOURCES.AUDIT_READ)).toBe(true);
    });

    it('can chat with agents', () => {
      expect(hasPermission(analyst, RESOURCES.AGENT_CHAT)).toBe(true);
    });

    it('CANNOT create policies', () => {
      expect(hasPermission(analyst, RESOURCES.POLICY_CREATE)).toBe(false);
    });

    it('CANNOT export audit logs', () => {
      expect(hasPermission(analyst, RESOURCES.AUDIT_EXPORT)).toBe(false);
    });
  });

  // ─── viewer ───────────────────────────────────────────────────────────────

  describe('viewer', () => {
    const viewer = makeUser(ROLES.VIEWER);

    it('can view agent status and compliance', () => {
      expect(hasPermission(viewer, RESOURCES.AGENT_STATUS)).toBe(true);
      expect(hasPermission(viewer, RESOURCES.COMPLIANCE_VIEW)).toBe(true);
    });

    it('can read policies', () => {
      expect(hasPermission(viewer, RESOURCES.POLICY_READ)).toBe(true);
    });

    it('CANNOT chat with agents', () => {
      expect(hasPermission(viewer, RESOURCES.AGENT_CHAT)).toBe(false);
    });

    it('CANNOT read audit logs', () => {
      expect(hasPermission(viewer, RESOURCES.AUDIT_READ)).toBe(false);
    });

    it('CANNOT create, update, or approve policies', () => {
      expect(hasPermission(viewer, RESOURCES.POLICY_CREATE)).toBe(false);
      expect(hasPermission(viewer, RESOURCES.POLICY_UPDATE)).toBe(false);
      expect(hasPermission(viewer, RESOURCES.POLICY_APPROVE)).toBe(false);
    });
  });

  // ─── User-level permission overrides ──────────────────────────────────────

  describe('user-level permission overrides', () => {
    it('grants extra permissions beyond the role', () => {
      const viewer = makeUser(ROLES.VIEWER, [RESOURCES.AUDIT_READ]);
      expect(hasPermission(viewer, RESOURCES.AUDIT_READ)).toBe(true);
    });

    it('does not grant permissions not in the override list', () => {
      const viewer = makeUser(ROLES.VIEWER, [RESOURCES.AUDIT_READ]);
      expect(hasPermission(viewer, RESOURCES.AUDIT_EXPORT)).toBe(false);
    });
  });
});

// ─── hasAllPermissions ────────────────────────────────────────────────────────

describe('hasAllPermissions', () => {
  it('returns true when user has all specified permissions', () => {
    const auditor = makeUser(ROLES.AUDITOR);
    expect(hasAllPermissions(auditor, [
      RESOURCES.AUDIT_READ,
      RESOURCES.AUDIT_EXPORT,
      RESOURCES.POLICY_READ,
    ])).toBe(true);
  });

  it('returns false when user is missing any permission', () => {
    const auditor = makeUser(ROLES.AUDITOR);
    expect(hasAllPermissions(auditor, [
      RESOURCES.AUDIT_READ,
      RESOURCES.POLICY_CREATE, // auditor does NOT have this
    ])).toBe(false);
  });

  it('returns true for empty array', () => {
    const viewer = makeUser(ROLES.VIEWER);
    expect(hasAllPermissions(viewer, [])).toBe(true);
  });
});

// ─── hasAnyPermission ────────────────────────────────────────────────────────

describe('hasAnyPermission', () => {
  it('returns true when user has at least one permission', () => {
    const viewer = makeUser(ROLES.VIEWER);
    expect(hasAnyPermission(viewer, [
      RESOURCES.POLICY_CREATE, // viewer does not have
      RESOURCES.POLICY_READ,   // viewer has this
    ])).toBe(true);
  });

  it('returns false when user has none of the permissions', () => {
    const viewer = makeUser(ROLES.VIEWER);
    expect(hasAnyPermission(viewer, [
      RESOURCES.POLICY_CREATE,
      RESOURCES.AUDIT_EXPORT,
      RESOURCES.USER_MANAGE,
    ])).toBe(false);
  });

  it('returns false for empty array', () => {
    const admin = makeUser(ROLES.SUPER_ADMIN);
    expect(hasAnyPermission(admin, [])).toBe(false);
  });
});

// ─── assertPermission ────────────────────────────────────────────────────────

describe('assertPermission', () => {
  it('does not throw when user has permission', () => {
    const auditor = makeUser(ROLES.AUDITOR);
    expect(() => assertPermission(auditor, RESOURCES.AUDIT_READ)).not.toThrow();
  });

  it('throws AuthorizationError when user lacks permission', () => {
    const viewer = makeUser(ROLES.VIEWER);
    expect(() => assertPermission(viewer, RESOURCES.POLICY_CREATE)).toThrow(AuthorizationError);
  });

  it('AuthorizationError includes the user ID in the message', () => {
    const viewer = makeUser(ROLES.VIEWER);
    try {
      assertPermission(viewer, RESOURCES.POLICY_DELETE);
    } catch (err) {
      expect(err.message).toContain('viewer');
      expect(err.message).toContain(RESOURCES.POLICY_DELETE);
    }
  });

  it('AuthorizationError has statusCode 403', () => {
    const viewer = makeUser(ROLES.VIEWER);
    try {
      assertPermission(viewer, RESOURCES.SYSTEM_CONFIG);
    } catch (err) {
      expect(err.statusCode).toBe(403);
    }
  });
});

// ─── getPermissionsForRole ────────────────────────────────────────────────────

describe('getPermissionsForRole', () => {
  it('returns permissions array for valid roles', () => {
    expect(Array.isArray(getPermissionsForRole(ROLES.AUDITOR))).toBe(true);
    expect(getPermissionsForRole(ROLES.AUDITOR).length).toBeGreaterThan(0);
  });

  it('returns empty array for unknown roles', () => {
    expect(getPermissionsForRole('unknown_role')).toEqual([]);
  });

  it('super_admin has all resources', () => {
    const adminPerms = getPermissionsForRole(ROLES.SUPER_ADMIN);
    Object.values(RESOURCES).forEach((resource) => {
      expect(adminPerms).toContain(resource);
    });
  });
});

// ─── getRolesWithPermission ───────────────────────────────────────────────────

describe('getRolesWithPermission', () => {
  it('returns roles that have a given permission', () => {
    const roles = getRolesWithPermission(RESOURCES.AUDIT_EXPORT);
    expect(roles).toContain(ROLES.SUPER_ADMIN);
    expect(roles).toContain(ROLES.COMPLIANCE_OFFICER);
    expect(roles).toContain(ROLES.AUDITOR);
    expect(roles).not.toContain(ROLES.VIEWER);
    expect(roles).not.toContain(ROLES.ANALYST);
  });

  it('returns all roles for permissions only super_admin has', () => {
    const roles = getRolesWithPermission(RESOURCES.USER_MANAGE);
    expect(roles).toContain(ROLES.SUPER_ADMIN);
    expect(roles).not.toContain(ROLES.COMPLIANCE_OFFICER);
    expect(roles).not.toContain(ROLES.AUDITOR);
  });

  it('returns empty array for a resource no role has', () => {
    const roles = getRolesWithPermission('nonexistent:resource');
    expect(roles).toEqual([]);
  });
});

// ─── requiresApproval ────────────────────────────────────────────────────────

describe('requiresApproval (separation of duties)', () => {
  it('policy_manager creating a policy requires approval', () => {
    const pm = makeUser(ROLES.POLICY_MANAGER);
    expect(requiresApproval(pm, RESOURCES.POLICY_CREATE)).toBe(true);
  });

  it('policy_manager updating a policy requires approval', () => {
    const pm = makeUser(ROLES.POLICY_MANAGER);
    expect(requiresApproval(pm, RESOURCES.POLICY_UPDATE)).toBe(true);
  });

  it('policy_manager deleting a policy requires approval', () => {
    const pm = makeUser(ROLES.POLICY_MANAGER);
    expect(requiresApproval(pm, RESOURCES.POLICY_DELETE)).toBe(true);
  });

  it('compliance_officer does NOT require approval (can approve own changes)', () => {
    const co = makeUser(ROLES.COMPLIANCE_OFFICER);
    expect(requiresApproval(co, RESOURCES.POLICY_CREATE)).toBe(false);
    expect(requiresApproval(co, RESOURCES.POLICY_UPDATE)).toBe(false);
  });

  it('super_admin does NOT require approval', () => {
    const admin = makeUser(ROLES.SUPER_ADMIN);
    expect(requiresApproval(admin, RESOURCES.POLICY_CREATE)).toBe(false);
    expect(requiresApproval(admin, RESOURCES.COMPLIANCE_OVERRIDE)).toBe(false);
  });

  it('analyst does not require approval for non-approval actions', () => {
    const analyst = makeUser(ROLES.ANALYST);
    expect(requiresApproval(analyst, RESOURCES.AUDIT_READ)).toBe(false);
  });

  it('ethics configuration requires approval for policy_manager', () => {
    const pm = makeUser(ROLES.POLICY_MANAGER);
    expect(requiresApproval(pm, RESOURCES.ETHICS_CONFIGURE)).toBe(true);
  });

  it('privacy configuration requires approval for analyst', () => {
    const analyst = makeUser(ROLES.ANALYST);
    expect(requiresApproval(analyst, RESOURCES.PRIVACY_CONFIGURE)).toBe(true);
  });

  it('handles null user without throwing', () => {
    expect(requiresApproval(null, RESOURCES.POLICY_CREATE)).toBe(true);
  });
});

// ─── AuthorizationError class ─────────────────────────────────────────────────

describe('AuthorizationError', () => {
  it('has correct name and statusCode', () => {
    const err = new AuthorizationError('Not allowed');
    expect(err.name).toBe('AuthorizationError');
    expect(err.statusCode).toBe(403);
    expect(err.message).toBe('Not allowed');
  });

  it('is an instance of Error', () => {
    const err = new AuthorizationError('Denied');
    expect(err instanceof Error).toBe(true);
    expect(err instanceof AuthorizationError).toBe(true);
  });
});
