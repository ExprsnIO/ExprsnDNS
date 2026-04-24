/**
 * ═══════════════════════════════════════════════════════════════════════
 * Winston Logger Configuration
 * ═══════════════════════════════════════════════════════════════════════
 */

const winston = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Create logs directory if it doesn't exist
const logsDir = path.dirname(config.logging.file.path);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`;
    }
    return msg;
  })
);

// Define transports
const transports = [
  new winston.transports.Console({
    format: config.app.env === 'development' ? consoleFormat : logFormat,
    level: config.logging.level
  })
];

// Add file transport if enabled
if (config.logging.file.enabled) {
  transports.push(
    new winston.transports.File({
      filename: config.logging.file.path,
      format: logFormat,
      level: config.logging.level,
      maxsize: parseSize(config.logging.file.maxSize),
      maxFiles: config.logging.file.maxFiles,
      tailable: true,
      zippedArchive: config.logging.file.compress
    })
  );

  // Separate error log
  transports.push(
    new winston.transports.File({
      filename: config.logging.file.path.replace('.log', '.error.log'),
      format: logFormat,
      level: 'error',
      maxsize: parseSize(config.logging.file.maxSize),
      maxFiles: config.logging.file.maxFiles,
      tailable: true,
      zippedArchive: config.logging.file.compress
    })
  );
}

// Create logger
const logger = winston.createLogger({
  format: logFormat,
  transports,
  exitOnError: false
});

// Helper function to parse size strings
function parseSize(size) {
  if (typeof size === 'number') return size;
  const units = { k: 1024, m: 1024 * 1024, g: 1024 * 1024 * 1024 };
  const match = size.match(/^(\d+)([kmg])?$/i);
  if (!match) return 10 * 1024 * 1024; // Default 10MB
  return parseInt(match[1]) * (units[match[2]?.toLowerCase()] || 1);
}

module.exports = logger;
