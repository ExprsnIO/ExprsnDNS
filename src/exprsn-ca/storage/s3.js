/**
 * ═══════════════════════════════════════════════════════════════════════
 * S3 Storage Adapter
 * ═══════════════════════════════════════════════════════════════════════
 */

const AWS = require('aws-sdk');

class S3Storage {
  constructor(config) {
    this.bucket = config.bucket;
    this.prefix = config.prefix;

    this.s3 = new AWS.S3({
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    });
  }

  async initialize() {
    // Verify bucket exists
    try {
      await this.s3.headBucket({ Bucket: this.bucket }).promise();
    } catch (error) {
      throw new Error(`S3 bucket ${this.bucket} not accessible: ${error.message}`);
    }
  }

  async saveCertificate(id, data) {
    const key = `${this.prefix}certs/${id}.pem`;
    await this.s3.putObject({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: 'application/x-pem-file'
    }).promise();
    return key;
  }

  async getCertificate(id) {
    const key = `${this.prefix}certs/${id}.pem`;
    const result = await this.s3.getObject({
      Bucket: this.bucket,
      Key: key
    }).promise();
    return result.Body.toString('utf8');
  }

  async savePrivateKey(id, data) {
    const key = `${this.prefix}keys/${id}.key`;
    await this.s3.putObject({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: 'application/x-pem-file',
      ServerSideEncryption: 'AES256' // Encrypt at rest
    }).promise();
    return key;
  }

  async getPrivateKey(id) {
    const key = `${this.prefix}keys/${id}.key`;
    const result = await this.s3.getObject({
      Bucket: this.bucket,
      Key: key
    }).promise();
    return result.Body.toString('utf8');
  }

  async saveCRL(data) {
    const key = `${this.prefix}crl/ca.crl`;
    await this.s3.putObject({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: 'application/pkix-crl'
    }).promise();
    return key;
  }

  async getCRL() {
    const key = `${this.prefix}crl/ca.crl`;
    const result = await this.s3.getObject({
      Bucket: this.bucket,
      Key: key
    }).promise();
    return result.Body;
  }

  async deleteCertificate(id) {
    const key = `${this.prefix}certs/${id}.pem`;
    await this.s3.deleteObject({
      Bucket: this.bucket,
      Key: key
    }).promise();
  }

  async deletePrivateKey(id) {
    const key = `${this.prefix}keys/${id}.key`;
    await this.s3.deleteObject({
      Bucket: this.bucket,
      Key: key
    }).promise();
  }
}

module.exports = S3Storage;
