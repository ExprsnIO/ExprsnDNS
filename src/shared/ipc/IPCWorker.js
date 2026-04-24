/**
 * ═══════════════════════════════════════════════════════════════════════
 * IPC Worker - Redis-based Inter-Process Communication
 *
 * Features:
 * - Socket.IO event routing via Redis pub/sub
 * - CRUD operations with JSONLex support
 * - Rate limit exemption for broker tokens
 * - State management for long-running operations
 * - Automatic service discovery
 * ═══════════════════════════════════════════════════════════════════════
 */

const Redis = require('ioredis');
const EventEmitter = require('events');
const BrokerTokenManager = require('./BrokerToken');
const JSONLex = require('../utils/jsonlex');

class IPCWorker extends EventEmitter {
  constructor(options = {}) {
    super();

    this.serviceName = options.serviceName || 'unknown';
    this.namespace = options.namespace || 'ipc';

    // Redis clients
    this.redisPub = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: process.env.REDIS_DB || 0,
      keyPrefix: 'ipc:'
    });

    this.redisSub = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: process.env.REDIS_DB || 0,
      keyPrefix: 'ipc:'
    });

    this.redisData = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || '',
      db: process.env.REDIS_DB || 0,
      keyPrefix: 'ipc:data:'
    });

    // Broker token manager
    this.tokenManager = new BrokerTokenManager({
      serviceName: this.serviceName,
      redis: this.redisData
    });

    // Event handlers registry
    this.handlers = new Map();

    // Active subscriptions
    this.subscriptions = new Set();

    // Initialize
    this._initialize();
  }

  /**
   * Initialize IPC worker
   * @private
   */
  async _initialize() {
    // Subscribe to service-specific channel
    const serviceChannel = `${this.namespace}:${this.serviceName}`;
    await this.subscribe(serviceChannel);

    // Subscribe to broadcast channel
    const broadcastChannel = `${this.namespace}:broadcast`;
    await this.subscribe(broadcastChannel);

    // Handle incoming messages
    this.redisSub.on('message', async (channel, message) => {
      try {
        const data = JSON.parse(message);
        await this._handleMessage(channel, data);
      } catch (error) {
        this.emit('error', new Error(`Failed to parse IPC message: ${error.message}`));
      }
    });

    this.redisSub.on('error', (error) => {
      this.emit('error', error);
    });

    // Register as active service
    await this._registerService();

    this.emit('ready');
  }

  /**
   * Subscribe to a channel
   * @param {string} channel - Channel name
   */
  async subscribe(channel) {
    if (!this.subscriptions.has(channel)) {
      await this.redisSub.subscribe(channel);
      this.subscriptions.add(channel);
      this.emit('subscribed', channel);
    }
  }

  /**
   * Unsubscribe from a channel
   * @param {string} channel - Channel name
   */
  async unsubscribe(channel) {
    if (this.subscriptions.has(channel)) {
      await this.redisSub.unsubscribe(channel);
      this.subscriptions.delete(channel);
      this.emit('unsubscribed', channel);
    }
  }

  /**
   * Register event handler
   * @param {string} event - Event name
   * @param {Function} handler - Handler function
   */
  on(event, handler) {
    if (typeof handler === 'function') {
      if (!this.handlers.has(event)) {
        this.handlers.set(event, []);
      }
      this.handlers.get(event).push(handler);
    }
    return super.on(event, handler);
  }

  /**
   * Emit event to target service(s)
   * @param {Object} options - Emission options
   */
  async emit(event, data, options = {}) {
    const {
      target = 'broadcast',
      operation = 'event',
      requireAck = false,
      ttl = 300,
      metadata = {}
    } = options;

    // Generate broker token
    const token = await this.tokenManager.generateToken(data, {
      targetService: target,
      operation,
      ttl,
      metadata: { event, ...metadata }
    });

    const message = {
      event,
      data,
      source: this.serviceName,
      target,
      operation,
      token,
      requireAck,
      timestamp: Date.now(),
      metadata
    };

    // Determine channel
    const channel = target === 'broadcast'
      ? `${this.namespace}:broadcast`
      : `${this.namespace}:${target}`;

    // Publish message
    await this.redisPub.publish(channel, JSON.stringify(message));

    this.emit('sent', { event, target, channel });

    return message;
  }

  /**
   * Handle incoming message
   * @private
   */
  async _handleMessage(channel, message) {
    const { event, data, source, token, requireAck } = message;

    try {
      // Verify broker token
      const verified = await this.tokenManager.verifyToken(token);

      // Check if this message is for us
      if (message.target !== this.serviceName && message.target !== 'broadcast') {
        return; // Not for us
      }

      // Execute handlers
      const handlers = this.handlers.get(event) || [];
      for (const handler of handlers) {
        try {
          await handler(data, {
            source,
            token: verified,
            channel,
            message
          });
        } catch (error) {
          this.emit('handler-error', {
            event,
            error,
            handler: handler.name
          });
        }
      }

      // Send acknowledgment if required
      if (requireAck) {
        await this._sendAck(message);
      }

      this.emit('received', { event, source, channel });
    } catch (error) {
      this.emit('error', new Error(`Message handling failed: ${error.message}`));
    }
  }

  /**
   * Send acknowledgment
   * @private
   */
  async _sendAck(originalMessage) {
    const ackMessage = {
      event: 'ack',
      data: {
        originalEvent: originalMessage.event,
        originalId: originalMessage.token
      },
      source: this.serviceName,
      target: originalMessage.source,
      operation: 'ack',
      timestamp: Date.now()
    };

    const channel = `${this.namespace}:${originalMessage.source}`;
    await this.redisPub.publish(channel, JSON.stringify(ackMessage));
  }

  /**
   * CRUD Operations with JSONLex support
   */

  /**
   * Create resource
   */
  async create(resource, data, options = {}) {
    const { target = 'bridge', useJSONLex = false } = options;

    const payload = {
      resource,
      data: useJSONLex ? JSONLex.compile(data) : data,
      operation: 'create'
    };

    return this.emit('crud:create', payload, {
      target,
      operation: 'crud',
      ...options
    });
  }

  /**
   * Read resource
   */
  async read(resource, query = {}, options = {}) {
    const { target = 'bridge', useJSONLex = false } = options;

    const payload = {
      resource,
      query: useJSONLex ? JSONLex.compile(query) : query,
      operation: 'read'
    };

    return this.emit('crud:read', payload, {
      target,
      operation: 'crud',
      ...options
    });
  }

  /**
   * Update resource
   */
  async update(resource, id, data, options = {}) {
    const { target = 'bridge', useJSONLex = false } = options;

    const payload = {
      resource,
      id,
      data: useJSONLex ? JSONLex.compile(data) : data,
      operation: 'update'
    };

    return this.emit('crud:update', payload, {
      target,
      operation: 'crud',
      ...options
    });
  }

  /**
   * Delete resource
   */
  async delete(resource, id, options = {}) {
    const { target = 'bridge' } = options;

    const payload = {
      resource,
      id,
      operation: 'delete'
    };

    return this.emit('crud:delete', payload, {
      target,
      operation: 'crud',
      ...options
    });
  }

  /**
   * Execute JSONLex expression
   */
  async executeJSONLex(expression, context = {}, options = {}) {
    const { target = 'bridge' } = options;

    const payload = {
      expression,
      context,
      operation: 'jsonlex'
    };

    return this.emit('jsonlex:execute', payload, {
      target,
      operation: 'jsonlex',
      ...options
    });
  }

  /**
   * Register this service in the service registry
   * @private
   */
  async _registerService() {
    const serviceKey = `services:${this.serviceName}`;
    const serviceInfo = {
      name: this.serviceName,
      namespace: this.namespace,
      pid: process.pid,
      hostname: require('os').hostname(),
      registered: Date.now(),
      lastSeen: Date.now()
    };

    await this.redisData.setex(serviceKey, 60, JSON.stringify(serviceInfo));

    // Update heartbeat every 30 seconds
    this.heartbeatInterval = setInterval(async () => {
      serviceInfo.lastSeen = Date.now();
      await this.redisData.setex(serviceKey, 60, JSON.stringify(serviceInfo));
    }, 30000);
  }

  /**
   * Get list of active services
   */
  async getActiveServices() {
    const keys = await this.redisData.keys('services:*');
    const services = [];

    for (const key of keys) {
      const data = await this.redisData.get(key);
      if (data) {
        services.push(JSON.parse(data));
      }
    }

    return services;
  }

  /**
   * Cleanup and disconnect
   */
  async disconnect() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    await this.redisPub.quit();
    await this.redisSub.quit();
    await this.redisData.quit();

    this.emit('disconnected');
  }
}

module.exports = IPCWorker;
