/**
 * ═══════════════════════════════════════════════════════════
 * Logger Utility
 * Winston-based structured logging for Exprsn services
 * ═══════════════════════════════════════════════════════════
 */

const winston = require('winston');
const path = require('path');

/**
 * Create logger for a service
 * @param {string} serviceName - Name of the service
 * @returns {winston.Logger}
 */
function createLogger(serviceName = 'exprsn') {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const logDir = process.env.LOG_DIR || './logs';

  const logger = winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: serviceName },
    transports: [
      // Console transport
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ level, message, timestamp, service, ...meta }) => {
            let msg = `${timestamp} [${service}] ${level}: ${message}`;
            if (Object.keys(meta).length > 0) {
              msg += ` ${JSON.stringify(meta)}`;
            }
            return msg;
          })
        )
      }),
      // File transport for all logs
      new winston.transports.File({
        filename: path.join(logDir, `${serviceName}.log`),
        maxsize: 10485760, // 10MB
        maxFiles: 5
      }),
      // File transport for errors
      new winston.transports.File({
        filename: path.join(logDir, `${serviceName}.error.log`),
        level: 'error',
        maxsize: 10485760,
        maxFiles: 5
      })
    ]
  });

  return logger;
}

// Default logger
const logger = createLogger();

module.exports = logger;
module.exports.createLogger = createLogger;
