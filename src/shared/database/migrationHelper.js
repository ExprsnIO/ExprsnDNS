/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration Compatibility Helper
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Provides utilities for writing migrations that work with both PostgreSQL
 * and SQLite, automatically selecting the appropriate approach based on
 * the active database dialect.
 */

/**
 * Get the appropriate data type based on dialect
 * @param {Object} queryInterface Sequelize queryInterface
 * @param {Object} Sequelize Sequelize instance
 * @returns {Object} Dialect-specific type mappings
 */
function getDialectTypes(queryInterface, Sequelize) {
  const dialect = queryInterface.sequelize.getDialect();
  const isPostgres = dialect === 'postgres';

  return {
    // JSON types
    JSON: isPostgres ? Sequelize.JSONB : Sequelize.JSON,
    JSONB: isPostgres ? Sequelize.JSONB : Sequelize.JSON,

    // Text types
    TEXT: Sequelize.TEXT,
    CITEXT: isPostgres ? Sequelize.CITEXT : Sequelize.STRING,

    // Array types (SQLite doesn't support arrays natively)
    ARRAY_STRING: isPostgres ? Sequelize.ARRAY(Sequelize.STRING) : Sequelize.TEXT,
    ARRAY_INTEGER: isPostgres ? Sequelize.ARRAY(Sequelize.INTEGER) : Sequelize.TEXT,

    // UUID type
    UUID: isPostgres ? Sequelize.UUID : Sequelize.STRING(36),

    // Geographic types (SQLite doesn't support PostGIS)
    GEOGRAPHY: isPostgres ? Sequelize.GEOGRAPHY : null,
    GEOMETRY: isPostgres ? Sequelize.GEOMETRY : null,

    // Boolean (SQLite uses INTEGER 0/1)
    BOOLEAN: Sequelize.BOOLEAN,

    // Timestamp types
    DATE: Sequelize.DATE,
    NOW: isPostgres ? Sequelize.fn('NOW') : Sequelize.literal('CURRENT_TIMESTAMP')
  };
}

/**
 * Create table with dialect-aware column types
 * @param {Object} queryInterface Sequelize queryInterface
 * @param {string} tableName Table name
 * @param {Object} columns Column definitions
 * @param {Object} options Additional options
 */
async function createTableSafe(queryInterface, tableName, columns, options = {}) {
  const dialect = queryInterface.sequelize.getDialect();
  const isPostgres = dialect === 'postgres';

  // Process columns to handle dialect-specific types
  const processedColumns = {};

  for (const [columnName, columnDef] of Object.entries(columns)) {
    processedColumns[columnName] = { ...columnDef };

    // Handle JSONB -> JSON for SQLite
    if (columnDef.type && columnDef.type.key === 'JSONB' && !isPostgres) {
      processedColumns[columnName].type = queryInterface.sequelize.Sequelize.JSON;
    }

    // Handle ARRAY types for SQLite (convert to TEXT with JSON)
    if (columnDef.type && columnDef.type.toString().includes('ARRAY') && !isPostgres) {
      processedColumns[columnName].type = queryInterface.sequelize.Sequelize.TEXT;
      processedColumns[columnName].get = function() {
        const val = this.getDataValue(columnName);
        return val ? JSON.parse(val) : [];
      };
      processedColumns[columnName].set = function(val) {
        this.setDataValue(columnName, JSON.stringify(val || []));
      };
    }

    // Handle UUID for SQLite
    if (columnDef.type && columnDef.type.key === 'UUID' && !isPostgres) {
      processedColumns[columnName].type = queryInterface.sequelize.Sequelize.STRING(36);
    }

    // Remove PostGIS types in SQLite (caller should handle separately)
    if (!isPostgres && columnDef.type &&
        (columnDef.type.key === 'GEOGRAPHY' || columnDef.type.key === 'GEOMETRY')) {
      delete processedColumns[columnName];
    }
  }

  return await queryInterface.createTable(tableName, processedColumns, options);
}

/**
 * Add column with dialect-aware type
 * @param {Object} queryInterface Sequelize queryInterface
 * @param {string} tableName Table name
 * @param {string} columnName Column name
 * @param {Object} columnDef Column definition
 */
