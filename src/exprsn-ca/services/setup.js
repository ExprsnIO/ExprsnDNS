/**
 * ═══════════════════════════════════════════════════════════════════════
 * Setup Wizard Service - First-Run Configuration
 * ═══════════════════════════════════════════════════════════════════════
 */

const fs = require('fs').promises;
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('../crypto');
const { User, Group, Role, RoleSet, Certificate, AuditLog } = require('../models');
const { getStorage } = require('../storage');
const logger = require('../utils/logger');
const db = require('../models');

class SetupService {
  /**
   * Check if setup has been completed
   */
  async isSetupComplete() {
    try {
      // Check if .env file has SETUP_COMPLETE=true
      const envPath = path.join(__dirname, '../../../.env');

      try {
        const envContent = await fs.readFile(envPath, 'utf8');
        if (envContent.includes('SETUP_COMPLETE=true')) {
          return true;
        }
      } catch (err) {
        // .env file doesn't exist
        return false;
      }

      // Additional check: verify admin user exists
      const adminUser = await User.findOne({
        where: { username: 'admin' },
        attributes: ['id']
      });

      return adminUser !== null;
    } catch (error) {
      logger.error('Error checking setup status:', error);
      return false;
    }
  }

  /**
   * Test database connectivity
   */
  async testDatabaseConnection(config) {
    try {
      // First, check if the port is accessible
      const net = require('net');
      const portAvailable = await new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(3000); // 3 second timeout

        socket.on('connect', () => {
          socket.destroy();
          resolve(true);
        });

        socket.on('timeout', () => {
          socket.destroy();
          resolve(false);
        });

        socket.on('error', () => {
          resolve(false);
        });

        socket.connect(config.port, config.host);
      });

      if (!portAvailable) {
        return {
          success: false,
          error: `PostgreSQL is not accessible on ${config.host}:${config.port}. Please ensure PostgreSQL is running and the port is correct.`
        };
      }

      // Port is accessible, now test the actual database connection
      const { Sequelize } = require('sequelize');

      const sequelize = new Sequelize({
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
        password: config.password,
        dialect: 'postgres',
        logging: false
      });

