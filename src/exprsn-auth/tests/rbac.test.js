/**
 * RBAC Tests
 * Tests for Role-Based Access Control including permissions, roles, ownership, and membership
 */

const rbacService = require('../src/services/rbacService');
const {
  requirePermission,
  requireRole,
  requireOwnership,
  requireOrganizationMember,
  requireGroupMember,
  requireAdmin,
  requireSuperAdmin,
  anyOf,
  allOf,
  loadUserPermissions,
  loadUserRoles
} = require('../src/middleware/rbac');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser,
  createTestRole,
  createTestPermission,
  createTestOrganization,
  getModels
} = require('./helpers/testDatabase');
const { AppError } = require('@exprsn/shared');

describe('RBAC Service', () => {
  let models;

  beforeAll(async () => {
    const db = await setupTestDatabase();
    models = db.models;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  describe('Permission Checking', () => {
    test('should check if user has permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'editor',
        permissions: ['content:read', 'content:write']
      });

      await user.addRole(role);

      const result = await rbacService.checkPermission(user.id, 'content:read');
      expect(result.allowed).toBe(true);
      expect(result.role).toBe('editor');
    });

    test('should deny permission if user does not have it', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'viewer',
        permissions: ['content:read']
      });

      await user.addRole(role);

      const result = await rbacService.checkPermission(user.id, 'content:delete');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('No matching permission');
    });

    test('should support wildcard permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'admin',
        permissions: ['*']
      });

      await user.addRole(role);

      const result = await rbacService.checkPermission(user.id, 'any:permission:here');
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('Wildcard');
    });

    test('should support pattern matching permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'content-manager',
        permissions: ['content:*']
      });

      await user.addRole(role);

      const readResult = await rbacService.checkPermission(user.id, 'content:read');
      expect(readResult.allowed).toBe(true);

      const writeResult = await rbacService.checkPermission(user.id, 'content:write');
      expect(writeResult.allowed).toBe(true);

      const otherResult = await rbacService.checkPermission(user.id, 'other:read');
      expect(otherResult.allowed).toBe(false);
    });

    test('should check organization-scoped permissions', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      const role = await createTestRole({
        name: 'org-admin',
        permissions: ['org:admin']
      });

      // Create org-scoped role assignment
      await models.UserRole.create({
        userId: user.id,
        roleId: role.id,
        scope: 'organization',
        organizationId: org.id,
        status: 'active'
      });

      const result = await rbacService.checkPermission(
        user.id,
        'org:admin',
        { organizationId: org.id }
      );

      expect(result.allowed).toBe(true);
    });

    test('should check application-scoped permissions', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      const role = await createTestRole({
        name: 'app-user',
        permissions: ['app:use']
      });

      const appId = 'test-app-id';

      await models.UserRole.create({
        userId: user.id,
        roleId: role.id,
        scope: 'application',
        organizationId: org.id,
        applicationId: appId,
        status: 'active'
      });

      const result = await rbacService.checkPermission(
        user.id,
        'app:use',
        { organizationId: org.id, applicationId: appId }
      );

      expect(result.allowed).toBe(true);
    });

    test('should inherit permissions from group roles', async () => {
      const user = await createTestUser();
      const group = await models.Group.create({
        name: 'Editors',
        description: 'Content editors group'
      });
      const role = await createTestRole({
        name: 'editor',
        permissions: ['content:edit']
      });

      await user.addGroup(group);
      await group.addRole(role);

      const result = await rbacService.checkPermission(user.id, 'content:edit');
      expect(result.allowed).toBe(true);
    });
  });

  describe('Role Checking', () => {
    test('should check if user has role', async () => {
      const user = await createTestUser();
      const role = await createTestRole({ name: 'admin' });

      await user.addRole(role);

      const roles = await rbacService.getUserPermissions(user.id);
      expect(roles.roles).toContainEqual(
        expect.objectContaining({ slug: 'admin', source: 'user' })
      );
    });

    test('should check organization-scoped roles', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      const role = await createTestRole({ name: 'org-manager' });

      await models.UserRole.create({
        userId: user.id,
        roleId: role.id,
        scope: 'organization',
        organizationId: org.id,
        status: 'active'
      });

      const permissions = await rbacService.getUserPermissions(
        user.id,
        { organizationId: org.id }
      );

      expect(permissions.roles).toContainEqual(
        expect.objectContaining({ slug: 'org-manager' })
      );
    });

    test('should check application-scoped roles', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      const role = await createTestRole({ name: 'app-admin' });
      const appId = 'test-app-id';

      await models.UserRole.create({
        userId: user.id,
        roleId: role.id,
        scope: 'application',
        organizationId: org.id,
        applicationId: appId,
        status: 'active'
      });

      const permissions = await rbacService.getUserPermissions(
        user.id,
        { organizationId: org.id, applicationId: appId }
      );

      expect(permissions.roles).toContainEqual(
        expect.objectContaining({ slug: 'app-admin' })
      );
    });
  });

  describe('Service Access', () => {
    test('should check service access permissions', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'service-user',
        permissions: ['service:timeline:access'],
        serviceAccess: {
          allowedServices: ['timeline'],
          deniedServices: []
        }
      });

      await user.addRole(role);

      const result = await rbacService.checkServiceAccess(user.id, 'timeline');
      expect(result.allowed).toBe(true);
    });

    test('should deny access to services not in allowed list', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'limited-user',
        permissions: [],
        serviceAccess: {
          allowedServices: ['timeline'],
          deniedServices: []
        }
      });

      await user.addRole(role);

      const result = await rbacService.checkServiceAccess(user.id, 'nexus');
      expect(result.allowed).toBe(false);
    });

    test('should deny access to explicitly denied services', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'restricted-user',
        permissions: ['*'],
        serviceAccess: {
          allowedServices: [],
          deniedServices: ['admin']
        }
      });

      await user.addRole(role);

      const result = await rbacService.checkServiceAccess(user.id, 'admin');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('denied');
    });
  });

  describe('Role Assignment', () => {
    test('should assign role to user', async () => {
      const user = await createTestUser();
      const role = await createTestRole({ name: 'moderator' });

      const assignment = await rbacService.assignRoleToUser(user.id, role.id);

      expect(assignment).toBeTruthy();
      expect(assignment.userId).toBe(user.id);
      expect(assignment.roleId).toBe(role.id);
      expect(assignment.status).toBe('active');
    });

    test('should assign role with organization scope', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      const role = await createTestRole({ name: 'org-member' });

      const assignment = await rbacService.assignRoleToUser(
        user.id,
        role.id,
        { organizationId: org.id }
      );

      expect(assignment.scope).toBe('organization');
      expect(assignment.organizationId).toBe(org.id);
    });

    test('should assign role with expiration', async () => {
      const user = await createTestUser();
      const role = await createTestRole({ name: 'temp-role' });
      const expiresAt = new Date(Date.now() + 86400000); // 24 hours

      const assignment = await rbacService.assignRoleToUser(
        user.id,
        role.id,
        { expiresAt }
      );

      expect(assignment.expiresAt).toBeTruthy();
    });

    test('should revoke role from user', async () => {
      const user = await createTestUser();
      const role = await createTestRole({ name: 'editor' });

      await rbacService.assignRoleToUser(user.id, role.id);
      const revoked = await rbacService.revokeRoleFromUser(user.id, role.id);

      expect(revoked.status).toBe('revoked');
    });

    test('should assign role to group', async () => {
      const group = await models.Group.create({
        name: 'Test Group',
        description: 'Test'
      });
      const role = await createTestRole({ name: 'group-role' });

      const assignment = await rbacService.assignRoleToGroup(group.id, role.id);

      expect(assignment).toBeTruthy();
      expect(assignment.groupId).toBe(group.id);
      expect(assignment.roleId).toBe(role.id);
    });

    test('should revoke role from group', async () => {
      const group = await models.Group.create({
        name: 'Test Group',
        description: 'Test'
      });
      const role = await createTestRole({ name: 'group-role' });

      await rbacService.assignRoleToGroup(group.id, role.id);
      const revoked = await rbacService.revokeRoleFromGroup(group.id, role.id);

      expect(revoked.status).toBe('revoked');
    });
  });

  describe('Get User Permissions', () => {
    test('should get all permissions for user', async () => {
      const user = await createTestUser();
      const role1 = await createTestRole({
        name: 'role1',
        permissions: ['perm1', 'perm2']
      });
      const role2 = await createTestRole({
        name: 'role2',
        permissions: ['perm2', 'perm3']
      });

      await user.addRole(role1);
      await user.addRole(role2);

      const result = await rbacService.getUserPermissions(user.id);

      expect(result.permissions).toContain('perm1');
      expect(result.permissions).toContain('perm2');
      expect(result.permissions).toContain('perm3');
      expect(result.roles).toHaveLength(2);
    });

    test('should include permissions from group roles', async () => {
      const user = await createTestUser();
      const group = await models.Group.create({
        name: 'Admins',
        description: 'Admin group'
      });
      const role = await createTestRole({
        name: 'group-admin',
        permissions: ['admin:access']
      });

      await user.addGroup(group);
      await group.addRole(role);

      const result = await rbacService.getUserPermissions(user.id);

      expect(result.permissions).toContain('admin:access');
      expect(result.roles.some(r => r.source.includes('group'))).toBe(true);
    });
  });
});