async function addColumnSafe(queryInterface, tableName, columnName, columnDef) {
  const dialect = queryInterface.sequelize.getDialect();
  const isPostgres = dialect === 'postgres';

  let processedDef = { ...columnDef };

  // Handle JSONB -> JSON for SQLite
  if (columnDef.type && columnDef.type.key === 'JSONB' && !isPostgres) {
    processedDef.type = queryInterface.sequelize.Sequelize.JSON;
  }

  // Handle ARRAY types for SQLite
  if (columnDef.type && columnDef.type.toString().includes('ARRAY') && !isPostgres) {
    processedDef.type = queryInterface.sequelize.Sequelize.TEXT;
  }

  // Handle UUID for SQLite
  if (columnDef.type && columnDef.type.key === 'UUID' && !isPostgres) {
    processedDef.type = queryInterface.sequelize.Sequelize.STRING(36);
  }

  // Skip PostGIS types in SQLite
  if (!isPostgres && columnDef.type &&
      (columnDef.type.key === 'GEOGRAPHY' || columnDef.type.key === 'GEOMETRY')) {
    console.warn(`Skipping geographic column ${columnName} in SQLite mode`);
    return;
  }

  return await queryInterface.addColumn(tableName, columnName, processedDef);
}

/**
 * Create index with dialect-specific options
 * @param {Object} queryInterface Sequelize queryInterface
 * @param {string} tableName Table name
 * @param {Array|string} columns Column(s) to index
 * @param {Object} options Index options
 */
async function addIndexSafe(queryInterface, tableName, columns, options = {}) {
  const dialect = queryInterface.sequelize.getDialect();
  const isPostgres = dialect === 'postgres';

  let processedOptions = { ...options };

  // Remove PostgreSQL-specific index types for SQLite
  if (!isPostgres) {
    if (processedOptions.using === 'GIN' ||
        processedOptions.using === 'GIST' ||
        processedOptions.using === 'BRIN') {
      delete processedOptions.using;
    }

    // Remove PostgreSQL-specific index options
    delete processedOptions.where;
    delete processedOptions.operator;
  }

  const columnArray = Array.isArray(columns) ? columns : [columns];

  return await queryInterface.addIndex(tableName, columnArray, processedOptions);
}

/**
 * Execute raw SQL with dialect-specific query
 * @param {Object} queryInterface Sequelize queryInterface
 * @param {Object} queries Object with 'postgres' and 'sqlite' queries
 */
async function executeDialectSQL(queryInterface, queries) {
  const dialect = queryInterface.sequelize.getDialect();

  if (queries[dialect]) {
    return await queryInterface.sequelize.query(queries[dialect]);
  } else if (queries.default) {
    return await queryInterface.sequelize.query(queries.default);
  }

  throw new Error(`No SQL query provided for dialect: ${dialect}`);
}

/**
 * Create extension (PostgreSQL only)
 * @param {Object} queryInterface Sequelize queryInterface
 * @param {string} extensionName Extension name (e.g., 'uuid-ossp', 'postgis')
 */
async function createExtension(queryInterface, extensionName) {
  const dialect = queryInterface.sequelize.getDialect();

  if (dialect === 'postgres') {
    return await queryInterface.sequelize.query(
      `CREATE EXTENSION IF NOT EXISTS "${extensionName}"`
    );
  }

  // SQLite doesn't support extensions in the same way
  console.warn(`Skipping extension ${extensionName} for SQLite`);
}

/**
 * Check if running on PostgreSQL
 * @param {Object} queryInterface Sequelize queryInterface
 * @returns {boolean} True if PostgreSQL
 */
function isPostgreSQL(queryInterface) {
  return queryInterface.sequelize.getDialect() === 'postgres';
}

/**
 * Check if running on SQLite
 * @param {Object} queryInterface Sequelize queryInterface
 * @returns {boolean} True if SQLite
 */
function isSQLite(queryInterface) {
  return queryInterface.sequelize.getDialect() === 'sqlite';
}

/**
 * Conditional migration based on dialect
 * @param {Object} queryInterface Sequelize queryInterface
 * @param {Function} postgresFunc Function to run for PostgreSQL
 * @param {Function} sqliteFunc Function to run for SQLite
 */
async function dialectSwitch(queryInterface, postgresFunc, sqliteFunc) {
  const dialect = queryInterface.sequelize.getDialect();

  if (dialect === 'postgres' && postgresFunc) {
    return await postgresFunc(queryInterface);
  } else if (dialect === 'sqlite' && sqliteFunc) {
    return await sqliteFunc(queryInterface);
  }
}

module.exports = {
  getDialectTypes,
  createTableSafe,
  addColumnSafe,
  addIndexSafe,
  executeDialectSQL,
  createExtension,
  isPostgreSQL,
  isSQLite,
  dialectSwitch
};
