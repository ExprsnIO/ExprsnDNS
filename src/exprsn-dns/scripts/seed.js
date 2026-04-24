/**
 * Exprsn DNS - Seed data
 */

const { sequelize, Zone, Record } = require('../models');
const rdataSvc = require('../services/rdata');
const logger = require('../utils/logger');

async function main() {
  await sequelize.authenticate();

  const [zone] = await Zone.findOrCreate({
    where: { name: 'exprsn.local' },
    defaults: {
      name: 'exprsn.local',
      kind: 'primary',
      primaryNs: 'ns1.exprsn.local',
      adminEmail: 'hostmaster.exprsn.local',
      defaultTtl: 3600,
      refresh: 3600,
      retry: 1800,
      expire: 604800,
      minimum: 300,
      metadata: { seeded: true }
    }
  });

  const seeds = [
    { name: '@', type: 'NS', rdata: 'ns1.exprsn.local' },
    { name: '@', type: 'NS', rdata: 'ns2.exprsn.local' },
    { name: 'ns1', type: 'A', rdata: '10.0.0.1' },
    { name: 'ns2', type: 'A', rdata: '10.0.0.2' },
    { name: '@', type: 'A', rdata: '10.0.0.10' },
    { name: 'www', type: 'CNAME', rdata: 'exprsn.local' },
    { name: 'ca', type: 'A', rdata: '10.0.0.20' },
    { name: 'auth', type: 'A', rdata: '10.0.0.21' },
    { name: '@', type: 'MX', rdata: '10 mail.exprsn.local' },
    { name: 'mail', type: 'A', rdata: '10.0.0.30' },
    { name: '@', type: 'TXT', rdata: '"v=spf1 mx -all"' }
  ];

  for (const s of seeds) {
    const { rdata, data } = rdataSvc.normalizeRdata(s.type, s.rdata);
    // eslint-disable-next-line no-await-in-loop
    await Record.findOrCreate({
      where: { zoneId: zone.id, name: s.name, type: s.type, rdata },
      defaults: { zoneId: zone.id, name: s.name, type: s.type, rdata, data, class: 'IN' }
    });
  }

  logger.info('Seed complete', { zone: zone.name });
  await sequelize.close();
}

main().catch((err) => {
  logger.error('Seed failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
