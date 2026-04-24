/**
 * ═══════════════════════════════════════════════════════════════════════
 * RevocationList Model - Certificate Revocation List (CRL) entries
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const RevocationList = sequelize.define('RevocationList', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    certificateId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'certificate_id',
      references: {
        model: 'certificates',
        key: 'id'
      }
    },
    serialNumber: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'serial_number'
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'revoked_at'
    },
    reason: {
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
      allowNull: false,
      defaultValue: 'unspecified'
    },
    invalidityDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'invalidity_date',
      comment: 'Date when certificate became invalid (optional)'
    },
    issuerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'issuer_id',
      comment: 'CA certificate that issued the revoked certificate'
    },
    crlNumber: {
      type: DataTypes.BIGINT,
      allowNull: true,
      field: 'crl_number',
      comment: 'CRL sequence number this entry was published in'
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
    tableName: 'revocation_lists',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['certificate_id'] },
      { fields: ['serial_number'] },
      { fields: ['issuer_id'] },
      { fields: ['revoked_at'] },
      { fields: ['crl_number'] },
      { fields: ['reason'] }
    ]
  });

  return RevocationList;
};
