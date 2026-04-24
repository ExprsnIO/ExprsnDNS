# Resilient Database Connection

Automatic PostgreSQL to SQLite fallback system for development and testing resilience.

## Quick Start

```javascript
const { createResilientConnection } = require('@exprsn/shared/database/resilientConnection');

// Create connection with automatic fallback
const dbConnection = await createResilientConnection({
  serviceName: 'exprsn-ca',

  primary: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'exprsn_ca',
    username: process.env.DB_USER || 'exprsn_ca_user',
    password: process.env.DB_PASSWORD || '',
    pool: {
      min: 2,
      max: 10,
      acquire: 30000,
      idle: 10000
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false
  },

  fallback: {
    storageDir: './data/sqlite',
    logging: false
  },

  options: {
    allowSQLiteFallback: true,
    autoReconnect: true,
    maxRetries: 5,
    retryDelay: 2000,
    healthCheckInterval: 30000
  }
});

// Get Sequelize instance
const sequelize = dbConnection.getSequelize();

// Check status
console.log(dbConnection.getStatus());
// { connected: true, dialect: 'postgres', fallback: false, ... }
```

## Features

### 1. Automatic Fallback
When PostgreSQL is unavailable, automatically falls back to SQLite:

```javascript
// PostgreSQL unavailable → automatically tries SQLite
const dbConnection = await createResilientConnection(config);

if (dbConnection.isFallbackMode()) {
  console.warn('Running in SQLite fallback mode');
}
```

### 2. Automatic Recovery
When using SQLite fallback, continuously attempts to reconnect to PostgreSQL:

```javascript
dbConnection.on('recovered', ({ from, to }) => {
  console.log(`Database recovered: ${from} → ${to}`);
  // Automatically switched from SQLite to PostgreSQL
});
```

### 3. Health Monitoring
Continuous health checks detect PostgreSQL failures:

```javascript
dbConnection.on('healthCheckFailed', ({ dialect, error }) => {
  console.error(`Health check failed for ${dialect}:`, error);
});
```

### 4. Event-Driven Architecture
Listen for connection events:

```javascript
dbConnection.on('connected', ({ dialect, fallback }) => {
  if (fallback) {
    console.warn(`Connected to ${dialect} (fallback mode)`);
  } else {
    console.log(`Connected to ${dialect}`);
  }
});

dbConnection.on('recovered', ({ from, to }) => {
  console.log(`Recovered: ${from} → ${to}`);
});

dbConnection.on('error', (errors) => {
  console.error('Connection failed:', errors);
});

dbConnection.on('disconnected', () => {
  console.log('Database disconnected');
});
```

## Configuration Options

### Primary Configuration (PostgreSQL)
```javascript
primary: {
  host: 'localhost',           // Database host
  port: 5432,                  // Database port
  database: 'exprsn_ca',       // Database name
  username: 'postgres',        // Database user
  password: '',                // Database password
  pool: {                      // Connection pool settings
    min: 2,
    max: 10,
    acquire: 30000,
    idle: 10000
  },
  ssl: false,                  // Enable SSL
  logging: false               // SQL query logging
}
```

### Fallback Configuration (SQLite)
```javascript
fallback: {
  storageDir: './data/sqlite',      // SQLite database directory
  storagePath: './custom.sqlite',   // Or specify full path
  logging: false                    // SQL query logging
}
```

### Options
```javascript
options: {
  allowSQLiteFallback: true,        // Enable SQLite fallback (default: true)
  autoReconnect: true,              // Auto-reconnect to PostgreSQL (default: true)
  maxRetries: 5,                    // Max reconnection attempts (default: 3)
  retryDelay: 2000,                 // Initial retry delay in ms (default: 2000)
  healthCheckInterval: 30000        // Health check interval in ms (default: 30000)
}
```

## SQLite Limitations

When running in SQLite fallback mode, be aware of these limitations:

⚠️ **Performance**
- Single-writer limitation (no concurrent writes)
- Slower for large datasets
- Limited optimization for complex queries

⚠️ **Features**
- No PostGIS/spatial extensions
- Limited JSON query support
- No GiST/GIN indexes
- No full-text search extensions
- No database-level user management

⚠️ **Concurrency**
- `SQLITE_BUSY` errors under high concurrency
- No true parallel query execution

