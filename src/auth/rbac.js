/**
 * Role-Based Access Control (RBAC)
 *
 * Defines roles, permissions, and enforcement for the governance system.
 * Every user action is checked against this permission matrix before execution.
 */

// ─── Roles ────────────────────────────────────────────────────────────────────

export const ROLES = {
  SUPER_ADMIN: 'super_admin',       // Full system access + user management
  COMPLIANCE_OFFICER: 'compliance_officer', // All compliance + policy management
  AUDITOR: 'auditor',               // Read-only access to all agents + export audit logs
  POLICY_MANAGER: 'policy_manager', // Create/update policies (with approval)
  ANALYST: 'analyst',               // Read-only dashboard + chat with agents
  VIEWER: 'viewer',                 // Read-only dashboard only
};

// ─── Resources ────────────────────────────────────────────────────────────────

export const RESOURCES = {
  // Agent interactions
  AGENT_CHAT: 'agent:chat',
  AGENT_STATUS: 'agent:status',

  // Policy management
  POLICY_READ: 'policy:read',
  POLICY_CREATE: 'policy:create',
  POLICY_UPDATE: 'policy:update',
  POLICY_DELETE: 'policy:delete',
  POLICY_APPROVE: 'policy:approve',
  POLICY_ENABLE_DISABLE: 'policy:enable_disable',

  // Audit log
  AUDIT_READ: 'audit:read',
  AUDIT_EXPORT: 'audit:export',
  AUDIT_VERIFY: 'audit:verify',

  // Compliance
  COMPLIANCE_VIEW: 'compliance:view',
  COMPLIANCE_OVERRIDE: 'compliance:override',

  // Ethics
  ETHICS_VIEW: 'ethics:view',
  ETHICS_CONFIGURE: 'ethics:configure',

  // Privacy
  PRIVACY_VIEW: 'privacy:view',
  PRIVACY_CONFIGURE: 'privacy:configure',

  // System administration
  USER_MANAGE: 'user:manage',
  SYSTEM_CONFIG: 'system:config',
  ALERTS_MANAGE: 'alerts:manage',
  REPORTS_GENERATE: 'reports:generate',
};

// ─── Permission Matrix ─────────────────────────────────────────────────────────

const PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: Object.values(RESOURCES), // All permissions

  [ROLES.COMPLIANCE_OFFICER]: [
    RESOURCES.AGENT_CHAT,
    RESOURCES.AGENT_STATUS,
    RESOURCES.POLICY_READ,
    RESOURCES.POLICY_CREATE,
    RESOURCES.POLICY_UPDATE,
    RESOURCES.POLICY_APPROVE,
    RESOURCES.POLICY_ENABLE_DISABLE,
    RESOURCES.AUDIT_READ,
    RESOURCES.AUDIT_EXPORT,
    RESOURCES.AUDIT_VERIFY,
    RESOURCES.COMPLIANCE_VIEW,
    RESOURCES.COMPLIANCE_OVERRIDE,
    RESOURCES.ETHICS_VIEW,
    RESOURCES.ETHICS_CONFIGURE,
    RESOURCES.PRIVACY_VIEW,
    RESOURCES.PRIVACY_CONFIGURE,
    RESOURCES.ALERTS_MANAGE,
    RESOURCES.REPORTS_GENERATE,
  ],

  [ROLES.AUDITOR]: [
    RESOURCES.AGENT_STATUS,
    RESOURCES.AGENT_CHAT,
    RESOURCES.POLICY_READ,
    RESOURCES.AUDIT_READ,
    RESOURCES.AUDIT_EXPORT,
    RESOURCES.AUDIT_VERIFY,
    RESOURCES.COMPLIANCE_VIEW,
    RESOURCES.ETHICS_VIEW,
    RESOURCES.PRIVACY_VIEW,
    RESOURCES.REPORTS_GENERATE,
  ],

  [ROLES.POLICY_MANAGER]: [
    RESOURCES.AGENT_CHAT,
    RESOURCES.AGENT_STATUS,
    RESOURCES.POLICY_READ,
    RESOURCES.POLICY_CREATE,
    RESOURCES.POLICY_UPDATE,
    RESOURCES.POLICY_ENABLE_DISABLE,
    RESOURCES.AUDIT_READ,
    RESOURCES.COMPLIANCE_VIEW,
    RESOURCES.ETHICS_VIEW,
    RESOURCES.PRIVACY_VIEW,
    RESOURCES.REPORTS_GENERATE,
  ],

  [ROLES.ANALYST]: [
    RESOURCES.AGENT_CHAT,
    RESOURCES.AGENT_STATUS,
    RESOURCES.POLICY_READ,
    RESOURCES.AUDIT_READ,
    RESOURCES.COMPLIANCE_VIEW,
    RESOURCES.ETHICS_VIEW,
    RESOURCES.PRIVACY_VIEW,
  ],

  [ROLES.VIEWER]: [
    RESOURCES.AGENT_STATUS,
    RESOURCES.POLICY_READ,
    RESOURCES.COMPLIANCE_VIEW,
  ],
};

