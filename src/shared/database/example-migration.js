/**
 * ═══════════════════════════════════════════════════════════════════════
 * Example Migration - Cross-Database Compatible
 * ═══════════════════════════════════════════════════════════════════════
 *
 * This migration demonstrates how to write database migrations that work
 * with both PostgreSQL and SQLite using the migration helper utilities.
 *
 * Copy this pattern to your actual migrations in:
 * src/exprsn-{service}/migrations/
 */

const {
  getDialectTypes,
  createTableSafe,
  addIndexSafe,
  createExtension,
  dialectSwitch,
  isPostgreSQL
} = require('../../shared/database/migrationHelper');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Get dialect-specific types
    const types = getDialectTypes(queryInterface, Sequelize);

    // Enable UUID extension (PostgreSQL only)
    await createExtension(queryInterface, 'uuid-ossp');

    // Create users table with compatible types
    await createTableSafe(queryInterface, 'users', {
      id: {
        type: types.UUID,
        defaultValue: isPostgreSQL(queryInterface)
          ? Sequelize.literal('uuid_generate_v4()')
          : Sequelize.literal('(lower(hex(randomblob(4))) || \'-\' || lower(hex(randomblob(2))) || \'-4\' || substr(lower(hex(randomblob(2))),2) || \'-\' || substr(\'89ab\',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || \'-\' || lower(hex(randomblob(6))))'),
        primaryKey: true
      },
      email: {
        type: types.CITEXT,  // Case-insensitive in PG, regular STRING in SQLite
        allowNull: false,
        unique: true
      },
      username: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      password: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      metadata: {
        type: types.JSONB,  // JSONB in PG, JSON in SQLite
        defaultValue: {}
      },
      roles: {
        type: types.ARRAY_STRING,  // Array in PG, TEXT in SQLite
        defaultValue: isPostgreSQL(queryInterface) ? [] : '[]'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: types.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: types.NOW
      }
    });

    // Add indexes with dialect awareness
    await addIndexSafe(queryInterface, 'users', ['email']);
    await addIndexSafe(queryInterface, 'users', ['username']);
    await addIndexSafe(queryInterface, 'users', ['created_at']);

    // PostgreSQL-specific: GIN index on JSONB
    await dialectSwitch(
      queryInterface,
      // PostgreSQL
      async (qi) => {
        await qi.sequelize.query(`
          CREATE INDEX idx_users_metadata_gin
          ON users USING GIN (metadata)
        `);
      },
      // SQLite
      async (qi) => {
        // SQLite doesn't support GIN indexes
        console.log('Skipping GIN index for SQLite');
      }
    );

    // Create posts table
    await createTableSafe(queryInterface, 'posts', {
      id: {
        type: types.UUID,
        defaultValue: isPostgreSQL(queryInterface)
          ? Sequelize.literal('uuid_generate_v4()')
          : Sequelize.literal('(lower(hex(randomblob(4))) || \'-\' || lower(hex(randomblob(2))) || \'-4\' || substr(lower(hex(randomblob(2))),2) || \'-\' || substr(\'89ab\',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || \'-\' || lower(hex(randomblob(6))))'),
        primaryKey: true
      },
      user_id: {
        type: types.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      tags: {
        type: types.ARRAY_STRING,
        defaultValue: isPostgreSQL(queryInterface) ? [] : '[]'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: types.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: types.NOW
      }
    });

    // Add indexes
    await addIndexSafe(queryInterface, 'posts', ['user_id']);
    await addIndexSafe(queryInterface, 'posts', ['created_at']);

    // PostgreSQL-specific: Full-text search index
    await dialectSwitch(
      queryInterface,
      // PostgreSQL
      async (qi) => {
        await qi.sequelize.query(`
          ALTER TABLE posts
          ADD COLUMN search_vector tsvector
          GENERATED ALWAYS AS (
            to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
          ) STORED
        `);

        await qi.sequelize.query(`
          CREATE INDEX idx_posts_search
          ON posts USING GIN (search_vector)
        `);
      },
      // SQLite
      async (qi) => {
        // SQLite FTS requires a separate virtual table
        await qi.sequelize.query(`
          CREATE VIRTUAL TABLE posts_fts
          USING fts5(title, content, content=posts, content_rowid=rowid)
        `);

        // Create triggers to keep FTS table in sync
        await qi.sequelize.query(`
          CREATE TRIGGER posts_fts_insert AFTER INSERT ON posts BEGIN
            INSERT INTO posts_fts(rowid, title, content)
            VALUES (new.rowid, new.title, new.content);
          END
        `);

        await qi.sequelize.query(`
          CREATE TRIGGER posts_fts_update AFTER UPDATE ON posts BEGIN
            UPDATE posts_fts
            SET title = new.title, content = new.content
            WHERE rowid = old.rowid;
          END
        `);

        await qi.sequelize.query(`
          CREATE TRIGGER posts_fts_delete AFTER DELETE ON posts BEGIN
            DELETE FROM posts_fts WHERE rowid = old.rowid;
          END
        `);
      }
    );

    // Create locations table (with PostGIS for PostgreSQL)
    if (isPostgreSQL(queryInterface)) {
      await createExtension(queryInterface, 'postgis');

      await createTableSafe(queryInterface, 'locations', {
        id: {
          type: types.UUID,
          defaultValue: Sequelize.literal('uuid_generate_v4()'),
          primaryKey: true
        },
        user_id: {
          type: types.UUID,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        name: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        coordinates: {
          type: Sequelize.GEOGRAPHY('POINT', 4326),
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('NOW()')
        }
      });

      // Spatial index
      await queryInterface.sequelize.query(`
        CREATE INDEX idx_locations_coordinates
        ON locations USING GIST (coordinates)
      `);
    } else {
      // SQLite: Use separate lat/lon columns
      await createTableSafe(queryInterface, 'locations', {
        id: {
          type: Sequelize.STRING(36),
          defaultValue: Sequelize.literal('(lower(hex(randomblob(4))) || \'-\' || lower(hex(randomblob(2))) || \'-4\' || substr(lower(hex(randomblob(2))),2) || \'-\' || substr(\'89ab\',abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))),2) || \'-\' || lower(hex(randomblob(6))))'),
          primaryKey: true
        },
        user_id: {
          type: Sequelize.STRING(36),
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        name: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        latitude: {
          type: Sequelize.FLOAT,
          allowNull: true
        },
        longitude: {
          type: Sequelize.FLOAT,
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });

      // Simple indexes for lat/lon
      await addIndexSafe(queryInterface, 'locations', ['latitude']);
      await addIndexSafe(queryInterface, 'locations', ['longitude']);
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order
    await queryInterface.dropTable('locations');

    // Drop FTS table for SQLite
    if (!isPostgreSQL(queryInterface)) {
      await queryInterface.sequelize.query('DROP TABLE IF EXISTS posts_fts');
    }

    await queryInterface.dropTable('posts');
    await queryInterface.dropTable('users');
  }
};
