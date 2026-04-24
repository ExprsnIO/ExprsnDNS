/**
 * ═══════════════════════════════════════════════════════════════════════
 * HTTPS Server Utility
 * Creates HTTPS servers with TLS certificates for all services
 * ═══════════════════════════════════════════════════════════════════════
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class HTTPSServerManager {
  constructor(options = {}) {
    this.serviceName = options.serviceName || 'unknown';
    this.port = options.port || 3000;
    this.httpsPort = options.httpsPort || this.port;
    this.httpPort = options.httpPort;
    this.enableHTTP = options.enableHTTP !== false;
    this.redirectHTTP = options.redirectHTTP !== false;

    // TLS certificate paths
    this.certsDir = path.join(__dirname, '../../../certs');
    this.certPath = options.certPath || path.join(this.certsDir, `${this.serviceName}-cert.pem`);
    this.keyPath = options.keyPath || path.join(this.certsDir, `${this.serviceName}-key.pem`);

    // Fallback to localhost certificate
    if (!fs.existsSync(this.certPath)) {
      this.certPath = path.join(this.certsDir, 'localhost-cert.pem');
      this.keyPath = path.join(this.certsDir, 'localhost-key.pem');
    }

    // Check if TLS is enabled
    this.tlsEnabled = process.env.TLS_ENABLED !== 'false' &&
                      fs.existsSync(this.certPath) &&
                      fs.existsSync(this.keyPath);
  }

  /**
   * Create HTTPS server
   * @param {Express} app - Express application
   * @returns {https.Server} HTTPS server
   */
  createHTTPSServer(app) {
    if (!this.tlsEnabled) {
      logger.warn('TLS not enabled - certificates not found', {
        service: this.serviceName,
        certPath: this.certPath,
        keyPath: this.keyPath
      });
      return null;
    }

    try {
      const options = {
        key: fs.readFileSync(this.keyPath),
        cert: fs.readFileSync(this.certPath),

        // Security options
        honorCipherOrder: true,
        minVersion: 'TLSv1.2',

        // Reject unauthorized in production
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      };

      const server = https.createServer(options, app);

      logger.info('HTTPS server created', {
        service: this.serviceName,
        port: this.httpsPort,
        cert: path.basename(this.certPath)
      });

      return server;
    } catch (error) {
      logger.error('Failed to create HTTPS server', {
        service: this.serviceName,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Create HTTP server (with optional redirect to HTTPS)
   * @param {Express} app - Express application
   * @returns {http.Server} HTTP server
   */
  createHTTPServer(app) {
    if (!this.enableHTTP) {
      return null;
    }

    let httpApp = app;

    // Create redirect middleware if HTTPS is enabled
    if (this.tlsEnabled && this.redirectHTTP) {
      const express = require('express');
      httpApp = express();

      httpApp.use((req, res) => {
        const httpsUrl = `https://${req.hostname}:${this.httpsPort}${req.url}`;
        logger.debug('Redirecting HTTP -> HTTPS', {
          from: req.url,
          to: httpsUrl
        });
        res.redirect(301, httpsUrl);
      });
    }

    const server = http.createServer(httpApp);

    logger.info('HTTP server created', {
      service: this.serviceName,
      port: this.httpPort || this.port,
      redirect: this.tlsEnabled && this.redirectHTTP
    });

    return server;
  }

  /**
   * Start servers
   * @param {Express} app - Express application
   * @returns {Promise<Object>} Server instances
   */
  async start(app) {
    const servers = {};

    // Create HTTPS server if TLS is enabled
    if (this.tlsEnabled) {
      servers.https = this.createHTTPSServer(app);

      if (servers.https) {
        await new Promise((resolve, reject) => {
          servers.https.listen(this.httpsPort, (err) => {
            if (err) {
              reject(err);
            } else {
              logger.info(`${this.serviceName} HTTPS listening`, {
                port: this.httpsPort,
                url: `https://localhost:${this.httpsPort}`
              });
              resolve();
            }
          });
        });
      }
    }

    // Create HTTP server
    if (this.enableHTTP && this.httpPort) {
      servers.http = this.createHTTPServer(app);

      if (servers.http) {
        await new Promise((resolve, reject) => {
          servers.http.listen(this.httpPort, (err) => {
            if (err) {
              reject(err);
            } else {
              logger.info(`${this.serviceName} HTTP listening`, {
                port: this.httpPort,
                url: `http://localhost:${this.httpPort}`,
                redirect: this.tlsEnabled && this.redirectHTTP ? 'HTTPS' : 'none'
              });
              resolve();
            }
          });
        });
      }
    }

    // If no HTTPS and no separate HTTP port, use default HTTP
    if (!this.tlsEnabled && !this.httpPort) {
      servers.http = http.createServer(app);

      await new Promise((resolve, reject) => {
        servers.http.listen(this.port, (err) => {
          if (err) {
            reject(err);
          } else {
            logger.info(`${this.serviceName} HTTP listening`, {
              port: this.port,
              url: `http://localhost:${this.port}`
            });
            resolve();
          }
        });
      });
    }

    return servers;
  }

  /**
   * Get certificate information
   */
  getCertificateInfo() {
    if (!this.tlsEnabled) {
      return null;
    }

    try {
      const cert = fs.readFileSync(this.certPath, 'utf8');
      const forge = require('node-forge');
      const pki = forge.pki;

      const pemCert = pki.certificateFromPem(cert);

      return {
        subject: pemCert.subject.attributes.reduce((obj, attr) => {
          obj[attr.name || attr.shortName] = attr.value;
          return obj;
        }, {}),
        issuer: pemCert.issuer.attributes.reduce((obj, attr) => {
          obj[attr.name || attr.shortName] = attr.value;
          return obj;
        }, {}),
        validFrom: pemCert.validity.notBefore,
        validTo: pemCert.validity.notAfter,
        serialNumber: pemCert.serialNumber
      };
    } catch (error) {
      logger.error('Failed to read certificate info', {
        error: error.message
      });
      return null;
    }
  }
}

/**
 * Helper function to create and start servers
 */
async function createServers(app, options) {
  const manager = new HTTPSServerManager(options);
  return manager.start(app);
}

module.exports = {
  HTTPSServerManager,
  createServers
};
