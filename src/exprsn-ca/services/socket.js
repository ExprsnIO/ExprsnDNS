/**
 * ═══════════════════════════════════════════════════════════
 * Socket.IO Service
 * Real-time event handling for CA operations
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../utils/logger');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedClients = new Map();
  }

  /**
   * Initialize Socket.IO server
   */
  initialize(server, sessionMiddleware) {
    const socketIo = require('socket.io');

    this.io = socketIo(server, {
      cors: {
        origin: process.env.NODE_ENV === 'production'
          ? process.env.CA_DOMAIN
          : '*',
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // Wrap session middleware for socket.io
    const wrap = middleware => (socket, next) => middleware(socket.request, {}, next);

    // Use session middleware
    this.io.use(wrap(sessionMiddleware));

    // Authentication middleware
    this.io.use((socket, next) => {
      const session = socket.request.session;

      if (!session || !session.user) {
        logger.warn('Socket connection without authentication', {
          socketId: socket.id,
          address: socket.handshake.address
        });
        // Allow connection but mark as unauthenticated
        socket.authenticated = false;
        socket.user = null;
      } else {
        socket.authenticated = true;
        socket.user = session.user;
        logger.info('Socket authenticated', {
          socketId: socket.id,
          userId: socket.user.id
        });
      }

      next();
    });

    // Handle connections
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    logger.info('Socket.IO server initialized');
  }

  /**
   * Handle new socket connection
   */
  handleConnection(socket) {
    const userId = socket.user?.id;

    if (userId) {
      // Track authenticated connection
      if (!this.connectedClients.has(userId)) {
        this.connectedClients.set(userId, new Set());
      }
      this.connectedClients.get(userId).add(socket.id);

      // Join user's personal room
      socket.join(`user:${userId}`);

      logger.info('Client connected', {
        socketId: socket.id,
        userId,
        totalConnections: this.connectedClients.get(userId).size
      });
    } else {
      logger.info('Anonymous client connected', {
        socketId: socket.id
      });
    }

    // Handle disconnection
    socket.on('disconnect', () => {
      if (userId && this.connectedClients.has(userId)) {
        this.connectedClients.get(userId).delete(socket.id);

        if (this.connectedClients.get(userId).size === 0) {
          this.connectedClients.delete(userId);
        }

        logger.info('Client disconnected', {
          socketId: socket.id,
          userId,
          remainingConnections: this.connectedClients.get(userId)?.size || 0
        });
      }
    });

    // Handle custom events
    this.setupEventHandlers(socket);
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers(socket) {
    // Certificate events
    socket.on('certificate:subscribe', (certificateId) => {
      socket.join(`certificate:${certificateId}`);
      logger.debug('Socket subscribed to certificate', {
        socketId: socket.id,
        certificateId
      });
    });

    socket.on('certificate:unsubscribe', (certificateId) => {
      socket.leave(`certificate:${certificateId}`);
      logger.debug('Socket unsubscribed from certificate', {
        socketId: socket.id,
        certificateId
      });
    });

    // Token events
    socket.on('token:subscribe', (tokenId) => {
      socket.join(`token:${tokenId}`);
      logger.debug('Socket subscribed to token', {
        socketId: socket.id,
        tokenId
      });
    });

    socket.on('token:unsubscribe', (tokenId) => {
      socket.leave(`token:${tokenId}`);
      logger.debug('Socket unsubscribed from token', {
        socketId: socket.id,
        tokenId
      });
    });

    // Dashboard events
    socket.on('dashboard:subscribe', () => {
      if (socket.user) {
        socket.join(`dashboard:${socket.user.id}`);
        logger.debug('Socket subscribed to dashboard', {
          socketId: socket.id,
          userId: socket.user.id
        });
      }
    });

    // Ping/pong for connection monitoring
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });
  }

  /**
   * Emit event to user's sockets
   */
  emitToUser(userId, event, data) {
    if (!this.io) return;

    this.io.to(`user:${userId}`).emit(event, data);

    logger.debug('Event emitted to user', {
      userId,
      event,
      data
    });
  }

  /**
   * Emit event to all authenticated users
   */
  emitToAll(event, data) {
    if (!this.io) return;

    this.io.emit(event, data);

    logger.debug('Event emitted to all', {
      event,
      data
    });
  }

  /**
   * Emit event to specific room
   */
  emitToRoom(room, event, data) {
    if (!this.io) return;

    this.io.to(room).emit(event, data);

    logger.debug('Event emitted to room', {
      room,
      event,
      data
    });
  }

  /**
   * Certificate created event
   */
  certificateCreated(certificate, userId) {
    this.emitToUser(userId, 'certificate:created', {
      certificateId: certificate.id,
      commonName: certificate.commonName,
      certificateType: certificate.certificateType,
      status: certificate.status,
      timestamp: Date.now()
    });

    // Also emit to anyone watching certificates list
    this.emitToAll('certificates:updated', {
      action: 'created',
      certificateId: certificate.id
    });
  }

  /**
   * Certificate revoked event
   */
  certificateRevoked(certificateId, userId, reason) {
    this.emitToUser(userId, 'certificate:revoked', {
      certificateId,
      reason,
      timestamp: Date.now()
    });

    this.emitToRoom(`certificate:${certificateId}`, 'certificate:revoked', {
      certificateId,
      reason,
      timestamp: Date.now()
    });

    this.emitToAll('certificates:updated', {
      action: 'revoked',
      certificateId
    });
  }

  /**
   * Token created event
   */
  tokenCreated(token, userId) {
    this.emitToUser(userId, 'token:created', {
      tokenId: token.id,
      certificateId: token.certificateId,
      resourceType: token.resourceType,
      status: token.status,
      timestamp: Date.now()
    });

    // Emit to certificate room
    this.emitToRoom(`certificate:${token.certificateId}`, 'token:created', {
      tokenId: token.id,
      certificateId: token.certificateId
    });

    this.emitToAll('tokens:updated', {
      action: 'created',
      tokenId: token.id
    });
  }

  /**
   * Token revoked event
   */
  tokenRevoked(tokenId, userId, reason) {
    this.emitToUser(userId, 'token:revoked', {
      tokenId,
      reason,
      timestamp: Date.now()
    });

    this.emitToRoom(`token:${tokenId}`, 'token:revoked', {
      tokenId,
      reason,
      timestamp: Date.now()
    });

    this.emitToAll('tokens:updated', {
      action: 'revoked',
      tokenId
    });
  }

  /**
   * Token validated event (for real-time monitoring)
   */
  tokenValidated(tokenId, userId, valid, errors) {
    this.emitToUser(userId, 'token:validated', {
      tokenId,
      valid,
      errors,
      timestamp: Date.now()
    });

    this.emitToRoom(`token:${tokenId}`, 'token:used', {
      tokenId,
      valid,
      timestamp: Date.now()
    });
  }

  /**
   * User login event
   */
  userLoggedIn(userId, sessionInfo) {
    this.emitToUser(userId, 'user:login', {
      userId,
      sessionInfo,
      timestamp: Date.now()
    });
  }

  /**
   * Dashboard statistics update
   */
  dashboardStatsUpdated(userId, stats) {
    this.emitToRoom(`dashboard:${userId}`, 'dashboard:stats', {
      stats,
      timestamp: Date.now()
    });
  }

  /**
   * Admin dashboard - broadcast stats to all admin users
   */
  adminDashboardStatsUpdated(stats) {
    this.emitToAll('dashboard:stats', {
      stats,
      timestamp: Date.now()
    });
  }

  /**
   * User created event
   */
  userCreated(user, adminUserId) {
    this.emitToAll('user:created', {
      userId: user.id,
      username: user.username,
      timestamp: Date.now()
    });
  }

  /**
   * User updated event
   */
  userUpdated(userId, changes) {
    this.emitToAll('user:updated', {
      userId,
      changes,
      timestamp: Date.now()
    });
  }

  /**
   * User deleted event
   */
  userDeleted(userId) {
    this.emitToAll('user:deleted', {
      userId,
      timestamp: Date.now()
    });
  }

  /**
   * Group created event
   */
  groupCreated(group) {
    this.emitToAll('group:created', {
      groupId: group.id,
      name: group.name,
      timestamp: Date.now()
    });
  }

  /**
   * Group updated event
   */
  groupUpdated(groupId, changes) {
    this.emitToAll('group:updated', {
      groupId,
      changes,
      timestamp: Date.now()
    });
  }

  /**
   * Role created event
   */
  roleCreated(role) {
    this.emitToAll('role:created', {
      roleId: role.id,
      name: role.name,
      timestamp: Date.now()
    });
  }

  /**
   * System health update
   */
  systemHealthUpdated(health) {
    this.emitToAll('system:health', {
      health,
      timestamp: Date.now()
    });
  }

  /**
   * Moderation event (for moderation dashboard)
   */
  moderationEvent(eventType, data) {
    this.emitToAll('moderation:event', {
      eventType,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * System notification
   */
  systemNotification(message, level = 'info', targetUserId = null) {
    const notification = {
      message,
      level,
      timestamp: Date.now()
    };

    if (targetUserId) {
      this.emitToUser(targetUserId, 'system:notification', notification);
    } else {
      this.emitToAll('system:notification', notification);
    }
  }

  /**
   * Get connected clients count
   */
  getConnectedCount() {
    return this.connectedClients.size;
  }

  /**
   * Get user connection status
   */
  isUserConnected(userId) {
    return this.connectedClients.has(userId) &&
           this.connectedClients.get(userId).size > 0;
  }

  /**
   * Get socket.io instance
   */
  getIO() {
    return this.io;
  }
}

// Create singleton instance
const socketService = new SocketService();

module.exports = socketService;
