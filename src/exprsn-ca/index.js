/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Certificate Authority - Main Application
 * ═══════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const morgan = require('morgan');
const expressLayouts = require('express-ejs-layouts');
const config = require('./config');
const logger = require('./utils/logger');
const db = require('./models');
const { getStorage } = require('./storage');
const { HTTPSServerManager } = require('../shared/utils/httpsServer');
const IPCWorker = require('../shared/ipc/IPCWorker');
const { bypassAll, logBypassStatus } = require('../shared/middleware/devBypass');

// ═══════════════════════════════════════════════════════════════════════
// Initialize Express Application
// ═══════════════════════════════════════════════════════════════════════

const app = express();

// Log bypass status on startup
logBypassStatus();

// Initialize IPC Worker
const ipc = new IPCWorker({
  serviceName: 'exprsn-ca',
  namespace: 'ipc'
});

// IPC Event Handlers
ipc.on('ready', () => {
  logger.info('IPC Worker ready for inter-service communication');
});

ipc.on('error', (error) => {
  logger.error('IPC Worker error', {
    error: error.message,
    stack: error.stack
  });
});

// Listen for certificate validation requests from other services
ipc.on('cert:validate', async (data, meta) => {
  const { certificateId, serialNumber } = data;

  logger.debug('Certificate validation request received', {
    certificateId,
    serialNumber,
    source: meta.source
  });

  try {
    const { Certificate } = require('./models');
    const cert = certificateId
      ? await Certificate.findByPk(certificateId)
      : await Certificate.findOne({ where: { serialNumber } });

    await ipc.emit('cert:validated', {
      certificateId: cert?.id,
      serialNumber: cert?.serialNumber,
      valid: cert && cert.status === 'active',
      status: cert?.status,
      notBefore: cert?.notBefore,
      notAfter: cert?.notAfter
    }, {
      target: meta.source
    });
  } catch (error) {
    logger.error('Certificate validation failed', { error: error.message });
    await ipc.emit('cert:validated', {
      certificateId,
      serialNumber,
      valid: false,
      error: error.message
    }, {
      target: meta.source
    });
  }
});

// Listen for token validation requests
ipc.on('token:validate', async (data, meta) => {
  const { tokenId } = data;

  logger.debug('Token validation request received', {
    tokenId,
    source: meta.source
  });

  try {
    const { Token } = require('./models');
    const token = await Token.findByPk(tokenId);

    await ipc.emit('token:validated', {
      tokenId,
      valid: token && token.status === 'active' && new Date() < new Date(token.expiresAt),
      status: token?.status,
      expiresAt: token?.expiresAt,
      permissions: token?.permissions
    }, {
      target: meta.source
    });
  } catch (error) {
    logger.error('Token validation failed', { error: error.message });
    await ipc.emit('token:validated', {
      tokenId,
      valid: false,
      error: error.message
    }, {
      target: meta.source
    });
  }
});

// ───────────────────────────────────────────────────────────────────────
// View Engine Setup
// ───────────────────────────────────────────────────────────────────────

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configure EJS layouts
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// ───────────────────────────────────────────────────────────────────────
// Middleware
// ───────────────────────────────────────────────────────────────────────

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"] // Allow WebSocket connections
    }
  }
}));

// CORS
app.use(cors({
  origin: config.app.env === 'production' ? config.ca.domain : '*',
  credentials: true
}));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Static files
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use('/bootstrap', express.static(path.join(__dirname, '../../node_modules/bootstrap/dist')));

// Session middleware (store reference for socket.io)
const sessionMiddleware = session({
  store: new pgSession({
    pool: db.sequelize.connectionManager.pool,
    tableName: 'sessions'
  }),
  secret: config.session.secret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: config.session.secure,
    httpOnly: true,
    maxAge: config.session.maxAge,
    sameSite: config.session.sameSite
  }
});

app.use(sessionMiddleware);

// Development bypass middleware (MUST come before auth middleware)
app.use(bypassAll);

// Make IPC available to all routes
app.use((req, res, next) => {
  req.ipc = ipc;
  next();
});

// Logging
if (config.app.env === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: { write: message => logger.info(message.trim()) }
  }));
}

