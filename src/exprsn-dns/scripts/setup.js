/**
 * Exprsn DNS - Combined setup: migrate + seed
 */

const logger = require('../utils/logger');

async function main() {
  require('./migrate');
  await new Promise((r) => setTimeout(r, 200));
  require('./seed');
}

main().catch((err) => {
  logger.error('Setup failed', { error: err.message });
  process.exit(1);
});
