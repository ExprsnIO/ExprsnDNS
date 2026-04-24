/**
 * ═══════════════════════════════════════════════════════════
 * Socket.IO Authentication Middleware
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../config/logging');
const User = require('../models/User');

/**
 * Authenticate socket.io connections using session
 */
function socketAuth(sessionMiddleware) {
  return (socket, next) => {
    // Wrap the session middleware
    sessionMiddleware(socket.request, {}, async (err) => {
      if (err) {
        logger.error('Socket session error', { error: err.message });
        return next(new Error('Session error'));
      }

      const session = socket.request.session;

      if (!session || !session.user) {
        logger.warn('Socket connection without authentication', {
          socketId: socket.id,
          handshake: socket.handshake.address
        });
        return next(new Error('Authentication required'));
      }

      try {
        // Verify user still exists
        const user = await User.findByPk(session.user.id);

        if (!user) {
          logger.warn('Socket connection with invalid user', {
            userId: session.user.id,
            socketId: socket.id
          });
          return next(new Error('User not found'));
        }

        // Check if user account is locked
        if (user.accountLocked) {
          logger.warn('Socket connection from locked account', {
            userId: user.id,
            socketId: socket.id
          });
          return next(new Error('Account locked'));
        }

        // Attach user to socket
        socket.user = {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName
        };

        logger.info('Socket authenticated', {
          userId: user.id,
          socketId: socket.id
        });

        next();
      } catch (error) {
        logger.error('Socket auth error', {
          error: error.message,
          stack: error.stack,
          socketId: socket.id
        });
        next(new Error('Authentication failed'));
      }
    });
  };
}

/**
 * Optional socket authentication - attach user if authenticated
 */
function socketOptionalAuth(sessionMiddleware) {
  return (socket, next) => {
    sessionMiddleware(socket.request, {}, async (err) => {
      if (err) {
        // Continue without authentication
        socket.user = null;
        return next();
      }

      const session = socket.request.session;

      if (!session || !session.user) {
        socket.user = null;
        return next();
      }

      try {
        const user = await User.findByPk(session.user.id);

        if (user && !user.accountLocked) {
          socket.user = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName
          };
        } else {
          socket.user = null;
        }

        next();
      } catch (error) {
        logger.error('Socket optional auth error', {
          error: error.message,
          socketId: socket.id
        });
        socket.user = null;
        next();
      }
    });
  };
}

/**
 * Require socket permissions
 */
function requireSocketPermissions(...permissions) {
  return async (socket, next) => {
    if (!socket.user) {
      return next(new Error('Authentication required'));
    }

    try {
      const user = await User.findByPk(socket.user.id, {
        include: [
          {
            association: 'roles',
            through: { attributes: [] }
          },
          {
            association: 'groups',
            include: [{
              association: 'roleSets',
              include: [{
                association: 'roles'
              }]
            }]
          }
        ]
      });

      if (!user) {
        return next(new Error('User not found'));
      }

      // Collect all user permissions
      const userPermissions = new Set();

      // Direct roles
      if (user.roles) {
        user.roles.forEach(role => {
          if (role.permissions && Array.isArray(role.permissions)) {
            role.permissions.forEach(p => userPermissions.add(p));
          }
        });
      }

      // Roles from groups
      if (user.groups) {
        user.groups.forEach(group => {
          if (group.roleSets) {
            group.roleSets.forEach(roleSet => {
              if (roleSet.roles) {
                roleSet.roles.forEach(role => {
                  if (role.permissions && Array.isArray(role.permissions)) {
                    role.permissions.forEach(p => userPermissions.add(p));
                  }
                });
              }
            });
          }
        });
      }

      // Check permissions
      const hasAllPermissions = permissions.every(p => userPermissions.has(p));

      if (!hasAllPermissions) {
        logger.warn('Socket permission denied', {
          userId: user.id,
          socketId: socket.id,
          required: permissions,
          has: Array.from(userPermissions)
        });
        return next(new Error('Insufficient permissions'));
      }

      // Attach permissions to socket
      socket.permissions = Array.from(userPermissions);

      next();
    } catch (error) {
      logger.error('Socket permission check error', {
        error: error.message,
        stack: error.stack,
        socketId: socket.id
      });
      next(new Error('Permission check failed'));
    }
  };
}

module.exports = {
  socketAuth,
  socketOptionalAuth,
  requireSocketPermissions
};