// Request ID and user context
app.use((req, res, next) => {
  req.id = require('uuid').v4();
  req.logger = logger.child({ requestId: req.id });
  next();
});

// Attach user to res.locals for all views
const { attachUserToLocals } = require('./middleware/auth');
app.use(attachUserToLocals);

// ───────────────────────────────────────────────────────────────────────
// Routes
// ───────────────────────────────────────────────────────────────────────

// Setup wizard (must be first, before setup check middleware)
app.use('/setup', require('./routes/setup'));

// Setup check middleware (redirects to setup if not complete)
const setupCheck = require('./middleware/setupCheck');
app.use(setupCheck);

// Application routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/ca', require('./routes/ca'));
app.use('/certificates', require('./routes/certificates'));
app.use('/tokens', require('./routes/tokens'));
app.use('/users', require('./routes/users'));
app.use('/groups', require('./routes/groups'));
app.use('/roles', require('./routes/roles'));
app.use('/tickets', require('./routes/tickets'));
app.use('/ocsp', require('./routes/ocsp'));
app.use('/crl', require('./routes/crl'));
app.use('/api', require('./routes/api'));
app.use('/api/config', require('./routes/config'));
app.use('/admin', require('./routes/admin'));

// ───────────────────────────────────────────────────────────────────────
// Error Handling
// ───────────────────────────────────────────────────────────────────────

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Page Not Found',
    message: 'The page you are looking for does not exist.',
    error: { status: 404 }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  // Use req.logger if available, otherwise fallback to global logger
  const errorLogger = req.logger || logger;
  errorLogger.error('Application error:', err);

  const status = err.status || 500;
  const message = config.app.env === 'development' ? err.message : 'Internal Server Error';

  if (req.accepts('html')) {
    res.status(status).render('error', {
      title: 'Error',
      message,
      error: config.app.env === 'development' ? err : {}
    });
  } else {
    res.status(status).json({
      error: {
        status,
        message,
        ...(config.app.env === 'development' && { stack: err.stack })
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Application Initialization
// ═══════════════════════════════════════════════════════════════════════

async function initialize() {
  try {
    logger.info('Initializing Exprsn Certificate Authority...');

    // Check if setup is complete
    const setupService = require('./services/setup');
    const setupComplete = await setupService.isSetupComplete();

    if (!setupComplete) {
      logger.warn('Setup not complete - running in setup mode');
      logger.warn('Please visit /setup to complete initial configuration');
      return; // Skip full initialization
    }

    // Validate configuration
    const configErrors = config.validate();
    if (configErrors.length > 0) {
      logger.warn('Configuration warnings:', configErrors);
    }

    // Initialize Redis cache
    logger.info('Connecting to Redis cache...');
    const redisClient = require('./utils/redis');
    await redisClient.connect();
    if (redisClient.isEnabled && redisClient.isConnected) {
      logger.info('Redis cache connected successfully');
    } else {
      logger.warn('Redis cache disabled or unavailable - continuing without caching');
    }

    // Initialize database
    logger.info('Connecting to database...');
    await db.sequelize.authenticate();
    logger.info('Database connected successfully');

    // Sync database models (use migrations in production)
    // NOTE: Disabled auto-sync since schema is managed via database/schema.sql
    // if (config.app.env === 'development') {
    //   await db.sequelize.sync({ alter: true });
    //   logger.info('Database models synchronized');
    // }
    logger.info('Using existing database schema from database/schema.sql');

    // Initialize storage
    logger.info('Initializing storage layer...');
    const storage = getStorage();
    await storage.initialize();
    logger.info('Storage initialized successfully');

    // Check and auto-generate root CA certificate if missing
    logger.info('Checking for root CA certificate...');
    const { Certificate } = require('./models');
    const rootCert = await Certificate.findOne({
      where: { type: 'root', status: 'active' }
    });

    if (!rootCert) {
      logger.warn('Root CA certificate not found. Auto-generating...');
      try {
        const crypto = require('./crypto');
        const certData = await crypto.generateRootCertificate({
          commonName: config.ca.name || 'Exprsn Root CA',
          country: config.ca.country || 'US',
          state: config.ca.state || '',
          locality: config.ca.locality || '',
          organization: config.ca.organization || 'Exprsn',
          organizationalUnit: config.ca.organizationalUnit || 'Certificate Authority',
          email: config.ca.email || 'ca@exprsn.io',
          keySize: 4096,
          validityDays: 7300 // 20 years
        });

        const newRootCert = await Certificate.create({
          serialNumber: certData.serialNumber,
          type: 'root',
          userId: null, // System-generated
          issuerId: null, // Self-signed
          commonName: config.ca.name || 'Exprsn Root CA',
          organization: config.ca.organization || 'Exprsn',
          organizationalUnit: config.ca.organizationalUnit || 'Certificate Authority',
          country: config.ca.country || 'US',
          state: config.ca.state || '',
          locality: config.ca.locality || '',
          email: config.ca.email || 'ca@exprsn.io',
          keySize: 4096,
          algorithm: 'RSA-SHA256',
          publicKey: certData.publicKey,
          certificatePem: certData.certificate,
          fingerprint: certData.fingerprint,
          notBefore: certData.notBefore,
          notAfter: certData.notAfter,
          status: 'active',
          storagePath: `certs/${certData.serialNumber}.pem`
        });

        // Save certificate and private key to storage
        await storage.saveCertificate(newRootCert.id, certData.certificate);
        await storage.savePrivateKey(newRootCert.id, certData.privateKey);

        logger.info('Root CA certificate auto-generated successfully', {
          id: newRootCert.id,
          serialNumber: newRootCert.serialNumber,
          commonName: newRootCert.commonName
        });
      } catch (error) {
        logger.error('Failed to auto-generate root CA certificate:', error);
        logger.warn('CRL and OCSP services may not function until root CA is manually created');
      }
    } else {
      logger.info('Root CA certificate found', {
        id: rootCert.id,
        serialNumber: rootCert.serialNumber
      });
    }

    // Initialize services
    logger.info('Initializing services...');
    try {
      await require('./services/crl').initialize();
      logger.info('CRL service initialized successfully');
    } catch (error) {
      logger.warn('CRL service initialization failed (will retry when root cert is available):', error.message);
    }
    logger.info('Services initialized successfully');

    logger.info('Exprsn Certificate Authority initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize application:', error);

    // Check if this is a setup-related error
    const setupService = require('./services/setup');
    const setupComplete = await setupService.isSetupComplete();

    if (!setupComplete) {
      logger.warn('Setup not complete - some initialization errors are expected');
      logger.warn('Please visit /setup to complete initial configuration');
    } else {
      // If setup is complete but initialization failed, this is a real error
      process.exit(1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════════════════════════

async function start() {
  await initialize();

  // Configure HTTPS server using HTTPSServerManager
  const serverManager = new HTTPSServerManager({
    serviceName: 'exprsn-ca',
    port: config.app.port || 3000,
    httpsPort: config.app.port || 3000,
    httpPort: (config.app.port || 3000) + 9, // HTTP on 3009 for redirect
    enableHTTP: true,
    redirectHTTP: true
  });

  const servers = await serverManager.start(app);
  const server = servers.https || servers.http;
  const protocol = servers.https ? 'https' : 'http';

  // Initialize Socket.IO on the main server
  const socketService = require('./services/socket');
  socketService.initialize(server, sessionMiddleware);
  logger.info('Socket.IO initialized');

  // Serve socket.io client library
  app.use('/socket.io', express.static(path.join(__dirname, '../../node_modules/socket.io/client-dist')));

  logger.info(`Environment: ${config.app.env}`);
  logger.info(`Storage: ${config.storage.type}`);
  logger.info(`Socket.IO: WebSocket support enabled`);
  logger.info(`IPC: Inter-service communication enabled`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    if (ipc) await ipc.disconnect();
    server.close(async () => {
      await db.sequelize.close();
      logger.info('Server shut down successfully');
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully...');
    if (ipc) await ipc.disconnect();
    server.close(async () => {
      await db.sequelize.close();
      logger.info('Server shut down successfully');
      process.exit(0);
    });
  });

  return server;
}

// Start if not required as module
if (require.main === module) {
  start().catch(error => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

module.exports = app;
module.exports.start = start;
