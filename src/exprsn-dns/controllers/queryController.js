/**
 * Exprsn DNS - Query Controller (HTTP DNS-style lookup)
 *
 * Provides a JSON `/resolve` endpoint that runs the authoritative resolver.
 * Handy for smoke-tests and administrative checks when you don't want to
 * shell out to dig.
 */

const resolver = require('../services/resolver');
const dnsName = require('../utils/dnsName');

async function resolve(req, res, next) {
  try {
    const { name, type = 'A', class: qclass = 'IN' } = req.query;
    if (!name || !dnsName.isValid(name)) {
      return res.status(400).json({ error: 'bad_request', message: 'Invalid or missing name' });
    }
    const result = await resolver.resolve({ name, type, class: qclass });
    res.json({
      question: { name: dnsName.normalize(name), type: type.toUpperCase(), class: qclass },
      ...result
    });
  } catch (err) { next(err); }
}

module.exports = { resolve };
