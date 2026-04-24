/**
 * Exprsn DNS - Authoritative Resolver
 *
 * Given a parsed DNS question, returns answer/authority/additional sections
 * drawn from the Zone + Record tables. Honors CNAME chains (up to a small
 * depth) and emits a SOA for NXDOMAIN / NODATA responses.
 */

const { Op } = require('sequelize');
const { Zone, Record } = require('../models');
const dnsName = require('../utils/dnsName');
const rdata = require('./rdata');
const cache = require('./cache');
const config = require('../config');
const logger = require('../utils/logger');

const MAX_CNAME_DEPTH = 8;

async function findZone(qname) {
  const labels = dnsName.normalize(qname).split('.');
  for (let i = 0; i < labels.length; i += 1) {
    const candidate = labels.slice(i).join('.');
    // eslint-disable-next-line no-await-in-loop
    const zone = await Zone.findOne({ where: { name: candidate, status: 'active' } });
    if (zone) return zone;
  }
  return null;
}

function soaAnswer(zone) {
  return {
    name: zone.name,
    type: 'SOA',
    class: 'IN',
    ttl: zone.minimum,
    primary: zone.primaryNs,
    admin: zone.adminEmail,
    serial: Number(zone.serial),
    refresh: zone.refresh,
    retry: zone.retry,
    expiration: zone.expire,
    minimum: zone.minimum
  };
}

async function loadRecords(zone, relName, type) {
  const where = { zoneId: zone.id, name: relName, disabled: false };
  if (type && type !== 'ANY') {
    where.type = type === 'CNAME' ? 'CNAME' : { [Op.in]: [type, 'CNAME'] };
  }
  return Record.findAll({ where, order: [['type', 'ASC'], ['priority', 'ASC']] });
}

/**
 * @returns {Promise<{rcode: string, answers: Array, authorities: Array, additionals: Array, cached: boolean}>}
 */
async function resolve({ name, type, class: qclass = 'IN' }) {
  const qname = dnsName.normalize(name);
  const qtype = (type || 'A').toUpperCase();

  const cached = await cache.get(qname, qtype, qclass);
  if (cached) {
    return { ...cached, cached: true };
  }

  const zone = await findZone(qname);
  if (!zone) {
    return { rcode: 'REFUSED', answers: [], authorities: [], additionals: [], cached: false };
  }

  const answers = [];
  const authorities = [];
  const additionals = [];

  let currentName = qname;
  let depth = 0;
  let foundAny = false;

  while (depth < MAX_CNAME_DEPTH) {
    const rel = dnsName.relativize(currentName, zone.name);
    // eslint-disable-next-line no-await-in-loop
    const rrs = await loadRecords(zone, rel, qtype);

    if (rrs.length === 0) break;
    foundAny = true;

    const cnames = rrs.filter((r) => r.type === 'CNAME');
    const matches = rrs.filter((r) => qtype === 'ANY' || r.type === qtype);

    matches.forEach((r) => {
      answers.push(rdata.recordToAnswer(r, currentName, zone.defaultTtl));
    });

    if (qtype !== 'CNAME' && cnames.length && matches.length === 0) {
      const cname = cnames[0];
      answers.push(rdata.recordToAnswer(cname, currentName, zone.defaultTtl));
      currentName = dnsName.normalize(cname.data?.domain ?? cname.rdata);
      depth += 1;
      if (!dnsName.isSubdomainOf(currentName, zone.name)) break;
      continue;
    }

    break;
  }

  let rcode = 'NOERROR';
  if (answers.length === 0) {
    rcode = foundAny ? 'NOERROR' : 'NXDOMAIN';
    authorities.push(soaAnswer(zone));
  } else if (qtype !== 'NS') {
    // include NS authority on positive answers for the apex
    const nsRows = await Record.findAll({
      where: { zoneId: zone.id, name: '@', type: 'NS', disabled: false },
      limit: 4
    });
    nsRows.forEach((r) => authorities.push(rdata.recordToAnswer(r, zone.name, zone.defaultTtl)));
  }

  const result = { rcode, answers, authorities, additionals, cached: false };

  const minTtl = answers.reduce(
    (acc, a) => Math.min(acc, a.ttl || zone.defaultTtl),
    zone.defaultTtl
  );
  const cacheTtl = rcode === 'NOERROR' ? minTtl : config.dns.negativeTtl;
  cache.set(qname, qtype, qclass, { rcode, answers, authorities, additionals }, cacheTtl)
    .catch((err) => logger.debug('cache.set failed', { error: err.message }));

  return result;
}

module.exports = { resolve, findZone };
