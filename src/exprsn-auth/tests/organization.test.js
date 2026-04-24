/**
 * Organization Tests
 * Tests for organization management, membership, and permissions
 */

const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const organizationService = require('../src/services/organizationService');
const rbacService = require('../src/services/rbacService');
const {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser,
  createTestOrganization,
  createTestRole,
  getModels
} = require('./helpers/testDatabase');

describe('Organizations', () => {
  let models;
  let agent;

  beforeAll(async () => {
    const db = await setupTestDatabase();
    models = db.models;
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    jest.clearAllMocks();
    agent = request.agent(app);
  });

  describe('Organization Creation', () => {
    test('should create organization', async () => {
      const user = await createTestUser({
        email: 'creator@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'creator@example.com', password: 'Test123!@#' });

      const orgData = {
        name: 'Test Organization',
        slug: 'test-org',
        description: 'A test organization'
      };

      const response = await agent
        .post('/api/organizations')
        .send(orgData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.organization).toHaveProperty('id');
      expect(response.body.organization.name).toBe(orgData.name);
      expect(response.body.organization.slug).toBe(orgData.slug);

      // Verify in database
      const org = await models.Organization.findOne({
        where: { slug: orgData.slug }
      });
      expect(org).toBeTruthy();
    });

    test('should set creator as owner', async () => {
      const user = await createTestUser({
        email: 'owner@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'owner@example.com', password: 'Test123!@#' });

      const response = await agent
        .post('/api/organizations')
        .send({
          name: 'Owner Test Org',
          slug: 'owner-test-org'
        })
        .expect(201);

      const org = await models.Organization.findByPk(
        response.body.organization.id
      );

      expect(org.ownerId).toBe(user.id);
    });

    test('should validate organization data', async () => {
      const user = await createTestUser({
        email: 'validate@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'validate@example.com', password: 'Test123!@#' });

      // Missing required fields
      const response = await agent
        .post('/api/organizations')
        .send({
          description: 'No name or slug'
        })
        .expect(400);

      expect(response.body.error).toBeTruthy();
    });

    test('should reject duplicate slug', async () => {
      const user = await createTestUser({
        email: 'duplicate@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'duplicate@example.com', password: 'Test123!@#' });

      // Create first org
      await agent
        .post('/api/organizations')
        .send({
          name: 'First Org',
          slug: 'same-slug'
        })
        .expect(201);

      // Try to create second org with same slug
      const response = await agent
        .post('/api/organizations')
        .send({
          name: 'Second Org',
          slug: 'same-slug'
        })
        .expect(409);

      expect(response.body.error).toContain('exists');
    });
  });

  describe('Organization Membership', () => {
    test('should add member to organization', async () => {
      const owner = await createTestUser({
        email: 'owner@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const member = await createTestUser({
        email: 'member@example.com'
      });

      const org = await createTestOrganization({
        name: 'Member Test Org',
        ownerId: owner.id
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'owner@example.com', password: 'Test123!@#' });

      const response = await agent
        .post(`/api/organizations/${org.id}/members`)
        .send({
          userId: member.id,
          role: 'member'
        })
        .expect(201);

      expect(response.body.success).toBe(true);

      // Verify membership
      const membership = await models.OrganizationMember.findOne({
        where: {
          organizationId: org.id,
          userId: member.id
        }
      });
      expect(membership).toBeTruthy();
    });

    test('should remove member from organization', async () => {
      const owner = await createTestUser({
        email: 'owner@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const member = await createTestUser({
        email: 'member@example.com'
      });

      const org = await createTestOrganization({
        ownerId: owner.id
      });

      // Add member
      await models.OrganizationMember.create({
        organizationId: org.id,
        userId: member.id,
        role: 'member'
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'owner@example.com', password: 'Test123!@#' });

      const response = await agent
        .delete(`/api/organizations/${org.id}/members/${member.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify membership removed
      const membership = await models.OrganizationMember.findOne({
        where: {
          organizationId: org.id,
          userId: member.id
        }
      });
      expect(membership).toBeNull();
    });

    test('should update member role', async () => {
      const owner = await createTestUser({
        email: 'owner@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const member = await createTestUser({
        email: 'member@example.com'
      });

      const org = await createTestOrganization({
        ownerId: owner.id
      });

      await models.OrganizationMember.create({
        organizationId: org.id,
        userId: member.id,
        role: 'member'
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'owner@example.com', password: 'Test123!@#' });

      const response = await agent
        .patch(`/api/organizations/${org.id}/members/${member.id}`)
        .send({ role: 'admin' })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify role updated
      const membership = await models.OrganizationMember.findOne({
        where: {
          organizationId: org.id,
          userId: member.id
        }
      });
      expect(membership.role).toBe('admin');
    });

    test('should list organization members', async () => {
      const owner = await createTestUser({
        email: 'owner@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const member1 = await createTestUser({ email: 'member1@example.com' });
      const member2 = await createTestUser({ email: 'member2@example.com' });

      const org = await createTestOrganization({
        ownerId: owner.id
      });

      await models.OrganizationMember.create({
        organizationId: org.id,
        userId: member1.id,
        role: 'member'
      });

      await models.OrganizationMember.create({
        organizationId: org.id,
        userId: member2.id,
        role: 'admin'
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'owner@example.com', password: 'Test123!@#' });

      const response = await agent
        .get(`/api/organizations/${org.id}/members`)
        .expect(200);

      expect(response.body.members).toHaveLength(2);
      expect(response.body.members.some(m => m.userId === member1.id)).toBe(true);
      expect(response.body.members.some(m => m.userId === member2.id)).toBe(true);
    });

    test('should prevent non-members from viewing members', async () => {
      const owner = await createTestUser({
        email: 'owner@example.com'
      });

      const nonMember = await createTestUser({
        email: 'nonmember@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const org = await createTestOrganization({
        ownerId: owner.id
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'nonmember@example.com', password: 'Test123!@#' });

      const response = await agent
        .get(`/api/organizations/${org.id}/members`)
        .expect(403);

      expect(response.body.error).toBe('FORBIDDEN');
    });
  });

  describe('Organization Permissions', () => {
    test('should check org-level permissions', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      const role = await createTestRole({
        name: 'org-editor',
        permissions: ['org:content:write']
      });

      await models.UserRole.create({
        userId: user.id,
        roleId: role.id,
        scope: 'organization',
        organizationId: org.id,
        status: 'active'
      });

      const result = await rbacService.checkPermission(
        user.id,
        'org:content:write',
        { organizationId: org.id }
      );

      expect(result.allowed).toBe(true);
    });

    test('should inherit global permissions', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();
      const globalRole = await createTestRole({
        name: 'global-admin',
        permissions: ['*']
      });

      await user.addRole(globalRole);

      const result = await rbacService.checkPermission(
        user.id,
        'org:any:permission',
        { organizationId: org.id }
      );

      expect(result.allowed).toBe(true);
    });

    test('should override with org-specific permissions', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();

      // Global role with limited permissions
      const globalRole = await createTestRole({
        name: 'global-viewer',
        permissions: ['content:read']
      });
      await user.addRole(globalRole);

      // Org-specific role with more permissions
      const orgRole = await createTestRole({
        name: 'org-admin',
        permissions: ['content:read', 'content:write', 'content:delete']
      });

      await models.UserRole.create({
        userId: user.id,
        roleId: orgRole.id,
        scope: 'organization',
        organizationId: org.id,
        status: 'active'
      });

      const writeResult = await rbacService.checkPermission(
        user.id,
        'content:write',
        { organizationId: org.id }
      );

      expect(writeResult.allowed).toBe(true);
    });

    test('should restrict permissions outside organization scope', async () => {
      const user = await createTestUser();
      const org1 = await createTestOrganization({ slug: 'org1' });
      const org2 = await createTestOrganization({ slug: 'org2' });

      const role = await createTestRole({
        name: 'org1-admin',
        permissions: ['admin:access']
      });

      await models.UserRole.create({
        userId: user.id,
        roleId: role.id,
        scope: 'organization',
        organizationId: org1.id,
        status: 'active'
      });

      // Should have permission in org1
      const org1Result = await rbacService.checkPermission(
        user.id,
        'admin:access',
        { organizationId: org1.id }
      );
      expect(org1Result.allowed).toBe(true);

      // Should NOT have permission in org2
      const org2Result = await rbacService.checkPermission(
        user.id,
        'admin:access',
        { organizationId: org2.id }
      );
      expect(org2Result.allowed).toBe(false);
    });
  });

  describe('Organization Management', () => {
    test('should get organization by ID', async () => {
      const owner = await createTestUser({
        email: 'owner@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const org = await createTestOrganization({
        name: 'Get Org Test',
        ownerId: owner.id
      });

      await models.OrganizationMember.create({
        organizationId: org.id,
        userId: owner.id,
        role: 'owner'
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'owner@example.com', password: 'Test123!@#' });

      const response = await agent
        .get(`/api/organizations/${org.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.organization.id).toBe(org.id);
      expect(response.body.organization.name).toBe('Get Org Test');
    });

    test('should update organization', async () => {
      const owner = await createTestUser({
        email: 'owner@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const org = await createTestOrganization({
        name: 'Original Name',
        ownerId: owner.id
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'owner@example.com', password: 'Test123!@#' });

      const response = await agent
        .patch(`/api/organizations/${org.id}`)
        .send({
          name: 'Updated Name',
          description: 'Updated description'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.organization.name).toBe('Updated Name');

      // Verify in database
      await org.reload();
      expect(org.name).toBe('Updated Name');
      expect(org.description).toBe('Updated description');
    });

    test('should delete organization', async () => {
      const owner = await createTestUser({
        email: 'owner@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const org = await createTestOrganization({
        ownerId: owner.id
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'owner@example.com', password: 'Test123!@#' });

      const response = await agent
        .delete(`/api/organizations/${org.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify deleted
      const deletedOrg = await models.Organization.findByPk(org.id);
      expect(deletedOrg).toBeNull();
    });

    test('should only allow owner to delete organization', async () => {
      const owner = await createTestUser({
        email: 'owner@example.com'
      });

      const admin = await createTestUser({
        email: 'admin@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const org = await createTestOrganization({
        ownerId: owner.id
      });

      await models.OrganizationMember.create({
        organizationId: org.id,
        userId: admin.id,
        role: 'admin'
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'admin@example.com', password: 'Test123!@#' });

      const response = await agent
        .delete(`/api/organizations/${org.id}`)
        .expect(403);

      expect(response.body.error).toBe('FORBIDDEN');

      // Verify not deleted
      const org2 = await models.Organization.findByPk(org.id);
      expect(org2).toBeTruthy();
    });

    test('should get user organizations', async () => {
      const user = await createTestUser({
        email: 'user@example.com',
        password: await bcrypt.hash('Test123!@#', 12)
      });

      const org1 = await createTestOrganization({
        name: 'Org 1',
        ownerId: user.id
      });

      const org2 = await createTestOrganization({
        name: 'Org 2'
      });

      await models.OrganizationMember.create({
        organizationId: org2.id,
        userId: user.id,
        role: 'member'
      });

      await agent
        .post('/api/auth/login')
        .send({ email: 'user@example.com', password: 'Test123!@#' });

      const response = await agent
        .get('/api/organizations')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.organizations).toHaveLength(2);
    });
  });

  describe('Organization Service', () => {
    test('should check if user is organization member', async () => {
      const user = await createTestUser();
      const org = await createTestOrganization();

      await models.OrganizationMember.create({
        organizationId: org.id,
        userId: user.id,
        role: 'member'
      });

      const isMember = await organizationService.isMember(org.id, user.id);
      expect(isMember).toBe(true);
    });

    test('should check if user is owner or admin', async () => {
      const owner = await createTestUser();
      const admin = await createTestUser();
      const member = await createTestUser();

      const org = await createTestOrganization({
        ownerId: owner.id
      });

      await models.OrganizationMember.create({
        organizationId: org.id,
        userId: admin.id,
        role: 'admin'
      });

      await models.OrganizationMember.create({
        organizationId: org.id,
        userId: member.id,
        role: 'member'
      });

      const ownerCheck = await organizationService.isOwnerOrAdmin(org.id, owner.id);
      expect(ownerCheck).toBe(true);

      const adminCheck = await organizationService.isOwnerOrAdmin(org.id, admin.id);
      expect(adminCheck).toBe(true);

      const memberCheck = await organizationService.isOwnerOrAdmin(org.id, member.id);
      expect(memberCheck).toBe(false);
    });

    test('should handle organization settings', async () => {
      const org = await createTestOrganization({
        settings: {
          allowPublicAccess: false,
          requireMfa: true
        }
      });

      expect(org.settings).toHaveProperty('allowPublicAccess', false);
      expect(org.settings).toHaveProperty('requireMfa', true);

      // Update settings
      org.settings = {
        ...org.settings,
        allowPublicAccess: true
      };
      await org.save();

      await org.reload();
      expect(org.settings.allowPublicAccess).toBe(true);
    });
  });
});
