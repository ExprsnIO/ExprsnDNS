/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Certificate Authority - Cluster Mode
 * ═══════════════════════════════════════════════════════════════════════
 */

const cluster = require('cluster');
const os = require('os');
const config = require('./config');
const logger = require('./utils/logger');

if (cluster.isMaster) {
  const numWorkers = config.app.cluster.workers || os.cpus().length;

  logger.info(`Master process ${process.pid} is running`);
  logger.info(`Starting ${numWorkers} worker processes...`);

  // Fork workers
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork();
  }

  // Handle worker events
  cluster.on('online', (worker) => {
    logger.info(`Worker ${worker.process.pid} is online`);
  });

  cluster.on('exit', (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died (${signal || code})`);
    logger.info('Starting a new worker...');
    cluster.fork();
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down master process...');

    for (const id in cluster.workers) {
      cluster.workers[id].kill();
    }

    process.exit(0);
  });

} else {
  // Worker process
  const app = require('./index');

  app.start().catch(error => {
    logger.error(`Worker ${process.pid} failed to start:`, error);
    process.exit(1);
  });
}
