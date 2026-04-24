/**
 * Exprsn Authentication Service
 * Handles user authentication, SSO, and session management
 * Integrates with exprsn-ca for token validation
 *
 * Port: 3001
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Sequelize } = require('sequelize');
const BaseConfig = require('../shared/config/baseConfig');
const { authenticate, authenticateService, rateLimit } = require('../shared/middleware/auth');
const { getServiceClient } = require('../shared/utils/serviceClient');
const { HTTPSServerManager } = require('../shared/utils/httpsServer');
const IPCWorker = require('../shared/ipc/IPCWorker');
const { bypassAll, logBypassStatus } = require('../shared/middleware/devBypass');

// Routes
const authRoutes = require('./routes/auth');
const ssoRoutes = require('./routes/sso');
const sessionRoutes = require('./routes/sessions');
const mfaRoutes = require('./routes/mfa');

class AuthService {
  constructor() {
    this.config = new BaseConfig('auth').getConfig();
    this.app = express();
    this.db = null;
    this.serviceClient = getServiceClient({
      serviceId: this.config.service.id,
      serviceToken: this.config.ca.serviceToken
    });

    // Log bypass status
    logBypassStatus();

    // Initialize IPC Worker
    this.ipc = new IPCWorker({
      serviceName: 'exprsn-auth',
      namespace: 'ipc'
    });

    // IPC Event Handlers
    this.ipc.on('ready', () => {
      console.log('✅ IPC Worker ready for inter-service communication');
    });

    this.ipc.on('error', (error) => {
      console.error('❌ IPC Worker error:', error.message);
    });

    // Setup IPC event handlers
    this.setupIPCHandlers();

    this.init();
  }

  /**
   * Initialize service
   */
  async init() {
    try {
      console.log('🔑 Initializing Authentication Service...');

      await this.connectRedis();
      await this.connectDatabase();
      this.setupMiddleware();
      this.setupRoutes();
      this.setupErrorHandling();
      this.start();

      console.log('✅ Authentication Service initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Authentication Service:', error);
      process.exit(1);
    }
  }

  /**
   * Setup IPC event handlers
   */
  setupIPCHandlers() {
    // Listen for user validation requests
    this.ipc.on('user:validate', async (data, meta) => {
      const { userId, sessionId } = data;

      console.log(`📨 User validation request from ${meta.source}:`, { userId, sessionId });

      try {
        const models = require('./models');
        const session = await models.Session.findOne({
          where: { id: sessionId, userId, active: true },
          include: [{
            model: models.User,
            as: 'user',
            attributes: ['id', 'email', 'roles']
          }]
        });

        await this.ipc.emit('user:validated', {
          userId,
          sessionId,
          valid: !!session,
          roles: session ? session.user.roles : [],
          email: session ? session.user.email : null
        }, {
          target: meta.source
        });
      } catch (error) {
        console.error('❌ User validation failed:', error.message);
        await this.ipc.emit('user:validated', {
          userId,
          sessionId,
          valid: false,
          error: error.message
        }, {
          target: meta.source
        });
      }
    });

    // Listen for password reset requests
    this.ipc.on('password:reset:request', async (data, meta) => {
      const { email } = data;

      console.log(`📨 Password reset request from ${meta.source}:`, { email });

      // Emit to Herald for email notification
      await this.ipc.emit('notification:trigger', {
        type: 'password_reset',
        email,
        userId: data.userId
      }, {
        target: 'exprsn-herald'
      });
    });
  }

  /**
   * Connect to Redis cache
   */
  async connectRedis() {
    try {
      const redisClient = require('./src/utils/redis');
      await redisClient.connect();

      if (redisClient.isEnabled && redisClient.isConnected) {
        console.log('✅ Redis cache connected');
      } else {
        console.log('⚠️  Redis caching disabled - continuing without caching');
      }
    } catch (error) {
      console.error('❌ Redis connection failed (continuing without cache):', error.message);
    }
  }

  /**
   * Connect to PostgreSQL database
   */
  async connectDatabase() {
    try {
      const dbConfig = this.config.database.postgres;

      this.db = new Sequelize({
        dialect: 'postgres',
        host: dbConfig.host,
        port: dbConfig.port,
        database: dbConfig.database,
        username: dbConfig.username,
        password: dbConfig.password,
        pool: dbConfig.pool,
        logging: dbConfig.logging ? console.log : false
      });

      await this.db.authenticate();
      console.log('✅ Database connection established');

      // Initialize models
      const models = require('./models');
      await models.init(this.db);

      // Sync database (in development)
      if (this.config.service.env === 'development') {
        await this.db.sync({ alter: true });
        console.log('✅ Database synchronized');
      }

    } catch (error) {
      console.error('❌ Database connection failed:', error);
      throw error;
    }
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());

    // CORS
    if (this.config.server.cors.enabled) {
      this.app.use(cors({
        origin: this.config.server.cors.origin,
        credentials: this.config.server.cors.credentials
      }));
    }

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Development bypass middleware (MUST come before auth middleware)
    this.app.use(bypassAll);

    // Make IPC available to all routes
    this.app.use((req, res, next) => {
      req.ipc = this.ipc;
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${req.method} ${req.path}`);
      next();
    });

    // Rate limiting
    if (this.config.security.rateLimitEnabled) {
      this.app.use(rateLimit({
        windowMs: this.config.security.rateLimitWindow,
        max: this.config.security.rateLimitMax
      }));
    }
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check (public)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        service: this.config.service.name,
        version: this.config.service.version,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      });
    });

    // Service info
    this.app.get('/api/info', (req, res) => {
      res.json({
        service: this.config.service.name,
        version: this.config.service.version,
        features: [
          'email-password-auth',
          'oauth-2.0',
          'saml-sso',
          'multi-factor-auth',
          'session-management',
          'password-policies'
        ]
      });
    });

    // Authentication routes (public)
    this.app.use('/api/auth', authRoutes);

    // SSO routes (public)
    this.app.use('/api/sso', ssoRoutes);

    // Session routes (require authentication)
    this.app.use('/api/sessions', authenticate(), sessionRoutes);

    // MFA routes (require authentication)
    this.app.use('/api/mfa', authenticate(), mfaRoutes);

    // Internal service routes (service-to-service)
    this.app.use('/api/internal', authenticateService(), (req, res) => {
      res.json({
        message: 'Internal API',
        service: req.service
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Endpoint not found',
        path: req.path
      });
    });
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    this.app.use((error, req, res, next) => {
      console.error('Error:', error);

      const status = error.status || 500;
      const message = error.message || 'Internal server error';

      res.status(status).json({
        error: error.code || 'SERVER_ERROR',
        message,
        ...(this.config.service.env === 'development' && { stack: error.stack })
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  /**
   * Start HTTPS server
   */
  async start() {
    const { port, host } = this.config.server;

    // Configure HTTPS server using HTTPSServerManager
    const serverManager = new HTTPSServerManager({
      serviceName: 'exprsn-auth',
      port: port || 3001,
      httpsPort: port || 3001,
      httpPort: (port || 3001) - 1, // HTTP on 3000 for redirect
      enableHTTP: true,
      redirectHTTP: true
    });

    const servers = await serverManager.start(this.app);
    this.server = servers.https || servers.http;
    const protocol = servers.https ? 'https' : 'http';

    console.log(`🚀 Authentication Service running on ${protocol}://${host}:${port}`);
    console.log(`📝 Environment: ${this.config.service.env}`);
    console.log(`🔐 CA URL: ${this.config.ca.baseUrl}`);
    console.log(`📡 IPC: Inter-service communication enabled`);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down Authentication Service...');

    if (this.ipc) {
      await this.ipc.disconnect();
      console.log('✅ IPC disconnected');
    }

    if (this.server) {
      this.server.close(() => {
        console.log('✅ HTTP server closed');
      });
    }

    if (this.db) {
      await this.db.close();
      console.log('✅ Database connection closed');
    }

    process.exit(0);
  }
}

// Start service
if (require.main === module) {
  new AuthService();
}

module.exports = AuthService;