// ─── RBAC Enforcement ─────────────────────────────────────────────────────────

/**
 * Checks if a user has permission to perform an action on a resource.
 * @param {object} user - User object with { id, role, permissions }
 * @param {string} resource - One of RESOURCES values
 * @returns {boolean}
 */
export function hasPermission(user, resource) {
  if (!user || !user.role) return false;

  // Check role-based permissions
  const rolePermissions = PERMISSIONS[user.role] || [];
  if (rolePermissions.includes(resource)) return true;

  // Check user-level permission overrides (set by admin)
  if (Array.isArray(user.permissions) && user.permissions.includes(resource)) return true;

  return false;
}

/**
 * Checks if a user has ALL of the specified permissions.
 */
export function hasAllPermissions(user, resources) {
  return resources.every((resource) => hasPermission(user, resource));
}

/**
 * Checks if a user has ANY of the specified permissions.
 */
export function hasAnyPermission(user, resources) {
  return resources.some((resource) => hasPermission(user, resource));
}

/**
 * Asserts permission and throws if denied.
 * @throws {AuthorizationError}
 */
export function assertPermission(user, resource) {
  if (!hasPermission(user, resource)) {
    throw new AuthorizationError(
      `User ${user?.id || 'unknown'} lacks permission: ${resource}`
    );
  }
}

/**
 * Returns the full list of permissions for a role.
 */
export function getPermissionsForRole(role) {
  return PERMISSIONS[role] || [];
}

/**
 * Returns all roles that have a given permission.
 */
export function getRolesWithPermission(resource) {
  return Object.entries(PERMISSIONS)
    .filter(([, perms]) => perms.includes(resource))
    .map(([role]) => role);
}

/**
 * Checks if a policy action requires multi-user approval.
 * Policies that affect compliance or privacy always require approval
 * unless the user is a super_admin or compliance_officer.
 */
export function requiresApproval(user, action) {
  const approvalRequired = [
    RESOURCES.POLICY_CREATE,
    RESOURCES.POLICY_UPDATE,
    RESOURCES.POLICY_DELETE,
    RESOURCES.COMPLIANCE_OVERRIDE,
    RESOURCES.ETHICS_CONFIGURE,
    RESOURCES.PRIVACY_CONFIGURE,
  ];

  const bypassApprovalRoles = [ROLES.SUPER_ADMIN, ROLES.COMPLIANCE_OFFICER];

  return (
    approvalRequired.includes(action) &&
    !bypassApprovalRoles.includes(user?.role)
  );
}

// ─── Custom Error ─────────────────────────────────────────────────────────────

export class AuthorizationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthorizationError';
    this.statusCode = 403;
  }
}