## Migration Compatibility

SQLite requires migration adjustments:

### PostgreSQL-specific Features to Avoid
```javascript
// ❌ Don't use PostgreSQL-specific types in SQLite mode
queryInterface.createTable('users', {
  data: Sequelize.JSONB,        // ❌ JSONB not available in SQLite
  location: Sequelize.GEOGRAPHY // ❌ PostGIS not available
});

// ✅ Use portable types
queryInterface.createTable('users', {
  data: Sequelize.JSON,         // ✅ Works in both
  lat: Sequelize.FLOAT,         // ✅ Use separate fields
  lon: Sequelize.FLOAT
});
```

### Checking Dialect in Migrations
```javascript
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const dialect = queryInterface.sequelize.getDialect();

    if (dialect === 'postgres') {
      // PostgreSQL-specific migration
      await queryInterface.addColumn('users', 'metadata', {
        type: Sequelize.JSONB,
        defaultValue: {}
      });
    } else {
      // SQLite-compatible migration
      await queryInterface.addColumn('users', 'metadata', {
        type: Sequelize.JSON,
        defaultValue: '{}'
      });
    }
  }
};
```

## Production Deployment

**⚠️ SQLite fallback is for development only!**

In production:
```javascript
const dbConnection = await createResilientConnection({
  serviceName: 'exprsn-ca',
  primary: { /* PostgreSQL config */ },
  options: {
    allowSQLiteFallback: false,  // ❌ Disable in production
    autoReconnect: true,
    maxRetries: 10
  }
});
```

## Testing Fallback Behavior

```javascript
const { ResilientDatabaseConnection } = require('@exprsn/shared/database/resilientConnection');

// Test connection
const connection = new ResilientDatabaseConnection({
  serviceName: 'test-service',
  primary: { /* invalid config to force fallback */ },
  options: { allowSQLiteFallback: true }
});

await connection.connect();

// Check status
console.log(connection.getStatus());
// { connected: true, dialect: 'sqlite', fallback: true, ... }

// Force reconnection
await connection.reconnect();

// Clean up
await connection.disconnect();
```

## Environment Variables

Recommended `.env` configuration:

```bash
# PostgreSQL Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=exprsn_ca
DB_USER=postgres
DB_PASSWORD=your_password
DB_SSL=false
DB_POOL_MIN=2
DB_POOL_MAX=10

# SQLite Fallback
SQLITE_FALLBACK=true
SQLITE_DIR=./data/sqlite

# Connection Resilience
DB_AUTO_RECONNECT=true
DB_MAX_RETRIES=5
DB_RETRY_DELAY=2000
DB_HEALTH_CHECK_INTERVAL=30000
```

## Troubleshooting

### PostgreSQL Connection Fails Immediately
```bash
# Check PostgreSQL is running
pg_isready

# Check connection
psql -h localhost -U postgres -d exprsn_ca

# Review logs
tail -f logs/database.log
```

### SQLite Permission Errors
```bash
# Ensure directory exists and is writable
mkdir -p data/sqlite
chmod 755 data/sqlite
```

### Recovery Not Working
```javascript
// Check recovery status
dbConnection.on('healthCheckFailed', ({ error }) => {
  console.error('PostgreSQL still unavailable:', error.message);
});

// Manually trigger reconnection
await dbConnection.reconnect();
```

## Advanced Usage

### Custom Logger
```javascript
const winston = require('winston');
const logger = winston.createLogger({ /* config */ });

const dbConnection = await createResilientConnection({
  serviceName: 'exprsn-ca',
  logger: logger,  // Use custom logger
  // ... other config
});
```

### Manual Connection Control
```javascript
const { ResilientDatabaseConnection } = require('@exprsn/shared/database/resilientConnection');

const connection = new ResilientDatabaseConnection(config);

// Manual connection
await connection.connect();

// Get status
const status = connection.getStatus();

// Check fallback
if (connection.isFallbackMode()) {
  // Handle SQLite limitations
}

// Manual disconnection
await connection.disconnect();
```

## See Also

- [Sequelize Documentation](https://sequelize.org/)
- [PostgreSQL Connection Pool](https://node-postgres.com/features/pooling)
- [SQLite Documentation](https://www.sqlite.org/docs.html)
