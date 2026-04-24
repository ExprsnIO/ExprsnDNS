/**
 * ═══════════════════════════════════════════════════════════
 * Socket.IO Authentication Middleware
 * Validates CA tokens for WebSocket connections
 * See: TOKEN_SPECIFICATION_V1.0.md Section 9
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Authenticate Socket.IO connection with CA token
 * @param {Object} options - Authentication options
 * @param {Array<string>} options.requiredPermissions - Required permissions
 * @param {string} options.caUrl - CA URL for token validation
 * @returns {Function} Socket.IO middleware
 */
function authenticateSocket(options = {}) {
  const {
    requiredPermissions = [],
    caUrl = process.env.CA_URL || 'http://localhost:3000'
  } = options;

  return async (socket, next) => {
    try {
      // Extract token from handshake auth or query
      const token = socket.handshake.auth?.token ||
                   socket.handshake.query?.token;

      if (!token) {
        logger.warn('Socket auth failed: No token provided', {
          socketId: socket.id,
          address: socket.handshake.address
        });

        return next(new Error('MISSING_TOKEN'));
      }

      // Validate token with CA
      const validationResponse = await axios.post(
        `${caUrl}/api/tokens/validate`,
        {
          token,
          requiredPermissions,
          resource: 'socket'
        },
        {
          timeout: 5000,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      if (!validationResponse.data.valid) {
        logger.warn('Socket auth failed: Invalid token', {
          socketId: socket.id,
          reason: validationResponse.data.reason,
          address: socket.handshake.address
        });

        return next(new Error('INVALID_TOKEN'));
      }

      // Attach user data to socket
      socket.userId = validationResponse.data.userId;
      socket.tokenData = validationResponse.data.tokenData;
      socket.permissions = validationResponse.data.permissions;

      logger.info('Socket authenticated successfully', {
        socketId: socket.id,
        userId: socket.userId,
        address: socket.handshake.address
      });

      next();
    } catch (error) {
      logger.error('Socket authentication error', {
        error: error.message,
        socketId: socket.id,
        address: socket.handshake?.address
      });

      // Handle CA unavailability
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        return next(new Error('CA_UNAVAILABLE'));
      }

      return next(new Error('AUTHENTICATION_ERROR'));
    }
  };
}

/**
 * Validate socket has required permission for event
 * @param {Array<string>} permissions - Required permissions
 * @returns {Function} Event handler wrapper
 */
function requireSocketPermission(permissions) {
  return (handler) => {
    return async function (data, callback) {
      const socket = this;

      // Check if socket has permissions
      if (!socket.permissions) {
        logger.warn('Socket permission check failed: No permissions', {
          socketId: socket.id,
          userId: socket.userId
        });

        if (typeof callback === 'function') {
          callback({
            error: 'UNAUTHORIZED',
            message: 'No permissions found'
          });
        }
        return;
      }

      // Check if socket has all required permissions
      const hasPermissions = permissions.every(perm =>
        socket.permissions[perm] === true
      );

      if (!hasPermissions) {
        logger.warn('Socket permission check failed: Insufficient permissions', {
          socketId: socket.id,
          userId: socket.userId,
          required: permissions,
          actual: socket.permissions
        });

        if (typeof callback === 'function') {
          callback({
            error: 'FORBIDDEN',
            message: `Required permissions: ${permissions.join(', ')}`
          });
        }
        return;
      }

      // Call original handler
      return handler.call(this, data, callback);
    };
  };
}

/**
 * Validate socket user is in a specific room/channel
 * @param {Function} getRoomId - Function to extract room ID from event data
 * @returns {Function} Event handler wrapper
 */
function requireRoomMembership(getRoomId) {
  return (handler) => {
    return async function (data, callback) {
      const socket = this;
      const roomId = await getRoomId(data, socket);

      if (!roomId) {
        logger.warn('Room validation failed: No room ID', {
          socketId: socket.id,
          userId: socket.userId
        });

        if (typeof callback === 'function') {
          callback({
            error: 'INVALID_REQUEST',
            message: 'Room ID required'
          });
        }
        return;
      }

      // Check if socket is in the room
      const rooms = Array.from(socket.rooms);
      if (!rooms.includes(roomId)) {
        logger.warn('Room validation failed: Not a member', {
          socketId: socket.id,
          userId: socket.userId,
          roomId
        });

        if (typeof callback === 'function') {
          callback({
            error: 'FORBIDDEN',
            message: 'You are not a member of this room'
          });
        }
        return;
      }

      // Call original handler
      return handler.call(this, data, callback);
    };
  };
}

/**
 * Validate socket belongs to specific user
 * @param {Function} getUserId - Function to extract target user ID from event data
 * @returns {Function} Event handler wrapper
 */
function requireSocketOwner(getUserId) {
  return (handler) => {
    return async function (data, callback) {
      const socket = this;
      const targetUserId = await getUserId(data, socket);

      if (socket.userId !== targetUserId) {
        logger.warn('Socket owner validation failed', {
          socketId: socket.id,
          userId: socket.userId,
          targetUserId
        });

        if (typeof callback === 'function') {
          callback({
            error: 'FORBIDDEN',
            message: 'You do not have permission to perform this action'
          });
        }
        return;
      }

      // Call original handler
      return handler.call(this, data, callback);
    };
  };
}

/**
 * Rate limit socket events
 * @param {Object} options - Rate limit options
 * @param {number} options.maxEvents - Maximum events per window
 * @param {number} options.windowMs - Time window in milliseconds
 * @returns {Function} Event handler wrapper
 */
function socketRateLimit(options = {}) {
  const { maxEvents = 10, windowMs = 1000 } = options;
  const eventCounts = new Map();

  return (handler) => {
    return async function (data, callback) {
      const socket = this;
      const key = `${socket.id}:${Date.now()}`;

      // Clean up old entries
      const now = Date.now();
      for (const [k, v] of eventCounts.entries()) {
        if (now - v.timestamp > windowMs) {
          eventCounts.delete(k);
        }
      }

      // Get or create counter for this socket
      const socketKey = socket.id;
      const counter = eventCounts.get(socketKey) || { count: 0, timestamp: now };

      // Reset if window expired
      if (now - counter.timestamp > windowMs) {
        counter.count = 0;
        counter.timestamp = now;
      }

      // Check rate limit
      if (counter.count >= maxEvents) {
        logger.warn('Socket rate limit exceeded', {
          socketId: socket.id,
          userId: socket.userId,
          count: counter.count,
          maxEvents
        });

        if (typeof callback === 'function') {
          callback({
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests, please slow down'
          });
        }
        return;
      }

      // Increment counter
      counter.count++;
      eventCounts.set(socketKey, counter);

      // Call original handler
      return handler.call(this, data, callback);
    };
  };
}

module.exports = {
  authenticateSocket,
  requireSocketPermission,
  requireRoomMembership,
  requireSocketOwner,
  socketRateLimit
};
