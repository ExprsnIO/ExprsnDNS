/**
 * ═══════════════════════════════════════════════════════════
 * Setup Routes
 * Comprehensive setup interface for authentication system
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const { asyncHandler, AppError } = require('@exprsn/shared');
const { User, Group, Role, OAuth2Client, Application, Organization } = require('../models');
const caService = require('../services/caService');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

/**
 * GET /setup - Main setup dashboard
 */
router.get('/', asyncHandler(async (req, res) => {
  // Get system statistics
  const [
    userCount,
    groupCount,
    roleCount,
    oauth2ClientCount,
    organizationCount
  ] = await Promise.all([
    User.count(),
    Group.count(),
    Role.count(),
    OAuth2Client.count(),
    Organization.count()
  ]);

  // Get CA service status
  const caStatus = await caService.getStatus();

  res.render('setup', {
    layout: false,
    stats: {
      users: userCount,
      groups: groupCount,
      roles: roleCount,
      oauth2Clients: oauth2ClientCount,
      organizations: organizationCount
    },
    caStatus,
    oidcIssuer: process.env.OIDC_ISSUER || `https://localhost:${process.env.AUTH_SERVICE_PORT || 3001}`
  });
}));

/**
 * GET /setup/api/status - Get system status
 */
router.get('/api/status', asyncHandler(async (req, res) => {
  const [caStatus, dbStatus] = await Promise.all([
    caService.getStatus(),
    checkDatabaseStatus()
  ]);

  res.json({
    success: true,
    data: {
      ca: caStatus,
      database: dbStatus,
      redis: {
        configured: process.env.REDIS_ENABLED === 'true',
        available: false // TODO: Add Redis check
      },
      tls: {
        enabled: process.env.TLS_ENABLED === 'true'
      }
    }
  });
}));

/**
 * GET /setup/api/oidc/config - Get OpenID Connect configuration
 */
router.get('/api/oidc/config', asyncHandler(async (req, res) => {
  const baseUrl = process.env.OIDC_ISSUER || `https://localhost:${process.env.AUTH_SERVICE_PORT || 3001}`;

  res.json({
    success: true,
    data: {
      issuer: baseUrl,
      authorizationEndpoint: `${baseUrl}/api/oauth2/authorize`,
      tokenEndpoint: `${baseUrl}/api/oauth2/token`,
      userinfoEndpoint: `${baseUrl}/api/oauth2/userinfo`,
      jwksUri: `${baseUrl}/.well-known/jwks.json`,
      registrationEndpoint: `${baseUrl}/api/oauth2/register`,
      revocationEndpoint: `${baseUrl}/api/oauth2/revoke`,
      introspectionEndpoint: `${baseUrl}/api/oauth2/introspect`,
      responseTypesSupported: ['code', 'token', 'id_token', 'code id_token', 'code token', 'id_token token', 'code id_token token'],
      grantTypesSupported: ['authorization_code', 'implicit', 'refresh_token', 'client_credentials'],
      scopesSupported: ['openid', 'profile', 'email', 'offline_access'],
      tokenEndpointAuthMethodsSupported: ['client_secret_basic', 'client_secret_post']
    }
  });
}));

/**
 * POST /setup/api/oauth2/clients - Create OAuth2 client
 */
router.post('/api/oauth2/clients', asyncHandler(async (req, res) => {
  const { name, description, redirectUris, scopes, grants, type } = req.body;

  // Generate client credentials
  const clientId = crypto.randomBytes(16).toString('hex');
  const clientSecret = crypto.randomBytes(32).toString('hex');

  const client = await OAuth2Client.create({
    clientId,
    clientSecret: await bcrypt.hash(clientSecret, 10),
    name,
    description,
    redirectUris: redirectUris || [],
    scopes: scopes || ['read', 'write'],
    grants: grants || ['authorization_code', 'refresh_token'],
    type: type || 'confidential',
    status: 'active'
  });

  res.status(201).json({
    success: true,
    data: {
      ...client.toJSON(),
      clientSecret // Return plain secret only once
    },
    message: 'OAuth2 client created successfully'
  });
}));

/**
 * GET /setup/api/oauth2/clients - List OAuth2 clients
 */
router.get('/api/oauth2/clients', asyncHandler(async (req, res) => {
  const clients = await OAuth2Client.findAll({
    attributes: { exclude: ['clientSecret'] },
    order: [['createdAt', 'DESC']]
  });

  res.json({
    success: true,
    data: clients
  });
}));

/**
 * DELETE /setup/api/oauth2/clients/:id - Delete OAuth2 client
 */
router.delete('/api/oauth2/clients/:id', asyncHandler(async (req, res) => {
  const client = await OAuth2Client.findByPk(req.params.id);

  if (!client) {
    throw new AppError('OAuth2 client not found', 404);
  }

  await client.destroy();

  res.json({
    success: true,
    message: 'OAuth2 client deleted successfully'
  });
}));

/**
 * POST /setup/api/users - Create user
 */
router.post('/api/users', asyncHandler(async (req, res) => {
  const { email, password, displayName, username } = req.body;

  // Check if user exists
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) {
    throw new AppError('User with this email already exists', 400);
  }

  const user = await User.create({
    email,
    passwordHash: password, // Will be hashed by model hook
    displayName: displayName || email.split('@')[0],
    username: username || email.split('@')[0],
    emailVerified: true, // Auto-verify for setup users
    status: 'active'
  });

  res.status(201).json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      username: user.username
    },
    message: 'User created successfully'
  });
}));

/**
 * POST /setup/api/groups - Create group
 */
router.post('/api/groups', asyncHandler(async (req, res) => {
  const { name, description, slug, type, permissions } = req.body;

  const group = await Group.create({
    name,
    description,
    slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
    type: type || 'custom',
    permissions: permissions || {}
  });

  res.status(201).json({
    success: true,
    data: group,
    message: 'Group created successfully'
  });
}));

/**
 * GET /setup/api/groups - List groups
 */
router.get('/api/groups', asyncHandler(async (req, res) => {
  const groups = await Group.findAll({
    order: [['createdAt', 'DESC']],
    include: [{
      model: User,
      as: 'members',
      through: { attributes: [] },
      attributes: ['id', 'email', 'displayName']
    }]
  });

  res.json({
    success: true,
    data: groups
  });
}));

/**
 * POST /setup/api/roles - Create role
 */
router.post('/api/roles', asyncHandler(async (req, res) => {
  const { name, description, slug, permissions, serviceAccess, priority } = req.body;

  const role = await Role.create({
    name,
    description,
    slug: slug || name.toLowerCase().replace(/\s+/g, '-'),
    permissions: permissions || {},
    serviceAccess: serviceAccess || [],
    priority: priority || 0,
    isSystem: false,
    type: 'custom'
  });

  res.status(201).json({
    success: true,
    data: role,
    message: 'Role created successfully'
  });
}));

/**
 * GET /setup/api/roles - List roles
 */
router.get('/api/roles', asyncHandler(async (req, res) => {
  const roles = await Role.findAll({
    order: [['priority', 'DESC'], ['createdAt', 'DESC']]
  });

  res.json({
    success: true,
    data: roles
  });
}));

/**
 * Helper: Check database status
 */
async function checkDatabaseStatus() {
  try {
    const { sequelize } = require('../models');
    await sequelize.authenticate();
    return {
      connected: true,
      database: process.env.AUTH_DB_NAME || process.env.DB_NAME,
      host: process.env.AUTH_DB_HOST || process.env.DB_HOST
    };
  } catch (error) {
    return {
      connected: false,
      error: error.message
    };
  }
}

module.exports = router;
