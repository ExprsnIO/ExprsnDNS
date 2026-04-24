'use strict';

/**
 * Migration: Create Certificates Table
 * ═══════════════════════════════════════════════════════════════════════
 * X.509 Certificates for CA token signing
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('certificates', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false
      },
      serial_number: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true
      },
      type: {
        type: Sequelize.ENUM('root', 'intermediate', 'entity', 'san', 'code_signing', 'client', 'server'),
        allowNull: false
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      issuer_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'certificates',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      common_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      subject_alternative_names: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: [],
        allowNull: true
      },
      organization: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      organizational_unit: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      country: {
        type: Sequelize.STRING(2),
        allowNull: true
      },
      state: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      locality: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      key_size: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      algorithm: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'RSA-SHA256'
      },
      public_key: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      private_key_encrypted: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      certificate_pem: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      certificate_der: {
        type: Sequelize.BLOB,
        allowNull: true
      },
      fingerprint: {
        type: Sequelize.STRING(64),
        allowNull: false,
        unique: true
      },
      not_before: {
        type: Sequelize.DATE,
        allowNull: false
      },
      not_after: {
        type: Sequelize.DATE,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('active', 'revoked', 'expired', 'suspended'),
        defaultValue: 'active',
        allowNull: false
      },
      revoked_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      revocation_reason: {
        type: Sequelize.ENUM(
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
        allowNull: true
      },
      storage_path: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {},
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create indexes
    await queryInterface.addIndex('certificates', ['serial_number'], {
      unique: true,
      name: 'certificates_serial_number_unique_idx'
    });

    await queryInterface.addIndex('certificates', ['fingerprint'], {
      unique: true,
      name: 'certificates_fingerprint_unique_idx'
    });

    await queryInterface.addIndex('certificates', ['user_id'], {
      name: 'certificates_user_id_idx'
    });

    await queryInterface.addIndex('certificates', ['issuer_id'], {
      name: 'certificates_issuer_id_idx'
    });

    await queryInterface.addIndex('certificates', ['type'], {
      name: 'certificates_type_idx'
    });

    await queryInterface.addIndex('certificates', ['status'], {
      name: 'certificates_status_idx'
    });

    await queryInterface.addIndex('certificates', ['not_before'], {
      name: 'certificates_not_before_idx'
    });

    await queryInterface.addIndex('certificates', ['not_after'], {
      name: 'certificates_not_after_idx'
    });

    await queryInterface.addIndex('certificates', ['common_name'], {
      name: 'certificates_common_name_idx'
    });

    // Composite index for active certificates within validity period
    await queryInterface.addIndex('certificates', ['status', 'not_before', 'not_after'], {
      name: 'certificates_active_validity_idx'
    });

    // GIN index for metadata and SAN array
    await queryInterface.sequelize.query(
      'CREATE INDEX certificates_metadata_gin_idx ON certificates USING GIN (metadata);'
    );

    await queryInterface.sequelize.query(
      'CREATE INDEX certificates_san_gin_idx ON certificates USING GIN (subject_alternative_names);'
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('certificates');
  }
};
