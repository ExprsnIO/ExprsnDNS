/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn DNS - Service Entry Point
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Boots the authoritative DNS server (UDP/TCP) alongside an Express API
 * that exposes zone / record CRUD and a `/resolve` test endpoint.
 *
 * The service participates in the Exprsn ecosystem:
 *   - Authenticates API callers with JWTs minted by exprsn-auth.
 *   - Delegates TLS certificate issuance (for DoT/DoH) to exprsn-ca.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const config = require('./config');
const logger = require('./utils/logger');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { sequelize } = require('./models');
const { DnsServer } = require('./services/dnsServer');
const redis = require('./utils/redis');

async function createApp() {
  const app = express();

  app.set('trust proxy', config.app.trustProxy);

  app.use(helmet());
  app.use(cors({ origin: config.security.cors.origin, credentials: config.security.cors.credentials }));
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: config.app.bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.app.bodyLimit }));

  app.use(morgan(config.isProd ? 'combined' : 'dev', {
    stream: { write: (msg) => logger.info(msg.trim()) }
  }));

  app.use(rateLimit({
    windowMs: config.security.rateLimit.windowMs,
    max: config.security.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false
  }));

  app.use('/', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

async function start() {
  logger.info('Starting Exprsn DNS', { env: config.env });

  await sequelize.authenticate();
  logger.info('Database connected');

  if (process.env.DNS_DB_SYNC === 'true') {
    await sequelize.sync();
    logger.info('Database schema synced');
  }

  try {
    await redis.connect();
  } catch (err) {
    logger.warn('Redis connection failed; continuing without cache', { error: err.message });
  }

  const dnsServer = new DnsServer();
  try {
    await dnsServer.start();
  } catch (err) {
    logger.error('Failed to start DNS server', { error: err.message });
    if (config.isProd) throw err;
  }

  const app = await createApp();
  const apiServer = app.listen(config.app.port, config.app.host, () => {
    logger.info('Exprsn DNS API listening', {
      host: config.app.host,
      port: config.app.port
    });
  });

  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down`);
    try { await dnsServer.stop(); } catch (e) { logger.error('dnsServer.stop', { error: e.message }); }
    apiServer.close(() => logger.info('API server closed'));
    try { await sequelize.close(); } catch (e) { logger.error('sequelize.close', { error: e.message }); }
    try { await redis.disconnect(); } catch (e) { logger.error('redis.disconnect', { error: e.message }); }
    setTimeout(() => process.exit(0), 500).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return { app, apiServer, dnsServer };
}

if (require.main === module) {
  start().catch((err) => {
    logger.error('Fatal startup error', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

module.exports = { createApp, start };
