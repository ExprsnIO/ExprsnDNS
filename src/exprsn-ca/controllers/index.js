/**
 * ═══════════════════════════════════════════════════════════
 * Controllers Index
 * ═══════════════════════════════════════════════════════════
 */

const authController = require('./authController');
const certificateController = require('./certificateController');
const tokenController = require('./tokenController');
const userController = require('./userController');

module.exports = {
  auth: authController,
  certificates: certificateController,
  tokens: tokenController,
  users: userController
};
