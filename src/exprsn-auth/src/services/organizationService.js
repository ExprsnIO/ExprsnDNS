/**
 * ═══════════════════════════════════════════════════════════
 * Organization Service
 * Multi-tenant organization management
 * ═══════════════════════════════════════════════════════════
 */

const { Organization, User, Group, Application, OrganizationMember, Role, UserRole } = require('../models');
const { AppError } = require('@exprsn/shared');
const { Op } = require('sequelize');

/**
 * Create organization
 */
async function createOrganization(data, ownerId) {
  try {
    // Generate slug if not provided
    if (!data.slug) {
      data.slug = data.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    }

    // Check slug uniqueness
    const existing = await Organization.findOne({ where: { slug: data.slug } });
    if (existing) {
      throw new AppError('Organization slug already exists', 400, 'SLUG_EXISTS');
    }

    // Create organization
    const org = await Organization.create({
      ...data,
      ownerId,
      status: 'active'
    });

    // Add owner as member
    await OrganizationMember.create({
      organizationId: org.id,
      userId: ownerId,
      role: 'owner',
      status: 'active'
    });

    // Assign organization owner role
    const ownerRole = await Role.findOne({ where: { slug: 'org-owner', type: 'system' } });
    if (ownerRole) {
      await UserRole.create({
        userId: ownerId,
        roleId: ownerRole.id,
        scope: 'organization',
        organizationId: org.id,
        status: 'active'
      });
    }

    return org;
  } catch (error) {
    console.error('Error creating organization:', error);
    throw error;
  }
}

/**
 * Get organization by ID
 */
async function getOrganizationById(organizationId, options = {}) {
  const { includeMembers, includeGroups, includeApplications } = options;

  const include = [];

  if (includeMembers) {
    include.push({
      model: User,
      as: 'members',
      through: { attributes: ['role', 'joinedAt', 'status'] }
    });
  }

  if (includeGroups) {
    include.push({
      model: Group,
      as: 'groups'
    });
  }

  if (includeApplications) {
    include.push({
      model: Application,
      as: 'applications'
    });
  }

  const org = await Organization.findByPk(organizationId, { include });

  if (!org) {
    throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
  }

  return org;
}

/**
 * Update organization
 */
async function updateOrganization(organizationId, updates) {
  const org = await Organization.findByPk(organizationId);

  if (!org) {
    throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
  }

  // Prevent changing owner via this method
  delete updates.ownerId;

  await org.update(updates);
  return org;
}

/**
 * Delete organization (soft delete)
 */
async function deleteOrganization(organizationId) {
  const org = await Organization.findByPk(organizationId);

  if (!org) {
    throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
  }

  await org.destroy(); // Soft delete (paranoid: true)
  return { success: true };
}

/**
 * Add member to organization
 */
async function addMember(organizationId, userId, options = {}) {
  const { role = 'member', invitedBy } = options;

  try {
    // Check if already a member
    const existing = await OrganizationMember.findOne({
      where: { organizationId, userId }
    });

    if (existing) {
      if (existing.status === 'active') {
        throw new AppError('User is already a member', 400, 'ALREADY_MEMBER');
      }

      // Reactivate if inactive
      existing.status = 'active';
      existing.role = role;
      await existing.save();
      return existing;
    }

    // Create member
    const member = await OrganizationMember.create({
      organizationId,
      userId,
      role,
      invitedBy,
      status: 'active'
    });

    // Assign default member role
    const memberRole = await Role.findOne({
      where: { slug: 'org-member', type: 'system' }
    });

    if (memberRole) {
      await UserRole.create({
        userId,
        roleId: memberRole.id,
        scope: 'organization',
        organizationId,
        status: 'active'
      });
    }

    return member;
  } catch (error) {
    console.error('Error adding member:', error);
    throw error;
  }
}

/**
 * Remove member from organization
 */
async function removeMember(organizationId, userId) {
  const member = await OrganizationMember.findOne({
    where: { organizationId, userId, status: 'active' }
  });

  if (!member) {
    throw new AppError('Member not found', 404, 'MEMBER_NOT_FOUND');
  }

  // Prevent removing owner
  if (member.role === 'owner') {
    throw new AppError('Cannot remove organization owner', 400, 'CANNOT_REMOVE_OWNER');
  }

  member.status = 'inactive';
  await member.save();

  // Revoke organization-scoped roles
  await UserRole.update(
    { status: 'revoked' },
    {
      where: {
        userId,
        organizationId,
        scope: 'organization',
        status: 'active'
      }
    }
  );

  return { success: true };
}

