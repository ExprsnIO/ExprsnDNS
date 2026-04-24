/**
 * ═══════════════════════════════════════════════════════════════════════
 * Certificate Model - X.509 Certificates
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const Certificate = sequelize.define('Certificate', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    serialNumber: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      field: 'serial_number'
    },
    type: {
      type: DataTypes.ENUM('root', 'intermediate', 'entity', 'san', 'code_signing', 'client', 'server'),
      allowNull: false
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
      references: {
        model: 'users',
        key: 'id'
      }
    },
    issuerId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'issuer_id',
      references: {
        model: 'certificates',
        key: 'id'
      },
      comment: 'The certificate that signed this certificate'
    },
    commonName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'common_name'
    },
    subjectAlternativeNames: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      field: 'subject_alternative_names'
    },
    organization: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    organizationalUnit: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'organizational_unit'
    },
    country: {
      type: DataTypes.STRING(2),
      allowNull: true
    },
    state: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    locality: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    keySize: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'key_size'
    },
    algorithm: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'RSA-SHA256'
    },
    publicKey: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'public_key',
      comment: 'PEM-encoded public key'
    },
    privateKeyEncrypted: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'private_key_encrypted',
      comment: 'Encrypted private key (only for user certificates)'
    },
    certificatePem: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: 'certificate_pem',
      comment: 'PEM-encoded certificate'
    },
    certificateDer: {
      type: DataTypes.BLOB,
      allowNull: true,
      field: 'certificate_der',
      comment: 'DER-encoded certificate'
    },
    fingerprint: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      comment: 'SHA-256 fingerprint of the certificate'
    },
    notBefore: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'not_before'
    },
    notAfter: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'not_after'
    },
    status: {
      type: DataTypes.ENUM('active', 'revoked', 'expired', 'suspended'),
      defaultValue: 'active',
      allowNull: false
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'revoked_at'
    },
    revocationReason: {
      type: DataTypes.ENUM(
        'unspecified',
        'keyCompromise',
        'caCompromise',
        'affiliationChanged',
        'superseded',
        'cessationOfOperation',
        'certificateHold',
        'removeFromCRL',
        'privilegeWithdrawn',
        'aaCompromise'
      ),
      allowNull: true,
      field: 'revocation_reason'
    },
    // Storage location (for external storage like S3)
    storagePath: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'storage_path'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  }, {
    tableName: 'certificates',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['serial_number'], unique: true },
      { fields: ['fingerprint'], unique: true },
      { fields: ['user_id'] },
      { fields: ['issuer_id'] },
      { fields: ['type'] },
      { fields: ['status'] },
      { fields: ['not_before'] },
      { fields: ['not_after'] },
      { fields: ['common_name'] }
    ]
  });

  // Instance methods
  Certificate.prototype.isExpired = function() {
    return new Date() > this.notAfter;
  };

  Certificate.prototype.isValid = function() {
    const now = new Date();
    return this.status === 'active' && now >= this.notBefore && now <= this.notAfter;
  };

  Certificate.prototype.revoke = async function(reason = 'unspecified') {
    this.status = 'revoked';
    this.revokedAt = new Date();
    this.revocationReason = reason;
    return this.save();
  };

  return Certificate;
};
