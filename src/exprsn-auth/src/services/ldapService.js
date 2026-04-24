/**
 * ═══════════════════════════════════════════════════════════
 * LDAP Service
 * Handles LDAP/Active Directory integration, authentication, and synchronization
 * ═══════════════════════════════════════════════════════════
 */

const ldap = require('ldapjs');
const { LdapConfig, User, Group, OrganizationMember, UserGroup, Role } = require('../models');
const logger = require('../utils/logger');
const bcrypt = require('bcrypt');

class LdapService {
  constructor() {
    this.activeConnections = new Map(); // Connection pool
    this.syncJobs = new Map(); // Active sync jobs
  }

  /**
   * Create LDAP client
   */
  createClient(config) {
    const protocol = config.useSSL ? 'ldaps' : 'ldap';
    const url = `${protocol}://${config.host}:${config.port}`;

    const clientOptions = {
      url,
      timeout: config.timeout || 10000,
      connectTimeout: config.timeout || 10000,
      reconnect: true
    };

    if (config.useTLS || config.useSSL) {
      clientOptions.tlsOptions = {
        rejectUnauthorized: config.verifyCertificate !== false,
        minVersion: config.allowWeakCiphers ? 'TLSv1' : 'TLSv1.2'
      };
    }

    return ldap.createClient(clientOptions);
  }