/**
 * Update member role
 */
async function updateMemberRole(organizationId, userId, newRole) {
  const member = await OrganizationMember.findOne({
    where: { organizationId, userId, status: 'active' }
  });

  if (!member) {
    throw new AppError('Member not found', 404, 'MEMBER_NOT_FOUND');
  }

  member.role = newRole;
  await member.save();

  return member;
}

/**
 * Get organization members
 */
async function getMembers(organizationId, options = {}) {
  const { status = 'active', role } = options;

  const where = { organizationId, status };
  if (role) {
    where.role = role;
  }

  const members = await OrganizationMember.findAll({
    where,
    include: [
      {
        model: User,
        as: 'user',
        attributes: ['id', 'email', 'displayName', 'firstName', 'lastName', 'avatarUrl']
      }
    ],
    order: [['joinedAt', 'DESC']]
  });

  return members;
}

/**
 * Check if user is member of organization
 */
async function isMember(organizationId, userId) {
  const member = await OrganizationMember.findOne({
    where: {
      organizationId,
      userId,
      status: 'active'
    }
  });

  return member !== null;
}

/**
 * Check if user is owner or admin
 */
async function isOwnerOrAdmin(organizationId, userId) {
  const member = await OrganizationMember.findOne({
    where: {
      organizationId,
      userId,
      status: 'active',
      role: { [Op.in]: ['owner', 'admin'] }
    }
  });

  return member !== null;
}

/**
 * Get user's organizations
 */
async function getUserOrganizations(userId) {
  const user = await User.findByPk(userId, {
    include: [
      {
        model: Organization,
        as: 'organizations',
        through: {
          where: { status: 'active' },
          attributes: ['role', 'joinedAt']
        }
      }
    ]
  });

  if (!user) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }

  return user.organizations;
}

/**
 * Transfer organization ownership
 */
async function transferOwnership(organizationId, currentOwnerId, newOwnerId) {
  const org = await Organization.findByPk(organizationId);

  if (!org) {
    throw new AppError('Organization not found', 404, 'ORG_NOT_FOUND');
  }

  if (org.ownerId !== currentOwnerId) {
    throw new AppError('Only current owner can transfer ownership', 403, 'NOT_OWNER');
  }

  // Check new owner is a member
  const newOwnerMember = await OrganizationMember.findOne({
    where: { organizationId, userId: newOwnerId }
  });

  if (!newOwnerMember) {
    throw new AppError('New owner must be a member of the organization', 400, 'NOT_MEMBER');
  }

  // Update organization owner
  org.ownerId = newOwnerId;
  await org.save();

  // Update member roles
  await OrganizationMember.update(
    { role: 'admin' },
    { where: { organizationId, userId: currentOwnerId } }
  );

  await OrganizationMember.update(
    { role: 'owner' },
    { where: { organizationId, userId: newOwnerId } }
  );

  // Update roles
  const ownerRole = await Role.findOne({ where: { slug: 'org-owner', type: 'system' } });

  if (ownerRole) {
    // Revoke from current owner
    await UserRole.update(
      { status: 'revoked' },
      {
        where: {
          userId: currentOwnerId,
          roleId: ownerRole.id,
          organizationId,
          scope: 'organization'
        }
      }
    );

    // Assign to new owner
    await UserRole.findOrCreate({
      where: {
        userId: newOwnerId,
        roleId: ownerRole.id,
        organizationId,
        scope: 'organization'
      },
      defaults: {
        userId: newOwnerId,
        roleId: ownerRole.id,
        organizationId,
        scope: 'organization',
        status: 'active'
      }
    });
  }

  return org;
}

module.exports = {
  createOrganization,
  getOrganizationById,
  updateOrganization,
  deleteOrganization,
  addMember,
  removeMember,
  updateMemberRole,
  getMembers,
  isMember,
  isOwnerOrAdmin,
  getUserOrganizations,
  transferOwnership
};