      await sequelize.authenticate();
      await sequelize.close();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test Redis connectivity
   */
  async testRedisConnection(config) {
    try {
      const Redis = require('ioredis');

      const redis = new Redis({
        host: config.host,
        port: config.port,
        password: config.password || undefined,
        db: config.db || 0,
        lazyConnect: true,
        retryStrategy: () => null
      });

      await redis.connect();
      await redis.ping();
      redis.disconnect();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate and save root CA certificate
   */
  async generateRootCertificate(caConfig, adminUserId) {
    try {
      logger.info('Generating root CA certificate...', { caConfig });

      // Generate certificate using crypto module
      const certData = await crypto.generateRootCertificate({
        commonName: caConfig.name,
        country: caConfig.country,
        state: caConfig.state,
        locality: caConfig.locality,
        organization: caConfig.organization,
        organizationalUnit: caConfig.organizationalUnit,
        email: caConfig.email,
        keySize: caConfig.rootKeySize || 4096,
        validityDays: caConfig.rootValidityDays || 7300
      });

      // Save to database
      const certificate = await Certificate.create({
        serialNumber: certData.serialNumber,
        type: 'root',
        userId: adminUserId,
        issuerId: null, // Self-signed
        commonName: caConfig.name,
        organization: caConfig.organization,
        organizationalUnit: caConfig.organizationalUnit,
        country: caConfig.country,
        state: caConfig.state,
        locality: caConfig.locality,
        email: caConfig.email,
        keySize: caConfig.rootKeySize || 4096,
        algorithm: 'RSA-SHA256',
        publicKey: certData.publicKey,
        certificatePem: certData.certificate,
        fingerprint: certData.fingerprint,
        notBefore: certData.notBefore,
        notAfter: certData.notAfter,
        status: 'active'
      });

      // Save to storage
      const storage = getStorage();
      await storage.saveCertificate(certificate.id, certData.certificate);
      await storage.savePrivateKey(certificate.id, certData.privateKey);

      // Update storage path
      certificate.storagePath = `certs/${certificate.id}.pem`;
      await certificate.save();

      // Audit log
      await AuditLog.log({
        userId: adminUserId,
        action: 'setup.certificate.create.root',
        resourceType: 'certificate',
        resourceId: certificate.id,
        status: 'success',
        severity: 'info',
        message: `Root CA certificate created during setup: ${certificate.commonName}`,
        details: {
          serialNumber: certificate.serialNumber,
          fingerprint: certificate.fingerprint
        }
      });

      logger.info('Root CA certificate created successfully', {
        id: certificate.id,
        serialNumber: certificate.serialNumber
      });

      return certificate;
    } catch (error) {
      logger.error('Failed to create root certificate:', error);
      throw error;
    }
  }

  /**
   * Generate and save intermediate CA certificate
   */
  async generateIntermediateCertificate(caConfig, rootCert, adminUserId) {
    try {
      logger.info('Generating intermediate CA certificate...');

      // Load root certificate and private key
      const storage = getStorage();
      const rootCertPem = await storage.loadCertificate(rootCert.id);
      const rootKeyPem = await storage.loadPrivateKey(rootCert.id);

      // Generate intermediate certificate
      const certData = await crypto.generateIntermediateCertificate({
        commonName: `${caConfig.name} - Intermediate`,
        country: caConfig.country,
        state: caConfig.state,
        locality: caConfig.locality,
        organization: caConfig.organization,
        organizationalUnit: caConfig.organizationalUnit,
        email: caConfig.email,
        keySize: caConfig.intermediateKeySize || 4096,
        validityDays: caConfig.intermediateValidityDays || 3650,
        issuerCert: rootCertPem,
        issuerKey: rootKeyPem
      });

      // Save to database
      const certificate = await Certificate.create({
        serialNumber: certData.serialNumber,
        type: 'intermediate',
        userId: adminUserId,
        issuerId: rootCert.id,
        commonName: `${caConfig.name} - Intermediate`,
        organization: caConfig.organization,
        organizationalUnit: caConfig.organizationalUnit,
        country: caConfig.country,
        state: caConfig.state,
        locality: caConfig.locality,
        email: caConfig.email,
        keySize: caConfig.intermediateKeySize || 4096,
        algorithm: 'RSA-SHA256',
        publicKey: certData.publicKey,
        certificatePem: certData.certificate,
        fingerprint: certData.fingerprint,
        notBefore: certData.notBefore,
        notAfter: certData.notAfter,
        status: 'active'
      });

      // Save to storage
      await storage.saveCertificate(certificate.id, certData.certificate);
      await storage.savePrivateKey(certificate.id, certData.privateKey);

      // Update storage path
      certificate.storagePath = `certs/${certificate.id}.pem`;
      await certificate.save();

      // Audit log
      await AuditLog.log({
        userId: adminUserId,
        action: 'setup.certificate.create.intermediate',
        resourceType: 'certificate',
        resourceId: certificate.id,
        status: 'success',
        severity: 'info',
        message: `Intermediate CA certificate created during setup: ${certificate.commonName}`,
        details: {
          serialNumber: certificate.serialNumber,
          fingerprint: certificate.fingerprint,
          issuerSerial: rootCert.serialNumber
        }
      });

      logger.info('Intermediate CA certificate created successfully', {
        id: certificate.id,
        serialNumber: certificate.serialNumber
      });

      return certificate;
    } catch (error) {
      logger.error('Failed to create intermediate certificate:', error);
      throw error;
    }
  }

  /**
   * Create admin user
   */
  async createAdminUser(userData) {
    try {
      logger.info('Creating admin user...');

      const passwordHash = await bcrypt.hash(userData.password, 12);

      const user = await User.create({
        username: 'admin',
        email: userData.email,
        passwordHash,
        firstName: userData.firstName || 'System',
        lastName: userData.lastName || 'Administrator',
        status: 'active',
        emailVerified: true
      });

      // Audit log
      await AuditLog.log({
        userId: user.id,
        action: 'setup.user.create.admin',
        resourceType: 'user',
        resourceId: user.id,
        status: 'success',
        severity: 'info',
        message: `Admin user created during setup: ${user.username}`,
        details: { email: user.email }
      });

      logger.info('Admin user created successfully', { id: user.id });

      return user;
    } catch (error) {
      logger.error('Failed to create admin user:', error);
      throw error;
    }
  }

  /**
   * Create default groups
   */
  async createDefaultGroups(templates = []) {
    try {
      logger.info('Creating default groups...');

      // Standard groups
      const defaultGroups = [
        {
          name: 'Administrators',
          slug: 'administrators',
          type: 'organizational_unit',
          description: 'System administrators with full access'
        },
        {
          name: 'Certificate Operators',
          slug: 'certificate-operators',
          type: 'organizational_unit',
          description: 'Users who can manage certificates'
        },
        {
          name: 'Token Managers',
          slug: 'token-managers',
          type: 'organizational_unit',
          description: 'Users who can manage tokens'
        },
        {
          name: 'Auditors',
          slug: 'auditors',
          type: 'organizational_unit',
          description: 'Users with read-only access to audit logs'
        },
        ...templates
      ];

      const createdGroups = [];
      for (const groupData of defaultGroups) {
        const group = await Group.create(groupData);
        createdGroups.push(group);

        await AuditLog.log({
          action: 'setup.group.create',
          resourceType: 'group',
          resourceId: group.id,
          status: 'success',
          severity: 'info',
          message: `Default group created during setup: ${group.name}`,
          details: { slug: group.slug }
        });
      }

      logger.info('Default groups created successfully', {
        count: createdGroups.length
      });

      return createdGroups;
    } catch (error) {
      logger.error('Failed to create default groups:', error);
      throw error;
    }
  }

  /**
   * Create default roles
   */
  async createDefaultRoles() {
    try {
      logger.info('Creating default roles...');

      // Permission flags from config
      const PERMS = {
        READ: 1,
        WRITE: 2,
        APPEND: 4,
        SHARE: 8,
        DELETE: 16,
        MODERATE: 32,
        LINK: 64
      };

      const defaultRoles = [
        {
          name: 'Super Administrator',
          slug: 'super-admin',
          description: 'Full system access',
          permissionFlags: PERMS.READ | PERMS.WRITE | PERMS.APPEND | PERMS.SHARE | PERMS.DELETE | PERMS.MODERATE | PERMS.LINK,
          resourceType: '*',
          resourcePattern: '*',
          isSystem: true,
          priority: 100
        },
        {
          name: 'Certificate Administrator',
          slug: 'cert-admin',
          description: 'Full certificate management',
          permissionFlags: PERMS.READ | PERMS.WRITE | PERMS.DELETE | PERMS.MODERATE,
          resourceType: 'certificate',
          resourcePattern: '/api/certificates/*',
          isSystem: true,
          priority: 50
        },
        {
          name: 'Token Administrator',
          slug: 'token-admin',
          description: 'Full token management',
          permissionFlags: PERMS.READ | PERMS.WRITE | PERMS.DELETE | PERMS.MODERATE,
          resourceType: 'token',
          resourcePattern: '/api/tokens/*',
          isSystem: true,
          priority: 50
        },
        {
          name: 'User Administrator',
          slug: 'user-admin',
          description: 'User and group management',
          permissionFlags: PERMS.READ | PERMS.WRITE | PERMS.DELETE,
          resourceType: 'user',
          resourcePattern: '/api/users/*',
          isSystem: true,
          priority: 50
        },
        {
          name: 'Auditor',
          slug: 'auditor',
          description: 'Read-only access to audit logs',
          permissionFlags: PERMS.READ,
          resourceType: 'audit_log',
          resourcePattern: '/api/audit/*',
          isSystem: true,
          priority: 10
        },
        {
          name: 'Certificate Operator',
          slug: 'cert-operator',
          description: 'Create and view certificates',
          permissionFlags: PERMS.READ | PERMS.WRITE | PERMS.APPEND,
          resourceType: 'certificate',
          resourcePattern: '/api/certificates/*',
          isSystem: false,
          priority: 25
        },
        {
          name: 'Token Operator',
          slug: 'token-operator',
          description: 'Create and view tokens',
          permissionFlags: PERMS.READ | PERMS.WRITE | PERMS.APPEND,
          resourceType: 'token',
          resourcePattern: '/api/tokens/*',
          isSystem: false,
          priority: 25
        },
        {
          name: 'Read Only',
          slug: 'read-only',
          description: 'View-only access',
          permissionFlags: PERMS.READ,
          resourceType: '*',
          resourcePattern: '*',
          isSystem: false,
          priority: 1
        }
      ];

      const createdRoles = [];
      for (const roleData of defaultRoles) {
        const role = await Role.create(roleData);
        createdRoles.push(role);

        await AuditLog.log({
          action: 'setup.role.create',
          resourceType: 'role',
          resourceId: role.id,
          status: 'success',
          severity: 'info',
          message: `Default role created during setup: ${role.name}`,
          details: { slug: role.slug, permissions: role.getPermissions() }
        });
      }

      logger.info('Default roles created successfully', {
        count: createdRoles.length
      });

      return createdRoles;
    } catch (error) {
      logger.error('Failed to create default roles:', error);
      throw error;
    }
  }

  /**
   * Assign admin user to groups and roles
   */
  async assignAdminPermissions(user, groups, roles) {
    try {
      logger.info('Assigning admin permissions...');

      // Find administrators group
      const adminGroup = groups.find(g => g.slug === 'administrators');
      if (adminGroup) {
        await user.addGroup(adminGroup);
      }

      // Find super admin role
      const superAdminRole = roles.find(r => r.slug === 'super-admin');
      if (superAdminRole) {
        await user.addRole(superAdminRole);
      }

      await AuditLog.log({
        userId: user.id,
        action: 'setup.permissions.assign',
        resourceType: 'user',
        resourceId: user.id,
        status: 'success',
        severity: 'info',
        message: 'Admin permissions assigned during setup'
      });

      logger.info('Admin permissions assigned successfully');
    } catch (error) {
      logger.error('Failed to assign admin permissions:', error);
      throw error;
    }
  }

  /**
   * Generate random secrets for JWT and sessions
   */
  generateSecrets() {
    const generateSecret = (length = 64) => {
      return require('crypto').randomBytes(length).toString('base64');
    };

    return {
      sessionSecret: generateSecret(64),
      jwtSecret: generateSecret(64)
    };
  }

  /**
   * Test SMTP connection
   */
  async testSMTPConnection(config) {
    try {
      const nodemailer = require('nodemailer');

      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user && config.password ? {
          user: config.user,
          pass: config.password
        } : undefined
      });

      await transporter.verify();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Validate SSO/SAML configuration
   */
  async validateSSOConfiguration(config) {
    try {
      const errors = [];

      // Validate required fields
      if (!config.entityId) {
        errors.push('Entity ID is required');
      }

      if (!config.idpSsoUrl && !config.idpMetadataUrl) {
        errors.push('Either IdP SSO URL or IdP Metadata URL is required');
      }

      // Validate URLs
      try {
        if (config.idpMetadataUrl) {
          new URL(config.idpMetadataUrl);
        }
        if (config.idpSsoUrl) {
          new URL(config.idpSsoUrl);
        }
        if (config.acsUrl) {
          new URL(config.acsUrl);
        }
      } catch (err) {
        errors.push('Invalid URL format');
      }

      // Validate certificate format (basic check)
      if (config.idpCert && !config.idpCert.includes('BEGIN CERTIFICATE')) {
        errors.push('IdP certificate must be in PEM format');
      }

      if (errors.length > 0) {
        return { valid: false, errors };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Upload and apply database schema (DDL)
   */
  async uploadDatabaseSchema(config) {
    try {
      const { Sequelize } = require('sequelize');
      const fs = require('fs').promises;
      const path = require('path');

      const sequelize = new Sequelize({
        host: config.host,
        port: config.port,
        database: config.database,
        username: config.username,
        password: config.password,
        dialect: 'postgres',
        dialectOptions: config.ssl ? {
          ssl: {
            require: true,
            rejectUnauthorized: false
          }
        } : {},
        logging: false
      });

      // Read the DDL file
      const ddlPath = path.join(__dirname, '../../../database/schema.sql');
      const ddl = await fs.readFile(ddlPath, 'utf8');

      // Execute the DDL
      await sequelize.query(ddl);

      // Count tables created
      const [results] = await sequelize.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `);

      await sequelize.close();

      return {
        success: true,
        tablesCreated: results[0].count
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create databases for selected services
   */
  async createServiceDatabases(config) {
    try {
      const { Sequelize } = require('sequelize');

      // Connect to postgres database (default)
      const sequelize = new Sequelize({
        host: config.host,
        port: config.port,
        database: 'postgres',
        username: config.username,
        password: config.password,
        dialect: 'postgres',
        dialectOptions: config.ssl ? {
          ssl: {
            require: true,
            rejectUnauthorized: false
          }
        } : {},
        logging: false
      });

      const created = [];
      const existed = [];

      for (const service of config.databases) {
        const dbName = `exprsn_${service}`;

        try {
          // Validate database name (alphanumeric and underscore only)
          if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
            logger.error(`Invalid database name: ${dbName}`);
            continue;
          }

          // Check if database exists (parameterized query)
          const [results] = await sequelize.query(
            'SELECT 1 FROM pg_database WHERE datname = $1',
            {
              bind: [dbName],
              type: sequelize.QueryTypes.SELECT
            }
          );

          if (results.length > 0) {
            existed.push(dbName);
          } else {
            // Create database (identifier cannot be parameterized in CREATE DATABASE)
            // dbName is validated above to prevent SQL injection
            await sequelize.query(`CREATE DATABASE ${dbName}`);
            created.push(dbName);
          }
        } catch (err) {
          logger.error(`Failed to create database ${dbName}:`, err);
        }
      }

      await sequelize.close();

      return {
        success: true,
        created,
        existed
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test S3 connection
   */
  async testS3Connection(config) {
    try {
      const AWS = require('aws-sdk');

      const s3Config = {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
        region: config.region,
        s3ForcePathStyle: config.forcePathStyle || false
      };

      // Add custom endpoint if provided
      if (config.endpoint) {
        s3Config.endpoint = config.endpoint;
      }

      const s3 = new AWS.S3(s3Config);

      // Try to list buckets
      await s3.listBuckets().promise();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create S3 buckets for services
   */
  async createS3Buckets(config) {
    try {
      const AWS = require('aws-sdk');

      const s3Config = {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
        region: config.region,
        s3ForcePathStyle: config.forcePathStyle || false
      };

      // Add custom endpoint if provided
      if (config.endpoint) {
        s3Config.endpoint = config.endpoint;
      }

      const s3 = new AWS.S3(s3Config);

      const created = [];
      const existed = [];

      for (const bucketSuffix of config.buckets) {
        const bucketName = config.bucket ? `${config.bucket}-${bucketSuffix}` : bucketSuffix;

        try {
          // Check if bucket exists
          try {
            await s3.headBucket({ Bucket: bucketName }).promise();
            existed.push(bucketName);
          } catch (err) {
            if (err.statusCode === 404) {
              // Bucket doesn't exist, create it
              await s3.createBucket({
                Bucket: bucketName,
                CreateBucketConfiguration: config.region !== 'us-east-1' ? {
                  LocationConstraint: config.region
                } : undefined
              }).promise();

              created.push(bucketName);
            } else {
              throw err;
            }
          }
        } catch (err) {
          logger.error(`Failed to create bucket ${bucketName}:`, err);
        }
      }

      return {
        success: true,
        created,
        existed
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Write configuration to .env file
   */
  async writeEnvFile(config) {
    try {
      logger.info('Writing configuration to .env file...');

      const envPath = path.join(__dirname, '../../../.env');

      // Generate secrets if not provided
      const secrets = this.generateSecrets();

      const envContent = `# ═══════════════════════════════════════════════════════════════════════
# Exprsn Certificate Authority - Environment Configuration
# Generated by Setup Wizard on ${new Date().toISOString()}
# ═══════════════════════════════════════════════════════════════════════

# ───────────────────────────────────────────────────────────────────────
# Setup Status
# ───────────────────────────────────────────────────────────────────────
SETUP_COMPLETE=true

# ───────────────────────────────────────────────────────────────────────
# Application Settings
# ───────────────────────────────────────────────────────────────────────
NODE_ENV=${config.app.environment || 'production'}
PORT=${config.app.port || 3000}
HOST=${config.app.host || '0.0.0.0'}
APP_URL=${config.app.url || 'http://localhost:3000'}
CLUSTER_ENABLED=${config.app.clusterEnabled || false}
CLUSTER_WORKERS=${config.app.clusterWorkers || 4}

# ───────────────────────────────────────────────────────────────────────
# Certificate Authority Settings
# ───────────────────────────────────────────────────────────────────────
CA_NAME=${config.ca.name}
CA_DOMAIN=${config.ca.domain}
CA_COUNTRY=${config.ca.country}
CA_STATE=${config.ca.state || ''}
CA_LOCALITY=${config.ca.locality || ''}
CA_ORGANIZATION=${config.ca.organization}
CA_ORGANIZATIONAL_UNIT=${config.ca.organizationalUnit || 'Certificate Authority'}
CA_EMAIL=${config.ca.email}

# Certificate Validity (in days)
CA_ROOT_VALIDITY_DAYS=${config.ca.rootValidityDays || 7300}
CA_INTERMEDIATE_VALIDITY_DAYS=${config.ca.intermediateValidityDays || 3650}
CA_ENTITY_VALIDITY_DAYS=${config.ca.entityValidityDays || 365}

# Key Sizes (in bits)
CA_ROOT_KEY_SIZE=${config.ca.rootKeySize || 4096}
CA_INTERMEDIATE_KEY_SIZE=${config.ca.intermediateKeySize || 4096}
CA_ENTITY_KEY_SIZE=${config.ca.entityKeySize || 2048}

# ───────────────────────────────────────────────────────────────────────
# Storage Configuration
# ───────────────────────────────────────────────────────────────────────
STORAGE_TYPE=${config.storage.type || 'disk'}

# Disk Storage
STORAGE_DISK_PATH=${config.storage.diskPath || './data/ca'}
STORAGE_DISK_CERTS_PATH=${config.storage.diskCertsPath || './data/ca/certs'}
STORAGE_DISK_KEYS_PATH=${config.storage.diskKeysPath || './data/ca/keys'}
STORAGE_DISK_CRL_PATH=${config.storage.diskCrlPath || './data/ca/crl'}
STORAGE_DISK_OCSP_PATH=${config.storage.diskOcspPath || './data/ca/ocsp'}

# S3 Storage (if enabled)
AWS_REGION=${config.storage.s3Region || 'us-east-1'}
AWS_ACCESS_KEY_ID=${config.storage.s3AccessKey || ''}
AWS_SECRET_ACCESS_KEY=${config.storage.s3SecretKey || ''}
S3_BUCKET_NAME=${config.storage.s3BucketName || ''}
S3_BUCKET_PREFIX=${config.storage.s3BucketPrefix || 'ca/'}

# ───────────────────────────────────────────────────────────────────────
# Database Configuration (PostgreSQL)
# ───────────────────────────────────────────────────────────────────────
DB_HOST=${config.database.host}
DB_PORT=${config.database.port || 5432}
DB_NAME=${config.database.database}
DB_USER=${config.database.username}
DB_PASSWORD=${config.database.password}
DB_SSL=${config.database.ssl || false}
DB_POOL_MIN=${config.database.poolMin || 2}
DB_POOL_MAX=${config.database.poolMax || 10}

# ───────────────────────────────────────────────────────────────────────
# Redis Cache Configuration
# ───────────────────────────────────────────────────────────────────────
REDIS_ENABLED=${config.redis.enabled || false}
REDIS_HOST=${config.redis.host || 'localhost'}
REDIS_PORT=${config.redis.port || 6379}
REDIS_PASSWORD=${config.redis.password || ''}
REDIS_DB=${config.redis.db || 0}
REDIS_KEY_PREFIX=exprsn:ca:

# Cache TTL (in seconds)
CACHE_TOKEN_TTL=${config.cache.tokenTtl || 60}
CACHE_CERT_TTL=${config.cache.certTtl || 300}
CACHE_OCSP_TTL=${config.cache.ocspTtl || 300}

# ───────────────────────────────────────────────────────────────────────
# JWT Configuration
# ───────────────────────────────────────────────────────────────────────
JWT_PRIVATE_KEY=
JWT_PUBLIC_KEY=
JWT_ISSUER=exprsn-ca
JWT_ALGORITHM=RS256
JWT_ACCESS_TOKEN_EXPIRY=3600
JWT_REFRESH_TOKEN_EXPIRY=2592000

# ───────────────────────────────────────────────────────────────────────
# Session Configuration
# ───────────────────────────────────────────────────────────────────────
SESSION_SECRET=${config.session.secret || secrets.sessionSecret}
SESSION_MAX_AGE=${config.session.maxAge || 86400000}
SESSION_SECURE=${config.session.secure || false}
SESSION_SAME_SITE=${config.session.sameSite || 'lax'}

# ───────────────────────────────────────────────────────────────────────
# OCSP Configuration
# ───────────────────────────────────────────────────────────────────────
OCSP_ENABLED=${config.ocsp.enabled || true}
OCSP_PORT=${config.ocsp.port || 2560}
OCSP_URL=${config.ocsp.url || 'http://ocsp.exprsn.io:2560'}
OCSP_BATCH_ENABLED=true
OCSP_BATCH_TIMEOUT=100
OCSP_CACHE_ENABLED=true
OCSP_CACHE_TTL=300

# ───────────────────────────────────────────────────────────────────────
# CRL Configuration
# ───────────────────────────────────────────────────────────────────────
CRL_ENABLED=${config.crl.enabled || true}
CRL_URL=${config.crl.url || 'http://crl.exprsn.io/crl'}
CRL_UPDATE_INTERVAL=3600
CRL_NEXT_UPDATE_DAYS=7

# ───────────────────────────────────────────────────────────────────────
# Security Settings
# ───────────────────────────────────────────────────────────────────────
BCRYPT_ROUNDS=12

# Rate Limiting
RATE_LIMIT_WINDOW_MS=${config.rateLimit.windowMs || 900000}
RATE_LIMIT_MAX_REQUESTS=${config.rateLimit.maxRequests || 100}

# Ticket Authentication
TICKET_EXPIRY_SECONDS=300
TICKET_MAX_USES=1

# Permission Caching
PERMISSION_CACHE_TTL=300

# ───────────────────────────────────────────────────────────────────────
# Password Reset Configuration
# ───────────────────────────────────────────────────────────────────────
PASSWORD_RESET_EXPIRY_MINUTES=60

# ───────────────────────────────────────────────────────────────────────
# Email/SMTP Configuration
# ───────────────────────────────────────────────────────────────────────
SMTP_ENABLED=${config.smtp?.enabled || false}
SMTP_HOST=${config.smtp?.host || 'smtp.example.com'}
SMTP_PORT=${config.smtp?.port || 587}
SMTP_SECURE=${config.smtp?.secure || false}
SMTP_USER=${config.smtp?.user || ''}
SMTP_PASSWORD=${config.smtp?.password || ''}
SMTP_FROM=${config.smtp?.from || 'noreply@exprsn.io'}
SMTP_FROM_NAME=${config.smtp?.fromName || 'Exprsn CA'}

# ───────────────────────────────────────────────────────────────────────
# SSO/SAML Configuration
# ───────────────────────────────────────────────────────────────────────
SSO_ENABLED=${config.sso?.enabled || false}
SSO_PROVIDER=${config.sso?.provider || 'generic'}
SSO_ENTITY_ID=${config.sso?.entityId || ''}
SSO_IDP_METADATA_URL=${config.sso?.idpMetadataUrl || ''}
SSO_IDP_SSO_URL=${config.sso?.idpSsoUrl || ''}
SSO_IDP_CERT=${config.sso?.idpCert ? config.sso.idpCert.replace(/\n/g, '\\n') : ''}
SSO_ACS_URL=${config.sso?.acsUrl || ''}
SSO_SLO_URL=${config.sso?.sloUrl || ''}
SSO_ATTR_EMAIL=${config.sso?.attributeMapping?.email || 'email'}
SSO_ATTR_FIRSTNAME=${config.sso?.attributeMapping?.firstName || 'firstName'}
SSO_ATTR_LASTNAME=${config.sso?.attributeMapping?.lastName || 'lastName'}
SSO_FORCE_AUTHN=${config.sso?.forceAuthn || false}
SSO_ALLOW_LOCAL=${config.sso?.allowLocal || true}

# ───────────────────────────────────────────────────────────────────────
# Enabled Services
# ───────────────────────────────────────────────────────────────────────
SERVICE_AUTH_ENABLED=${config.services?.auth || true}
SERVICE_SPARK_ENABLED=${config.services?.spark || false}
SERVICE_TIMELINE_ENABLED=${config.services?.timeline || false}
SERVICE_PREFETCH_ENABLED=${config.services?.prefetch || false}
SERVICE_MODERATOR_ENABLED=${config.services?.moderator || false}
SERVICE_FILEVAULT_ENABLED=${config.services?.filevault || false}
SERVICE_GALLERY_ENABLED=${config.services?.gallery || false}
SERVICE_LIVE_ENABLED=${config.services?.live || false}

# ───────────────────────────────────────────────────────────────────────
# Token Rotation Configuration
# ───────────────────────────────────────────────────────────────────────
TOKEN_ROTATION_ENABLED=true
TOKEN_ROTATION_SCHEDULE=0 * * * *
TOKEN_ROTATION_THRESHOLD_MINUTES=60
TOKEN_ROTATION_EXTENSION_SECONDS=3600
TOKEN_ROTATION_BATCH_SIZE=10

# ───────────────────────────────────────────────────────────────────────
# Logging
# ───────────────────────────────────────────────────────────────────────
LOG_LEVEL=${config.logging.level || 'info'}
LOG_FILE_ENABLED=true
LOG_FILE_PATH=./logs/exprsn-ca.log
LOG_MAX_SIZE=10m
LOG_MAX_FILES=10
LOG_COMPRESS=true

# ───────────────────────────────────────────────────────────────────────
# Token Specification Integration
# ───────────────────────────────────────────────────────────────────────
TOKEN_VERSION=1.0
TOKEN_MAX_SIZE=65536
TOKEN_CHECKSUM_ALGORITHM=sha256
TOKEN_SIGNATURE_ALGORITHM=RSA-SHA256-PSS

# Default Token Settings
DEFAULT_TOKEN_EXPIRY_TYPE=time
DEFAULT_TOKEN_EXPIRY_SECONDS=3600
DEFAULT_TOKEN_MAX_USES=10
`;

      await fs.writeFile(envPath, envContent, 'utf8');

      await AuditLog.log({
        action: 'setup.config.write',
        resourceType: 'configuration',
        status: 'success',
        severity: 'info',
        message: 'Configuration written to .env file during setup'
      });

      logger.info('Configuration written to .env file successfully');

      return true;
    } catch (error) {
      logger.error('Failed to write .env file:', error);
      throw error;
    }
  }

  /**
   * Run complete setup process
   *
   * CRITICAL: The Certificate Authority MUST be set up FIRST
   * Order of operations:
   * 1. Database connection and schema
   * 2. Admin user creation
   * 3. CA ROOT certificate generation (PRIORITY)
   * 4. CA INTERMEDIATE certificate generation
   * 5. Default groups and roles
   * 6. Permission assignment
   * 7. Service databases (if requested)
   * 8. Configuration file generation
   */
  async runSetup(setupData) {
    // Create a new Sequelize connection with the user-provided database config
    const { Sequelize } = require('sequelize');

    const sequelize = new Sequelize({
      host: setupData.database.host,
      port: setupData.database.port,
      database: setupData.database.database,
      username: setupData.database.username,
      password: setupData.database.password,
      dialect: 'postgres',
      dialectOptions: setupData.database.ssl ? {
        ssl: {
          require: true,
          rejectUnauthorized: false
        }
      } : {},
      logging: false
    });

    // Test connection
    try {
      await sequelize.authenticate();
      logger.info('Database connection successful');
    } catch (error) {
      throw new Error(`Database connection failed: ${error.message}`);
    }

    // Re-initialize models with the new connection
    const UserModel = require('../models/User')(sequelize, Sequelize.DataTypes);
    const GroupModel = require('../models/Group')(sequelize, Sequelize.DataTypes);
    const RoleModel = require('../models/Role')(sequelize, Sequelize.DataTypes);
    const RoleSetModel = require('../models/RoleSet')(sequelize, Sequelize.DataTypes);
    const CertificateModel = require('../models/Certificate')(sequelize, Sequelize.DataTypes);
    const AuditLogModel = require('../models/AuditLog')(sequelize, Sequelize.DataTypes);

    // Set up associations for these models
    UserModel.belongsToMany(GroupModel, { through: 'UserGroups', as: 'groups', foreignKey: 'userId' });
    GroupModel.belongsToMany(UserModel, { through: 'UserGroups', as: 'users', foreignKey: 'groupId' });
    UserModel.belongsToMany(RoleModel, { through: 'UserRoles', as: 'roles', foreignKey: 'userId' });
    RoleModel.belongsToMany(UserModel, { through: 'UserRoles', as: 'users', foreignKey: 'roleId' });

    // Sync database schema
    await sequelize.sync({ alter: true });
    logger.info('Database schema synchronized');

    const transaction = await sequelize.transaction();

    try {
      logger.info('╔═══════════════════════════════════════════════════════════════════════╗');
      logger.info('║   STARTING SETUP PROCESS - CERTIFICATE AUTHORITY FIRST               ║');
      logger.info('╚═══════════════════════════════════════════════════════════════════════╝');
      logger.info('');
      logger.info('Setup Order:');
      logger.info('  1. Admin user creation');
      logger.info('  2. ROOT CA certificate generation (CRITICAL)');
      logger.info('  3. INTERMEDIATE CA certificate generation');
      logger.info('  4. Groups and roles initialization');
      logger.info('  5. Permission assignment');
      logger.info('  6. Service databases (optional)');
      logger.info('  7. Configuration generation');
      logger.info('');

      // ═══════════════════════════════════════════════════════════════════
      // STEP 1: Create admin user (needed as certificate owner)
      // ═══════════════════════════════════════════════════════════════════
      logger.info('[1/7] Creating admin user...');
      const passwordHash = await bcrypt.hash(setupData.admin.password, 12);
      const adminUser = await UserModel.create({
        username: 'admin',
        email: setupData.admin.email,
        passwordHash,
        firstName: setupData.admin.firstName || 'System',
        lastName: setupData.admin.lastName || 'Administrator',
        status: 'active',
        emailVerified: true
      }, { transaction });

      logger.info('✓ Admin user created', { id: adminUser.id });

      // ═══════════════════════════════════════════════════════════════════
      // STEP 2: Generate ROOT CA certificate (HIGHEST PRIORITY)
      // This MUST succeed before anything else
      // ═══════════════════════════════════════════════════════════════════
      logger.info('[2/7] Generating ROOT CA certificate (CRITICAL)...');
      const rootCertData = await crypto.generateRootCertificate({
        commonName: setupData.ca.name,
        country: setupData.ca.country,
        state: setupData.ca.state,
        locality: setupData.ca.locality,
        organization: setupData.ca.organization,
        organizationalUnit: setupData.ca.organizationalUnit,
        email: setupData.ca.email,
        keySize: setupData.ca.rootKeySize || 4096,
        validityDays: setupData.ca.rootValidityDays || 7300
      });

      const rootCert = await CertificateModel.create({
        serialNumber: rootCertData.serialNumber,
        type: 'root',
        userId: adminUser.id,
        issuerId: null,
        commonName: setupData.ca.name,
        organization: setupData.ca.organization,
        organizationalUnit: setupData.ca.organizationalUnit,
        country: setupData.ca.country,
        state: setupData.ca.state,
        locality: setupData.ca.locality,
        email: setupData.ca.email,
        keySize: setupData.ca.rootKeySize || 4096,
        algorithm: 'RSA-SHA256',
        publicKey: rootCertData.publicKey,
        certificatePem: rootCertData.certificate,
        fingerprint: rootCertData.fingerprint,
        notBefore: rootCertData.notBefore,
        notAfter: rootCertData.notAfter,
        status: 'active',
        storagePath: `certs/${rootCertData.serialNumber}.pem`
      }, { transaction });

      logger.info('✓ ROOT CA certificate created successfully', {
        id: rootCert.id,
        serialNumber: rootCert.serialNumber,
        commonName: rootCert.commonName
      });

      // Save certificate to storage
      const storage = getStorage();
      await storage.initialize();
      await storage.saveCertificate(rootCert.id, rootCertData.certificate);
      await storage.savePrivateKey(rootCert.id, rootCertData.privateKey);

      logger.info('✓ ROOT CA certificate saved to storage');

      // ═══════════════════════════════════════════════════════════════════
      // STEP 3: Generate INTERMEDIATE CA certificate (if requested)
      // ═══════════════════════════════════════════════════════════════════
      logger.info('[3/7] Generating INTERMEDIATE CA certificate...');
      let intermediateCert = null;
      if (setupData.ca.createIntermediate) {
        const intermediateCertData = await crypto.generateIntermediateCertificate({
          commonName: `${setupData.ca.name} - Intermediate`,
          country: setupData.ca.country,
          state: setupData.ca.state,
          locality: setupData.ca.locality,
          organization: setupData.ca.organization,
          organizationalUnit: setupData.ca.organizationalUnit,
          email: setupData.ca.email,
          keySize: setupData.ca.intermediateKeySize || 4096,
          validityDays: setupData.ca.intermediateValidityDays || 3650,
          issuerCert: rootCertData.certificate,
          issuerKey: rootCertData.privateKey
        });

        intermediateCert = await CertificateModel.create({
          serialNumber: intermediateCertData.serialNumber,
          type: 'intermediate',
          userId: adminUser.id,
          issuerId: rootCert.id,
          commonName: `${setupData.ca.name} - Intermediate`,
          organization: setupData.ca.organization,
          organizationalUnit: setupData.ca.organizationalUnit,
          country: setupData.ca.country,
          state: setupData.ca.state,
          locality: setupData.ca.locality,
          email: setupData.ca.email,
          keySize: setupData.ca.intermediateKeySize || 4096,
          algorithm: 'RSA-SHA256',
          publicKey: intermediateCertData.publicKey,
          certificatePem: intermediateCertData.certificate,
          fingerprint: intermediateCertData.fingerprint,
          notBefore: intermediateCertData.notBefore,
          notAfter: intermediateCertData.notAfter,
          status: 'active',
          storagePath: `certs/${intermediateCertData.serialNumber}.pem`
        }, { transaction });

        await storage.saveCertificate(intermediateCert.id, intermediateCertData.certificate);
        await storage.savePrivateKey(intermediateCert.id, intermediateCertData.privateKey);

        logger.info('✓ INTERMEDIATE CA certificate created', { id: intermediateCert.id });
      } else {
        logger.info('⊘ INTERMEDIATE CA certificate skipped (not requested)');
      }

      // ═══════════════════════════════════════════════════════════════════
      // STEP 4: Create default groups
      // ═══════════════════════════════════════════════════════════════════
      logger.info('[4/7] Creating default groups...');
      const defaultGroupsData = [
        { name: 'Administrators', slug: 'administrators', type: 'organizational_unit', description: 'System administrators with full access' },
        { name: 'Certificate Operators', slug: 'certificate-operators', type: 'organizational_unit', description: 'Users who can manage certificates' },
        { name: 'Token Managers', slug: 'token-managers', type: 'organizational_unit', description: 'Users who can manage tokens' },
        { name: 'Auditors', slug: 'auditors', type: 'organizational_unit', description: 'Users with read-only access to audit logs' },
        ...(setupData.groups || [])
      ];

      const groups = [];
      for (const groupData of defaultGroupsData) {
        const group = await GroupModel.create(groupData, { transaction });
        groups.push(group);
      }

      logger.info('✓ Default groups created', { count: groups.length });

      // ═══════════════════════════════════════════════════════════════════
      // STEP 5: Create default roles
      // ═══════════════════════════════════════════════════════════════════
      logger.info('[5/7] Creating default roles...');
      const PERMS = { READ: 1, WRITE: 2, APPEND: 4, SHARE: 8, DELETE: 16, MODERATE: 32, LINK: 64 };
      const defaultRolesData = [
        { name: 'Super Administrator', slug: 'super-admin', description: 'Full system access', permissionFlags: PERMS.READ | PERMS.WRITE | PERMS.APPEND | PERMS.SHARE | PERMS.DELETE | PERMS.MODERATE | PERMS.LINK, resourceType: '*', resourcePattern: '*', isSystem: true, priority: 100 },
        { name: 'Certificate Administrator', slug: 'cert-admin', description: 'Full certificate management', permissionFlags: PERMS.READ | PERMS.WRITE | PERMS.DELETE | PERMS.MODERATE, resourceType: 'certificate', resourcePattern: '/api/certificates/*', isSystem: true, priority: 50 },
        { name: 'Token Administrator', slug: 'token-admin', description: 'Full token management', permissionFlags: PERMS.READ | PERMS.WRITE | PERMS.DELETE | PERMS.MODERATE, resourceType: 'token', resourcePattern: '/api/tokens/*', isSystem: true, priority: 50 },
        { name: 'User Administrator', slug: 'user-admin', description: 'User and group management', permissionFlags: PERMS.READ | PERMS.WRITE | PERMS.DELETE, resourceType: 'user', resourcePattern: '/api/users/*', isSystem: true, priority: 50 },
        { name: 'Auditor', slug: 'auditor', description: 'Read-only access to audit logs', permissionFlags: PERMS.READ, resourceType: 'audit_log', resourcePattern: '/api/audit/*', isSystem: true, priority: 10 },
        { name: 'Certificate Operator', slug: 'cert-operator', description: 'Create and view certificates', permissionFlags: PERMS.READ | PERMS.WRITE | PERMS.APPEND, resourceType: 'certificate', resourcePattern: '/api/certificates/*', isSystem: false, priority: 25 },
        { name: 'Token Operator', slug: 'token-operator', description: 'Create and view tokens', permissionFlags: PERMS.READ | PERMS.WRITE | PERMS.APPEND, resourceType: 'token', resourcePattern: '/api/tokens/*', isSystem: false, priority: 25 },
        { name: 'Read Only', slug: 'read-only', description: 'View-only access', permissionFlags: PERMS.READ, resourceType: '*', resourcePattern: '*', isSystem: false, priority: 1 }
      ];

      const roles = [];
      for (const roleData of defaultRolesData) {
        const role = await RoleModel.create(roleData, { transaction });
        roles.push(role);
      }

      logger.info('✓ Default roles created', { count: roles.length });

      // ═══════════════════════════════════════════════════════════════════
      // STEP 6: Assign admin permissions
      // ═══════════════════════════════════════════════════════════════════
      logger.info('[6/7] Assigning admin permissions...');
      const adminGroup = groups.find(g => g.slug === 'administrators');
      const superAdminRole = roles.find(r => r.slug === 'super-admin');

      if (adminGroup) {
        await adminUser.addGroup(adminGroup, { transaction });
      }

      if (superAdminRole) {
        await adminUser.addRole(superAdminRole, { transaction });
      }

      logger.info('✓ Admin permissions assigned');

      // ═══════════════════════════════════════════════════════════════════
      // STEP 7: Create service databases if requested
      // ═══════════════════════════════════════════════════════════════════
      logger.info('[7/7] Processing service databases...');
      if (setupData.serviceDatabases?.createDatabases && setupData.serviceDatabases?.databases?.length > 0) {
        logger.info('Creating service databases...');

        const dbResult = await this.createServiceDatabases({
          host: setupData.database.host,
          port: setupData.database.port,
          username: setupData.database.username,
          password: setupData.database.password,
          ssl: setupData.database.ssl,
          databases: setupData.serviceDatabases.databases
        });

        if (dbResult.success) {
          logger.info('Service databases created', {
            created: dbResult.created,
            existed: dbResult.existed
          });
        }
      }

      // 8. Create S3 buckets if requested
      if (setupData.s3Buckets?.createBuckets && setupData.s3Buckets?.buckets?.length > 0) {
        logger.info('Creating S3 buckets...');

        try {
          const bucketResult = await this.createS3Buckets({
            provider: setupData.storage.s3Provider,
            bucket: setupData.storage.s3BucketName,
            region: setupData.storage.s3Region,
            endpoint: setupData.storage.s3Endpoint,
            accessKey: setupData.storage.s3AccessKey,
            secretKey: setupData.storage.s3SecretKey,
            forcePathStyle: setupData.storage.s3ForcePathStyle,
            buckets: setupData.s3Buckets.buckets
          });

          if (bucketResult.success) {
            logger.info('S3 buckets created', {
              created: bucketResult.created,
              existed: bucketResult.existed
            });
          }
        } catch (err) {
          logger.error('Failed to create S3 buckets:', err);
        }
      }

      // 9. Write configuration to .env
      await this.writeEnvFile(setupData);

      await transaction.commit();

      // Log audit
      await AuditLogModel.log({
        userId: adminUser.id,
        action: 'setup.complete',
        resourceType: 'system',
        status: 'success',
        severity: 'info',
        message: 'First-run setup completed successfully',
        details: {
          adminUserId: adminUser.id,
          rootCertId: rootCert.id,
          intermediateCertId: intermediateCert?.id,
          groupsCreated: groups.length,
          rolesCreated: roles.length
        }
      });

      logger.info('Setup completed successfully!');

      // Close the setup connection
      await sequelize.close();

      return {
        success: true,
        adminUser,
        rootCert,
        intermediateCert,
        groups,
        roles
      };
    } catch (error) {
      await transaction.rollback();
      logger.error('Setup failed:', error);

      throw error;
    } finally {
      // Always close the connection
      try {
        await sequelize.close();
      } catch (err) {
        logger.error('Error closing setup database connection:', err);
      }
    }
  }
}

module.exports = new SetupService();
