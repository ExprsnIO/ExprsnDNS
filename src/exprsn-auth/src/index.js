/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Auth Service
 * Authentication & Authorization Service for Exprsn Ecosystem
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const expressLayouts = require('express-ejs-layouts');
const { createLogger } = require('@exprsn/shared');
const { errorHandler, notFoundHandler } = require('@exprsn/shared');
const { initRedisClient } = require('@exprsn/shared');
const config = require('./config');
const db = require('./models');
const caService = require('./services/caService');

// Routes
const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const groupRoutes = require('./routes/groups');
const tokenRoutes = require('./routes/tokens');
const oauth2Routes = require('./routes/oauth2');
const mfaRoutes = require('./routes/mfa');
const sessionRoutes = require('./routes/sessions');
const healthRoutes = require('./routes/health');
const organizationRoutes = require('./routes/organizations');
const applicationRoutes = require('./routes/applications');
const roleRoutes = require('./routes/roles');
const oidcRoutes = require('./routes/oidc');
const samlRoutes = require('./routes/saml');
const adminRoutes = require('./routes/admin');
const setupRoutes = require('./routes/setup');

// Logger
const logger = createLogger('exprsn-auth');

// Express app
const app = express();

/**
 * ═══════════════════════════════════════════════════════════
 * Middleware
 * ═══════════════════════════════════════════════════════════
 */

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      "style-src": ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      "font-src": ["'self'", "cdn.jsdelivr.net"]
    }
  }
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// View engine configuration
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/admin');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Make current path available to all views
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'exprsn-auth-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: parseInt(process.env.SESSION_LIFETIME) || 3600000 // 1 hour
  }
}));

// Flash messages
app.use(flash());

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());
require('./config/passport')(passport);

// Request logging
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    userId: req.user?.id
  });
  next();
});

/**
 * ═══════════════════════════════════════════════════════════
 * Routes
 * ═══════════════════════════════════════════════════════════
 */

// Health check (always public)
app.use('/health', healthRoutes);

// OIDC well-known endpoints
app.use(oidcRoutes);

// Public web pages (login, register, dashboard, etc.)
app.use(publicRoutes);

// Admin interface
app.use('/admin', adminRoutes);

// Setup interface
app.use('/setup', setupRoutes);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/mfa', mfaRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/tokens', tokenRoutes);
app.use('/api/oauth2', oauth2Routes);
app.use('/api/saml', samlRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/config', require('./routes/config'));

/**
 * ═══════════════════════════════════════════════════════════
 * Error Handling
 * ═══════════════════════════════════════════════════════════
 */

app.use(notFoundHandler);
app.use(errorHandler);

/**
 * ═══════════════════════════════════════════════════════════
 * Server Initialization
 * ═══════════════════════════════════════════════════════════
 */

async function startServer() {
  try {
    // Initialize CA service integration
    const caRequired = process.env.CA_REQUIRED === 'true';
    const caWait = process.env.CA_WAIT !== 'false'; // Default to true

    try {
      const caStatus = await caService.initialize({
        required: caRequired,
        wait: caWait,
        maxAttempts: parseInt(process.env.CA_MAX_ATTEMPTS) || 10
      });

      if (caStatus.configured) {
        if (caStatus.available) {
          logger.info('CA service integration initialized successfully');
        } else {
          logger.warn('CA service is configured but not available');
        }
      } else {
        logger.info('CA service not configured, running without CA integration');
      }
    } catch (error) {
      logger.error('CA service initialization failed', { error: error.message });
      if (caRequired) {
        throw error;
      }
    }

    // Initialize Redis if enabled
    if (process.env.REDIS_ENABLED === 'true') {
      await initRedisClient();
      logger.info('Redis client initialized');
    }

    // Sync database
    await db.sequelize.authenticate();
    logger.info('Database connection established');

    // Sync models (in development)
    // Temporarily disabled due to LDAP config sync issue
    // if (process.env.NODE_ENV === 'development') {
    //   await db.sequelize.sync({ alter: true });
    //   logger.info('Database models synchronized');
    // }

    // Initialize system data (permissions and roles)
    await db.initializeSystemData();
    logger.info('System data initialized');

    // Configure server (HTTP or HTTPS)
    const port = process.env.AUTH_SERVICE_PORT || 3001;
    const tlsEnabled = process.env.TLS_ENABLED === 'true';
    let server;

    if (tlsEnabled) {
      // Load TLS certificates
      const certPath = process.env.TLS_CERT_PATH || path.join(__dirname, '../certs/localhost-cert.pem');
      const keyPath = process.env.TLS_KEY_PATH || path.join(__dirname, '../certs/localhost-key.pem');

      if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        logger.error('TLS certificates not found', { certPath, keyPath });
        logger.info('Falling back to HTTP mode');
        server = http.createServer(app);
      } else {
        const tlsOptions = {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath)
        };

        server = https.createServer(tlsOptions, app);
        logger.info('TLS/HTTPS mode enabled');
      }
    } else {
      server = http.createServer(app);
      logger.info('HTTP mode (TLS disabled)');
    }

    // Start server
    server.listen(port, () => {
      const protocol = tlsEnabled && server instanceof https.Server ? 'https' : 'http';
      logger.info(`Exprsn Auth service listening on ${protocol}://localhost:${port}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`OIDC Issuer: ${process.env.OIDC_ISSUER || `${protocol}://localhost:${port}`}`);
      logger.info(`Setup page: ${protocol}://localhost:${port}/setup`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await db.sequelize.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await db.sequelize.close();
  process.exit(0);
});

// Start server
startServer();

module.exports = app;
