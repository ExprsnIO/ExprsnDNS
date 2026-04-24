'use strict';

/**
 * Migration: Create Revocation Lists Table
 * ═══════════════════════════════════════════════════════════════════════
 * CRL (Certificate Revocation List) generation and management
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('revocation_lists', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        allowNull: false
      },
      issuer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'certificates',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      sequence_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      this_update: {
        type: Sequelize.DATE,
        allowNull: false
      },
      next_update: {
        type: Sequelize.DATE,
        allowNull: false
      },
      revoked_certificates: {
        type: Sequelize.JSONB,
        defaultValue: [],
        allowNull: false
      },
      crl_pem: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      crl_der: {
        type: Sequelize.BLOB,
        allowNull: true
      },
      signature: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('current', 'superseded'),
        defaultValue: 'current',
        allowNull: false
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
    await queryInterface.addIndex('revocation_lists', ['issuer_id'], {
      name: 'revocation_lists_issuer_id_idx'
    });

    await queryInterface.addIndex('revocation_lists', ['sequence_number'], {
      name: 'revocation_lists_sequence_number_idx'
    });

    await queryInterface.addIndex('revocation_lists', ['status'], {
      name: 'revocation_lists_status_idx'
    });

    await queryInterface.addIndex('revocation_lists', ['next_update'], {
      name: 'revocation_lists_next_update_idx'
    });

    // Composite unique index
    await queryInterface.addIndex('revocation_lists', ['issuer_id', 'sequence_number'], {
      unique: true,
      name: 'revocation_lists_issuer_seq_unique_idx'
    });

    // GIN indexes
    await queryInterface.sequelize.query(
      'CREATE INDEX revocation_lists_revoked_certs_gin_idx ON revocation_lists USING GIN (revoked_certificates);'
    );

    await queryInterface.sequelize.query(
      'CREATE INDEX revocation_lists_metadata_gin_idx ON revocation_lists USING GIN (metadata);'
    );
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('revocation_lists');
  }
};
