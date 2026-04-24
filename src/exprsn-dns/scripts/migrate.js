/**
 * Exprsn DNS - Migration runner
 *
 * Creates/updates all tables managed by this service. Uses sequelize.sync
 * for simplicity; swap in umzug if you need versioned migrations.
 */

const { sequelize } = require('../models');
const logger = require('../utils/logger');

async function main() {
  const alter = process.argv.includes('--alter');
  const force = process.argv.includes('--force');
  logger.info('Running migration', { alter, force });
  await sequelize.authenticate();
  await sequelize.sync({ alter, force });
  logger.info('Migration complete');
  await sequelize.close();
}

main().catch((err) => {
  logger.error('Migration failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