  /**
   * Bind to LDAP server
   */
  bind(client, dn, password) {
    return new Promise((resolve, reject) => {
      client.bind(dn, password, (err) => {
        if (err) {
          reject(new Error(`LDAP bind failed: ${err.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Search LDAP directory
   */
  search(client, base, options) {
    return new Promise((resolve, reject) => {
      const entries = [];
      const timeoutId = setTimeout(() => {
        reject(new Error('LDAP search timeout'));
      }, 30000); // 30 second timeout

      client.search(base, options, (err, res) => {
        if (err) {
          clearTimeout(timeoutId);
          reject(new Error(`LDAP search failed: ${err.message}`));
          return;
        }

        res.on('searchEntry', (entry) => {
          const attributes = {};
          entry.attributes.forEach(attr => {
            // Handle multi-value attributes
            if (attr.values && attr.values.length > 0) {
              attributes[attr.type] = attr.values.length === 1
                ? attr.values[0]
                : attr.values;
            }
          });

          entries.push({
            dn: entry.dn.toString(),
            attributes
          });
        });

        res.on('error', (err) => {
          clearTimeout(timeoutId);
          reject(new Error(`LDAP search error: ${err.message}`));
        });

        res.on('end', (result) => {
          clearTimeout(timeoutId);
          if (result.status !== 0) {
            reject(new Error(`LDAP search ended with status: ${result.status}`));
          } else {
            resolve(entries);
          }
        });
      });
    });
  }

  /**
   * Test LDAP connection
   */
  async testConnection(config) {
    const client = this.createClient(config);

    try {
      await this.bind(client, config.bindDN, config.bindPassword);

      // Try a simple search to verify configuration
      const testSearch = await this.search(client, config.baseDN, {
        filter: '(objectClass=*)',
        scope: 'base',
        attributes: ['dn']
      });

      client.unbind();

      return {
        success: true,
        message: 'Connection successful',
        baseDN: testSearch[0]?.dn || config.baseDN
      };
    } catch (error) {
      client.unbind();
      logger.error('LDAP connection test failed', { error: error.message, config: config.id });
      throw error;
    }
  }

  /**
   * Find user DN by username
   */
  async findUserDN(client, config, username) {
    const filter = config.userSearchFilter.replace(/{{username}}/g, this.escapeLdapFilter(username));

    try {
      const entries = await this.search(client, config.userSearchBase, {
        filter,
        scope: 'sub',
        attributes: ['dn']
      });

      return entries.length > 0 ? entries[0].dn : null;
    } catch (error) {
      logger.error('Failed to find user DN', { username, error: error.message });
      throw error;
    }
  }

  /**
   * Get user attributes from LDAP
   */
  async getUserAttributes(client, config, userDN) {
    try {
      const entries = await this.search(client, userDN, {
        scope: 'base',
        attributes: Object.values(config.attributeMapping)
      });

      if (entries.length === 0) {
        return null;
      }

      const ldapAttrs = entries[0].attributes;
      const mapping = config.attributeMapping;

      const attrs = {};
      for (const [exprsnKey, ldapKey] of Object.entries(mapping)) {
        if (ldapAttrs[ldapKey]) {
          // Handle array values
          attrs[exprsnKey] = Array.isArray(ldapAttrs[ldapKey])
            ? ldapAttrs[ldapKey][0]
            : ldapAttrs[ldapKey];
        }
      }

      return attrs;
    } catch (error) {
      logger.error('Failed to get user attributes', { userDN, error: error.message });
      throw error;
    }
  }

  /**
   * Authenticate user against LDAP
   */
  async authenticateUser(username, password, configId) {
    const config = await LdapConfig.findByPk(configId);
    if (!config) {
      throw new Error('LDAP configuration not found');
    }

    if (config.status !== 'active') {
      throw new Error('LDAP configuration is not active');
    }

    const client = this.createClient(config);

    try {
      // First, bind with service account
      await this.bind(client, config.bindDN, config.bindPassword);

      // Search for user
      const userDN = await this.findUserDN(client, config, username);

      if (!userDN) {
        client.unbind();

        // Update stats
        await config.update({
          stats: {
            ...config.stats,
            failedLogins: (config.stats.failedLogins || 0) + 1
          }
        });

        throw new Error('User not found in LDAP directory');
      }

      // Try to bind as user
      const userClient = this.createClient(config);
      await this.bind(userClient, userDN, password);

      // Fetch user attributes
      const userAttrs = await this.getUserAttributes(client, config, userDN);

      userClient.unbind();
      client.unbind();

      // Update stats
      await config.update({
        stats: {
          ...config.stats,
          totalLogins: (config.stats.totalLogins || 0) + 1,
          successfulLogins: (config.stats.successfulLogins || 0) + 1,
          lastLoginAt: new Date()
        }
      });

      logger.info('LDAP authentication successful', { username, configId });

      return {
        success: true,
        userDN,
        attributes: userAttrs
      };
    } catch (error) {
      client.unbind();

      // Update stats
      await config.update({
        stats: {
          ...config.stats,
          failedLogins: (config.stats.failedLogins || 0) + 1
        }
      });

      logger.error('LDAP authentication failed', { username, error: error.message });
      throw new Error('Invalid credentials');
    }
  }

  /**
   * Search for all users in LDAP
   */
  async searchUsers(client, config) {
    const filter = config.userSearchFilter.replace(/{{username}}/g, '*');

    try {
      const entries = await this.search(client, config.userSearchBase, {
        filter,
        scope: 'sub',
        attributes: Object.values(config.attributeMapping)
      });

      return entries;
    } catch (error) {
      logger.error('Failed to search users', { error: error.message });
      throw error;
    }
  }

  /**
   * Search for all groups in LDAP
   */
  async searchGroups(client, config) {
    if (!config.groupSearchBase) {
      return [];
    }

    try {
      const entries = await this.search(client, config.groupSearchBase, {
        filter: config.groupSearchFilter,
        scope: 'sub',
        attributes: ['cn', 'description', 'member', 'memberOf']
      });

      return entries;
    } catch (error) {
      logger.error('Failed to search groups', { error: error.message });
      throw error;
    }
  }

  /**
   * Sync single user from LDAP
   */
  async syncUser(config, ldapUser) {
    const mapping = config.attributeMapping;
    const attrs = ldapUser.attributes;

    const userData = {
      username: attrs[mapping.username],
      email: attrs[mapping.email],
      firstName: attrs[mapping.firstName] || '',
      lastName: attrs[mapping.lastName] || '',
      displayName: attrs[mapping.displayName] || `${attrs[mapping.firstName]} ${attrs[mapping.lastName]}`,
      phone: attrs[mapping.phone] || null,
      title: attrs[mapping.title] || null,
      department: attrs[mapping.department] || null,
      source: 'ldap',
      sourceId: ldapUser.dn,
      status: 'active',
      emailVerified: true, // LDAP users are pre-verified
      password: await bcrypt.hash(Math.random().toString(36), 10) // Random password, won't be used
    };

    // Find or create user
    const [user, created] = await User.findOrCreate({
      where: { email: userData.email },
      defaults: userData
    });

    if (!created && config.updateUserOnLogin) {
      // Update existing user
      await user.update(userData);
    }

    // Add to organization if configured
    if (config.organizationId) {
      await OrganizationMember.findOrCreate({
        where: {
          organizationId: config.organizationId,
          userId: user.id
        },
        defaults: {
          role: 'member',
          status: 'active'
        }
      });

      // Assign default role if configured
      if (config.defaultUserRole) {
        const role = await Role.findOne({
          where: { name: config.defaultUserRole }
        });

        if (role) {
          await user.addRole(role);
        }
      }
    }

    // Handle group memberships from LDAP
    if (attrs[mapping.memberOf]) {
      const memberOf = Array.isArray(attrs[mapping.memberOf])
        ? attrs[mapping.memberOf]
        : [attrs[mapping.memberOf]];

      await this.syncUserGroupMemberships(user, memberOf, config);
    }

    logger.info('User synced from LDAP', { userId: user.id, username: user.username, created });

    return { user, created };
  }

  /**
   * Sync user group memberships based on LDAP memberOf attribute
   */
  async syncUserGroupMemberships(user, memberOfDNs, config) {
    const groupMapping = config.groupMapping || {};

    for (const groupDN of memberOfDNs) {
      // Check if this LDAP group is mapped to an Exprsn group
      if (groupMapping[groupDN]) {
        const exprsnGroupId = groupMapping[groupDN];
        const group = await Group.findByPk(exprsnGroupId);

        if (group) {
          await UserGroup.findOrCreate({
            where: {
              userId: user.id,
              groupId: group.id
            }
          });
        }
      }
    }
  }

  /**
   * Sync single group from LDAP
   */
  async syncGroup(config, ldapGroup) {
    const attrs = ldapGroup.attributes;

    const groupData = {
      name: attrs.cn,
      slug: attrs.cn.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      description: attrs.description || '',
      organizationId: config.organizationId,
      type: 'organization',
      metadata: {
        ldapDN: ldapGroup.dn,
        source: 'ldap',
        syncedAt: new Date()
      }
    };

    const [group, created] = await Group.findOrCreate({
      where: {
        organizationId: config.organizationId,
        slug: groupData.slug
      },
      defaults: groupData
    });

    if (!created) {
      await group.update(groupData);
    }

    logger.info('Group synced from LDAP', { groupId: group.id, name: group.name, created });

    return { group, created };
  }

  /**
   * Sync all users from LDAP
   */
  async syncUsers(configId) {
    const config = await LdapConfig.findByPk(configId);
    if (!config) {
      throw new Error('LDAP configuration not found');
    }

    if (!config.syncEnabled || !config.syncUsers) {
      throw new Error('User sync is not enabled for this configuration');
    }

    const client = this.createClient(config);

    try {
      await this.bind(client, config.bindDN, config.bindPassword);

      const ldapUsers = await this.searchUsers(client, config);

      const syncResults = {
        created: 0,
        updated: 0,
        errors: [],
        total: ldapUsers.length
      };

      for (const ldapUser of ldapUsers) {
        try {
          const { user, created } = await this.syncUser(config, ldapUser);
          if (created) {
            syncResults.created++;
          } else {
            syncResults.updated++;
          }
        } catch (err) {
          logger.error('Failed to sync user', { dn: ldapUser.dn, error: err.message });
          syncResults.errors.push({
            dn: ldapUser.dn,
            error: err.message
          });
        }
      }

      // Update last sync time and status
      await config.update({
        lastSyncAt: new Date(),
        lastSyncStatus: syncResults.errors.length > 0 ? 'partial' : 'success',
        lastSyncError: syncResults.errors.length > 0
          ? `${syncResults.errors.length} errors during sync`
          : null,
        stats: {
          ...config.stats,
          usersSynced: syncResults.created + syncResults.updated
        }
      });

      client.unbind();

      logger.info('LDAP user sync completed', { configId, results: syncResults });

      return syncResults;
    } catch (error) {
      client.unbind();

      await config.update({
        lastSyncAt: new Date(),
        lastSyncStatus: 'failed',
        lastSyncError: error.message
      });

      logger.error('LDAP user sync failed', { configId, error: error.message });
      throw error;
    }
  }

  /**
   * Sync all groups from LDAP
   */
  async syncGroups(configId) {
    const config = await LdapConfig.findByPk(configId);
    if (!config) {
      throw new Error('LDAP configuration not found');
    }

    if (!config.syncEnabled || !config.syncGroups) {
      throw new Error('Group sync is not enabled for this configuration');
    }

    if (!config.groupSearchBase) {
      throw new Error('Group search base is not configured');
    }

    const client = this.createClient(config);

    try {
      await this.bind(client, config.bindDN, config.bindPassword);

      const ldapGroups = await this.searchGroups(client, config);

      const syncResults = {
        created: 0,
        updated: 0,
        errors: [],
        total: ldapGroups.length
      };

      for (const ldapGroup of ldapGroups) {
        try {
          const { group, created } = await this.syncGroup(config, ldapGroup);
          if (created) {
            syncResults.created++;
          } else {
            syncResults.updated++;
          }
        } catch (err) {
          logger.error('Failed to sync group', { dn: ldapGroup.dn, error: err.message });
          syncResults.errors.push({
            dn: ldapGroup.dn,
            error: err.message
          });
        }
      }

      // Update stats
      await config.update({
        stats: {
          ...config.stats,
          groupsSynced: syncResults.created + syncResults.updated
        }
      });

      client.unbind();

      logger.info('LDAP group sync completed', { configId, results: syncResults });

      return syncResults;
    } catch (error) {
      client.unbind();
      logger.error('LDAP group sync failed', { configId, error: error.message });
      throw error;
    }
  }

  /**
   * Sync both users and groups
   */
  async syncAll(configId) {
    const userResults = await this.syncUsers(configId);
    const groupResults = await this.syncGroups(configId);

    return {
      users: userResults,
      groups: groupResults
    };
  }

  /**
   * Escape LDAP filter special characters
   */
  escapeLdapFilter(str) {
    return str.replace(/[*()\\\x00]/g, (match) => {
      return '\\' + match.charCodeAt(0).toString(16).padStart(2, '0');
    });
  }

  /**
   * Start periodic sync for a configuration
   */
  async startPeriodicSync(configId) {
    const config = await LdapConfig.findByPk(configId);
    if (!config || !config.syncEnabled) {
      return;
    }

    // Clear existing sync job if any
    if (this.syncJobs.has(configId)) {
      clearInterval(this.syncJobs.get(configId));
    }

    // Start new sync job
    const intervalId = setInterval(async () => {
      try {
        logger.info('Starting periodic LDAP sync', { configId });
        await this.syncAll(configId);
      } catch (error) {
        logger.error('Periodic LDAP sync failed', { configId, error: error.message });
      }
    }, config.syncInterval);

    this.syncJobs.set(configId, intervalId);

    logger.info('Periodic LDAP sync started', { configId, interval: config.syncInterval });
  }

  /**
   * Stop periodic sync for a configuration
   */
  stopPeriodicSync(configId) {
    if (this.syncJobs.has(configId)) {
      clearInterval(this.syncJobs.get(configId));
      this.syncJobs.delete(configId);
      logger.info('Periodic LDAP sync stopped', { configId });
    }
  }

  /**
   * Initialize all active periodic syncs
   */
  async initializePeriodicSyncs() {
    const activeConfigs = await LdapConfig.findAll({
      where: {
        status: 'active',
        syncEnabled: true
      }
    });

    for (const config of activeConfigs) {
      await this.startPeriodicSync(config.id);
    }

    logger.info('LDAP periodic syncs initialized', { count: activeConfigs.length });
  }
}

module.exports = new LdapService();
