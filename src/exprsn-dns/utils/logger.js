/**
 * Exprsn DNS - Winston Logger
 */

const winston = require('winston');
const config = require('../config');

const { combine, timestamp, errors, splat, json, printf, colorize } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}] ${stack || message}${metaStr}`;
});

const logger = winston.createLogger({
  level: config.logging.level,
  format: combine(
    errors({ stack: true }),
    splat(),
    timestamp(),
    config.logging.format === 'json' ? json() : combine(colorize(), devFormat)
  ),
  defaultMeta: { service: 'exprsn-dns' },
  transports: [new winston.transports.Console()]
});

module.exports = logger;