describe('RBAC Middleware', () => {
  let models;

  beforeAll(async () => {
    const db = await setupTestDatabase();
    models = db.models;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  describe('requirePermission', () => {
    test('should allow access if user has permission', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'editor',
        permissions: ['content:write']
      });
      await user.addRole(role);

      const req = { user: { id: user.id } };
      const res = {};
      const next = jest.fn();

      const middleware = requirePermission('content:write');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('should deny access if user lacks permission', async () => {
      const user = await createTestUser();

      const req = { user: { id: user.id } };
      const res = {};
      const next = jest.fn();

      const middleware = requirePermission('content:write');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('FORBIDDEN');
    });

    test('should check multiple permissions with any logic', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'editor',
        permissions: ['content:read']
      });
      await user.addRole(role);

      const req = { user: { id: user.id } };
      const res = {};
      const next = jest.fn();

      const middleware = requirePermission(['content:read', 'content:write'], {
        requireAll: false
      });
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('should check multiple permissions with all logic', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'editor',
        permissions: ['content:read']
      });
      await user.addRole(role);

      const req = { user: { id: user.id } };
      const res = {};
      const next = jest.fn();

      const middleware = requirePermission(['content:read', 'content:write'], {
        requireAll: true
      });
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });

  describe('requireRole', () => {
    test('should allow access if user has role', async () => {
      const user = await createTestUser();
      const role = await createTestRole({ name: 'admin' });
      await user.addRole(role);

      const req = { user: { id: user.id } };
      const res = {};
      const next = jest.fn();

      const middleware = requireRole('admin');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('should deny access if user lacks role', async () => {
      const user = await createTestUser();

      const req = { user: { id: user.id } };
      const res = {};
      const next = jest.fn();

      const middleware = requireRole('admin');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
    });
  });

  describe('requireOwnership', () => {
    test('should allow access if user owns resource', async () => {
      const user = await createTestUser();

      const req = {
        user: { id: user.id },
        params: { resourceId: 'test-resource' }
      };
      const res = {};
      const next = jest.fn();

      const getOwner = async (req) => req.user.id;
      const middleware = requireOwnership(getOwner);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('should deny access if user does not own resource', async () => {
      const user = await createTestUser();
      const otherUserId = 'other-user-id';

      const req = {
        user: { id: user.id },
        params: { resourceId: 'test-resource' }
      };
      const res = {};
      const next = jest.fn();

      const getOwner = async (req) => otherUserId;
      const middleware = requireOwnership(getOwner);
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('FORBIDDEN');
    });
  });

  describe('requireOrganizationMember', () => {
    test('should allow access if user is organization member', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();

      await models.OrganizationMember.create({
        userId: user.id,
        organizationId: org.id,
        role: 'member'
      });

      const req = {
        user: { id: user.id },
        params: { organizationId: org.id }
      };
      const res = {};
      const next = jest.fn();

      const middleware = requireOrganizationMember();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('should deny access if user is not organization member', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();

      const req = {
        user: { id: user.id },
        params: { organizationId: org.id }
      };
      const res = {};
      const next = jest.fn();

      const middleware = requireOrganizationMember();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('NOT_ORGANIZATION_MEMBER');
    });
  });

  describe('requireGroupMember', () => {
    test('should allow access if user is group member', async () => {
      const user = await createTestUser();
      const group = await models.Group.create({
        name: 'Test Group',
        description: 'Test'
      });

      await user.addGroup(group);

      const req = {
        user: { id: user.id },
        params: { groupId: group.id }
      };
      const res = {};
      const next = jest.fn();

      const middleware = requireGroupMember();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('should deny access if user is not group member', async () => {
      const user = await createTestUser();
      const group = await models.Group.create({
        name: 'Test Group',
        description: 'Test'
      });

      const req = {
        user: { id: user.id },
        params: { groupId: group.id }
      };
      const res = {};
      const next = jest.fn();

      const middleware = requireGroupMember();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(AppError));
      const error = next.mock.calls[0][0];
      expect(error.code).toBe('NOT_GROUP_MEMBER');
    });
  });

  describe('anyOf', () => {
    test('should allow if any middleware passes', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'editor',
        permissions: ['content:read']
      });
      await user.addRole(role);

      const req = { user: { id: user.id } };
      const res = {};
      const next = jest.fn();

      const middleware = anyOf(
        requirePermission('content:write'), // Will fail
        requirePermission('content:read')   // Will pass
      );
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('should deny if all middlewares fail', async () => {
      const user = await createTestUser();

      const req = { user: { id: user.id } };
      const res = {};
      const next = jest.fn();

      const middleware = anyOf(
        requirePermission('content:write'),
        requirePermission('content:delete')
      );
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('allOf', () => {
    test('should allow if all middlewares pass', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'admin',
        permissions: ['content:read', 'content:write']
      });
      await user.addRole(role);

      const req = { user: { id: user.id } };
      const res = {};
      const next = jest.fn();

      const middleware = allOf(
        requirePermission('content:read'),
        requirePermission('content:write')
      );
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });

    test('should deny if any middleware fails', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'editor',
        permissions: ['content:read']
      });
      await user.addRole(role);

      const req = { user: { id: user.id } };
      const res = {};
      const next = jest.fn();

      const middleware = allOf(
        requirePermission('content:read'),  // Will pass
        requirePermission('content:write')  // Will fail
      );
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('loadUserPermissions', () => {
    test('should load user permissions into request', async () => {
      const user = await createTestUser();
      const role = await createTestRole({
        name: 'editor',
        permissions: ['content:read', 'content:write']
      });
      await user.addRole(role);

      const req = { user: { id: user.id } };
      const res = {};
      const next = jest.fn();

      const middleware = loadUserPermissions();
      await middleware(req, res, next);

      expect(req.userPermissions).toBeTruthy();
      expect(req.userPermissions.permissions).toContain('content:read');
      expect(req.userPermissions.permissions).toContain('content:write');
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('loadUserRoles', () => {
    test('should load user roles into request', async () => {
      const user = await createTestUser();
      const role = await createTestRole({ name: 'admin' });
      await user.addRole(role);

      const req = { user: { id: user.id } };
      const res = {};
      const next = jest.fn();

      const middleware = loadUserRoles();
      await middleware(req, res, next);

      expect(req.userRoles).toBeTruthy();
      expect(req.userRoles.roles).toContainEqual(
        expect.objectContaining({ slug: 'admin' })
      );
      expect(next).toHaveBeenCalledWith();
    });
  });
});
