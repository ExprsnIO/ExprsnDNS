/**
 * ═══════════════════════════════════════════════════════════
 * Admin Dashboard - Real-time Interface
 * Socket.IO integration for live data updates
 * ═══════════════════════════════════════════════════════════
 */

(function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // State Management
    // ═══════════════════════════════════════════════════════════

    const state = {
        socket: null,
        connected: false,
        stats: null,
        activityOffset: 0,
        activityLimit: 50,
        autoRefresh: true,
        refreshInterval: 30000 // 30 seconds
    };

    // ═══════════════════════════════════════════════════════════
    // Socket.IO Connection
    // ═══════════════════════════════════════════════════════════

    function initializeSocket() {
        state.socket = io();

        state.socket.on('connect', () => {
            console.log('Socket.IO connected');
            state.connected = true;
            updateConnectionStatus(true);

            // Subscribe to dashboard events
            state.socket.emit('dashboard:subscribe');
        });

        state.socket.on('disconnect', () => {
            console.log('Socket.IO disconnected');
            state.connected = false;
            updateConnectionStatus(false);
        });

        state.socket.on('reconnect', () => {
            console.log('Socket.IO reconnected');
            state.connected = true;
            updateConnectionStatus(true);
            loadDashboardData();
        });

        // Dashboard statistics updates
        state.socket.on('dashboard:stats', (data) => {
            console.log('Dashboard stats updated', data);
            if (data.stats) {
                updateStatistics(data.stats);
            }
        });

        // Certificate events
        state.socket.on('certificate:created', (data) => {
            console.log('Certificate created', data);
            incrementStat('certificates', 1);
            addActivityNotification('certificate', 'created', data);
            loadRecentCertificates();
        });

        state.socket.on('certificate:revoked', (data) => {
            console.log('Certificate revoked', data);
            addActivityNotification('certificate', 'revoked', data);
            loadRecentCertificates();
        });

        state.socket.on('certificates:updated', (data) => {
            console.log('Certificates updated', data);
            loadRecentCertificates();
        });

        // Token events
        state.socket.on('token:created', (data) => {
            console.log('Token created', data);
            incrementStat('tokens', 1);
            addActivityNotification('token', 'created', data);
            loadRecentTokens();
        });

        state.socket.on('token:revoked', (data) => {
            console.log('Token revoked', data);
            addActivityNotification('token', 'revoked', data);
            loadRecentTokens();
        });

        state.socket.on('tokens:updated', (data) => {
            console.log('Tokens updated', data);
            loadRecentTokens();
        });

        // System notifications
        state.socket.on('system:notification', (data) => {
            console.log('System notification', data);
            showNotification(data.message, data.level);
        });

        // User events
        state.socket.on('user:login', (data) => {
            console.log('User logged in', data);
            addActivityNotification('user', 'login', data);
        });
    }

    // ═══════════════════════════════════════════════════════════
    // Data Loading
    // ═══════════════════════════════════════════════════════════

    async function loadDashboardData() {
        await Promise.all([
            loadStatistics(),
            loadSystemHealth(),
            loadRecentActivity(),
            loadRecentCertificates(),
            loadRecentTokens()
        ]);
    }

    async function loadStatistics() {
        try {
            const response = await fetch('/admin/api/stats');
            const data = await response.json();
            state.stats = data;
            updateStatistics(data);
        } catch (error) {
            console.error('Failed to load statistics:', error);
            showNotification('Failed to load statistics', 'error');
        }
    }

    async function loadSystemHealth() {
        try {
            const response = await fetch('/admin/api/health');
            const health = await response.json();
            updateSystemHealth(health);
        } catch (error) {
            console.error('Failed to load system health:', error);
        }
    }

    async function loadRecentActivity() {
        try {
            const response = await fetch(`/admin/api/activity?limit=${state.activityLimit}&offset=${state.activityOffset}`);
            const data = await response.json();
            renderActivityLog(data.activities, data.pagination);
        } catch (error) {
            console.error('Failed to load activity:', error);
        }
    }

    async function loadRecentCertificates() {
        try {
            const response = await fetch('/admin/api/certificates/recent?limit=20');
            const certificates = await response.json();
            renderRecentCertificates(certificates);
        } catch (error) {
            console.error('Failed to load certificates:', error);
        }
    }

    async function loadRecentTokens() {
        try {
            const response = await fetch('/admin/api/tokens/recent?limit=20');
            const tokens = await response.json();
            renderRecentTokens(tokens);
        } catch (error) {
            console.error('Failed to load tokens:', error);
        }
    }

    async function loadUsers(search = '') {
        try {
            const response = await fetch(`/admin/api/users?search=${encodeURIComponent(search)}`);
            const data = await response.json();
            renderUsersList(data.users);
        } catch (error) {
            console.error('Failed to load users:', error);
        }
    }

    async function loadGroups() {
        try {
            const response = await fetch('/admin/api/groups');
            const groups = await response.json();
            renderGroupsList(groups);
        } catch (error) {
            console.error('Failed to load groups:', error);
        }
    }

    async function loadRoles() {
        try {
            const response = await fetch('/admin/api/roles');
            const roles = await response.json();
            renderRolesList(roles);
        } catch (error) {
            console.error('Failed to load roles:', error);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // UI Updates
    // ═══════════════════════════════════════════════════════════

    function updateConnectionStatus(connected) {
        const statusEl = document.getElementById('connectionStatus');
        if (!statusEl) return;

        if (connected) {
            statusEl.innerHTML = `
                <div class="alert alert-success mb-0 py-2 px-3 d-flex align-items-center gap-2">
                    <span class="health-indicator health-healthy"></span>
                    <small><strong>Connected</strong></small>
                </div>
            `;
        } else {
            statusEl.innerHTML = `
                <div class="alert alert-warning mb-0 py-2 px-3 d-flex align-items-center gap-2">
                    <span class="health-indicator health-degraded"></span>
                    <small><strong>Disconnected</strong></small>
                </div>
            `;
        }
    }

    function updateStatistics(stats) {
        // Certificates
        updateStatElement('totalCertificates', stats.certificates.total);
        updateStatElement('activeCertificates', `${stats.certificates.active} active`);
        updateStatElement('certChange', `+${stats.certificates.last24h} today`);
        updateProgressBar('certActiveBar', (stats.certificates.active / stats.certificates.total) * 100);

        // Tokens
        updateStatElement('totalTokens', stats.tokens.total);
        updateStatElement('activeTokens', `${stats.tokens.active} active`);
        updateStatElement('tokenChange', `+${stats.tokens.last24h} today`);
        updateProgressBar('tokenActiveBar', (stats.tokens.active / stats.tokens.total) * 100);

        // Users
        updateStatElement('totalUsers', stats.users.total);
        updateStatElement('activeUsers', `${stats.users.active} active`);
        updateStatElement('userChange', `+${stats.users.last24h} today`);
        updateProgressBar('userActiveBar', (stats.users.active / stats.users.total) * 100);

        // Activity
        updateStatElement('activityCount', stats.auditLogs.last24h);
        updateStatElement('activityWeek', `${stats.auditLogs.lastWeek} this week`);
        updateProgressBar('activityBar', Math.min((stats.auditLogs.last24h / 100) * 100, 100));

        // Update distributions
        renderCertificateDistribution(stats.certificates.byType);
        renderTokenDistribution(stats.tokens.byExpiryType);

        // Update last updated time
        updateLastUpdated();
    }

    function updateSystemHealth(health) {
        const statusEl = document.getElementById('systemHealthStatus');
        if (statusEl) {
            const statusClass = health.status === 'healthy' ? 'success' : health.status === 'degraded' ? 'warning' : 'danger';
            const healthClass = health.status === 'healthy' ? 'healthy' : health.status === 'degraded' ? 'degraded' : 'unhealthy';
            statusEl.innerHTML = `
                <span class="health-indicator health-${healthClass}"></span>
                <strong class="text-${statusClass}">${health.status.charAt(0).toUpperCase() + health.status.slice(1)}</strong>
            `;
        }

        // Database health
        updateHealthIndicator('dbHealth', health.database.status);
        updateStatElement('dbLatency', `${health.database.latency} ms`);

        // Cache health
        updateHealthIndicator('cacheHealth', health.cache.status);
        updateStatElement('cacheLatency', health.cache.status === 'disabled' ? 'disabled' : `${health.cache.latency} ms`);

        // Memory
        const memPercent = health.memory.percentage.toFixed(1);
        updateStatElement('memoryUsage', `${memPercent}%`);
        updateProgressBar('memoryBar', memPercent);

        // Uptime
        const uptime = formatUptime(health.uptime);
        updateStatElement('uptime', uptime);
    }

    function updateHealthIndicator(elementId, status) {
        const el = document.getElementById(elementId);
        if (!el) return;

        const indicator = el.querySelector('.health-indicator');
        if (indicator) {
            indicator.className = 'health-indicator';
            if (status === 'healthy') {
                indicator.classList.add('health-healthy');
            } else if (status === 'degraded' || status === 'disabled') {
                indicator.classList.add('health-degraded');
            } else {
                indicator.classList.add('health-unhealthy');
            }
        }
    }

    function updateStatElement(id, value) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = value;
        }
    }

    function updateProgressBar(id, percentage) {
        const el = document.getElementById(id);
        if (el) {
            el.style.width = `${Math.min(percentage, 100)}%`;
        }
    }

    function updateLastUpdated() {
        const el = document.getElementById('lastUpdated');
        if (el) {
            const now = new Date();
            el.textContent = now.toLocaleTimeString();
        }
    }

    function incrementStat(type, amount) {
        const totalEl = document.getElementById(`total${type.charAt(0).toUpperCase() + type.slice(1)}`);
        if (totalEl) {
            const current = parseInt(totalEl.textContent) || 0;
            totalEl.textContent = current + amount;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Rendering Functions
    // ═══════════════════════════════════════════════════════════

    function renderActivityLog(activities, pagination) {
        const container = document.getElementById('activityLog');
        if (!container) return;

        if (activities.length === 0) {
            container.innerHTML = '<p class="text-muted text-center py-5">No recent activity</p>';
            return;
        }

        container.innerHTML = activities.map(activity => `
            <div class="activity-item">
                <div class="d-flex justify-content-between">
                    <div>
                        <strong>${escapeHtml(activity.action)}</strong>
                        ${activity.user ? `by <span class="text-primary">${escapeHtml(activity.user.username)}</span>` : ''}
                    </div>
                    <small class="text-muted">${formatTimestamp(activity.timestamp)}</small>
                </div>
                ${activity.details ? `<div class="small text-muted mt-1">${escapeHtml(JSON.stringify(activity.details))}</div>` : ''}
            </div>
        `).join('');

        // Show/hide load more button
        const loadMoreBtn = document.getElementById('loadMoreActivity');
        if (loadMoreBtn) {
            loadMoreBtn.style.display = pagination.hasMore ? 'block' : 'none';
        }
    }

    function renderRecentCertificates(certificates) {
        const container = document.getElementById('recentCertificates');
        if (!container) return;

        if (certificates.length === 0) {
            container.innerHTML = '<p class="text-muted text-center py-5">No certificates yet</p>';
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Common Name</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Owner</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${certificates.map(cert => `
                            <tr>
                                <td><strong>${escapeHtml(cert.commonName)}</strong></td>
                                <td><span class="badge bg-info">${escapeHtml(cert.certificateType)}</span></td>
                                <td><span class="badge bg-${cert.status === 'active' ? 'success' : 'danger'}">${escapeHtml(cert.status)}</span></td>
                                <td>${cert.user ? escapeHtml(cert.user.username) : 'N/A'}</td>
                                <td>${formatTimestamp(cert.createdAt)}</td>
                                <td>
                                    <a href="/certificates/${cert.id}" class="btn btn-sm btn-outline-primary">View</a>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderRecentTokens(tokens) {
        const container = document.getElementById('recentTokens');
        if (!container) return;

        if (tokens.length === 0) {
            container.innerHTML = '<p class="text-muted text-center py-5">No tokens yet</p>';
            return;
        }

        container.innerHTML = `
            <div class="table-responsive">
                <table class="table table-hover">
                    <thead>
                        <tr>
                            <th>Resource</th>
                            <th>Type</th>
                            <th>Status</th>
                            <th>Owner</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tokens.map(token => `
                            <tr>
                                <td><code>${escapeHtml(token.resourceValue.substring(0, 40))}...</code></td>
                                <td><span class="badge bg-secondary">${escapeHtml(token.expiryType)}</span></td>
                                <td><span class="badge bg-${token.status === 'active' ? 'success' : 'danger'}">${escapeHtml(token.status)}</span></td>
                                <td>${token.user ? escapeHtml(token.user.username) : 'N/A'}</td>
                                <td>${formatTimestamp(token.createdAt)}</td>
                                <td>
                                    <a href="/tokens/${token.id}" class="btn btn-sm btn-outline-primary">View</a>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    function renderUsersList(users) {
        const container = document.getElementById('usersList');
        if (!container) return;

        if (users.length === 0) {
            container.innerHTML = '<p class="text-muted text-center py-3">No users found</p>';
            return;
        }

        container.innerHTML = `
            <div class="list-group">
                ${users.map(user => `
                    <div class="list-group-item">
                        <div class="d-flex justify-content-between align-items-start">
                            <div>
                                <strong>${escapeHtml(user.username)}</strong>
                                <div class="small text-muted">${escapeHtml(user.email)}</div>
                            </div>
                            <span class="badge bg-${user.status === 'active' ? 'success' : 'secondary'}">${escapeHtml(user.status)}</span>
                        </div>
                        <div class="small text-muted mt-1">
                            ${user.locked ? '<span class="text-danger">🔒 Locked</span>' : ''}
                            Last login: ${user.lastLoginAt ? formatTimestamp(user.lastLoginAt) : 'Never'}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderGroupsList(groups) {
        const container = document.getElementById('groupsList');
        if (!container) return;

        if (groups.length === 0) {
            container.innerHTML = '<p class="text-muted text-center py-3">No groups</p>';
            return;
        }

        container.innerHTML = `
            <div class="list-group">
                ${groups.map(group => `
                    <div class="list-group-item">
                        <div class="d-flex justify-content-between align-items-center">
                            <strong>${escapeHtml(group.name)}</strong>
                            <span class="badge bg-primary">${group.users ? group.users.length : 0} users</span>
                        </div>
                        ${group.description ? `<div class="small text-muted mt-1">${escapeHtml(group.description)}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderRolesList(roles) {
        const container = document.getElementById('rolesList');
        if (!container) return;

        if (roles.length === 0) {
            container.innerHTML = '<p class="text-muted text-center py-3">No roles</p>';
            return;
        }

        container.innerHTML = `
            <div class="list-group">
                ${roles.map(role => `
                    <div class="list-group-item">
                        <strong>${escapeHtml(role.name)}</strong>
                        ${role.description ? `<div class="small text-muted mt-1">${escapeHtml(role.description)}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderCertificateDistribution(byType) {
        const container = document.getElementById('certTypeDistribution');
        if (!container) return;

        if (!byType || byType.length === 0) {
            container.innerHTML = '<p class="text-muted text-center py-3">No data</p>';
            return;
        }

        const total = byType.reduce((sum, item) => sum + parseInt(item.count), 0);

        container.innerHTML = `
            <div class="distribution-list">
                ${byType.map(item => {
                    const percentage = (parseInt(item.count) / total * 100).toFixed(1);
                    return `
                        <div class="mb-3">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="text-capitalize">${escapeHtml(item.certificateType)}</span>
                                <strong>${item.count}</strong>
                            </div>
                            <div class="metric-bar">
                                <div class="metric-bar-fill" style="width: ${percentage}%"></div>
                            </div>
                            <small class="text-muted">${percentage}%</small>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function renderTokenDistribution(byType) {
        const container = document.getElementById('tokenTypeDistribution');
        if (!container) return;

        if (!byType || byType.length === 0) {
            container.innerHTML = '<p class="text-muted text-center py-3">No data</p>';
            return;
        }

        const total = byType.reduce((sum, item) => sum + parseInt(item.count), 0);

        container.innerHTML = `
            <div class="distribution-list">
                ${byType.map(item => {
                    const percentage = (parseInt(item.count) / total * 100).toFixed(1);
                    return `
                        <div class="mb-3">
                            <div class="d-flex justify-content-between align-items-center mb-1">
                                <span class="text-capitalize">${escapeHtml(item.expiryType)}</span>
                                <strong>${item.count}</strong>
                            </div>
                            <div class="metric-bar">
                                <div class="metric-bar-fill" style="width: ${percentage}%"></div>
                            </div>
                            <small class="text-muted">${percentage}%</small>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    function addActivityNotification(type, action, data) {
        showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} ${action}`, 'info');
        // Refresh activity log if on activity tab
        const activeTab = document.querySelector('#activity-tab');
        if (activeTab && activeTab.classList.contains('active')) {
            loadRecentActivity();
        }
    }

    function showNotification(message, level = 'info') {
        // Create toast notification
        const toastContainer = document.getElementById('toastContainer') || createToastContainer();

        const toast = document.createElement('div');
        toast.className = `toast align-items-center text-white bg-${level === 'error' ? 'danger' : level === 'warning' ? 'warning' : level === 'success' ? 'success' : 'info'} border-0`;
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">${escapeHtml(message)}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        `;

        toastContainer.appendChild(toast);
        const bsToast = new bootstrap.Toast(toast);
        bsToast.show();

        toast.addEventListener('hidden.bs.toast', () => {
            toast.remove();
        });
    }

    function createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container position-fixed top-0 end-0 p-3';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
        return container;
    }

    // ═══════════════════════════════════════════════════════════
    // Utility Functions
    // ═══════════════════════════════════════════════════════════

    function formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

        return date.toLocaleDateString();
    }

    function formatUptime(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (days > 0) return `${days}d ${hours}h`;
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    }

    function escapeHtml(text) {
        if (typeof text !== 'string') return text;
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ═══════════════════════════════════════════════════════════
    // Event Handlers
    // ═══════════════════════════════════════════════════════════

    function setupEventHandlers() {
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                loadDashboardData();
            });
        }

        // Tab change events
        const tabButtons = document.querySelectorAll('[data-bs-toggle="tab"]');
        tabButtons.forEach(button => {
            button.addEventListener('shown.bs.tab', (event) => {
                const target = event.target.getAttribute('data-bs-target');
                if (target === '#users') {
                    loadUsers();
                    loadGroups();
                    loadRoles();
                } else if (target === '#activity') {
                    loadRecentActivity();
                } else if (target === '#certificates') {
                    loadRecentCertificates();
                } else if (target === '#tokens') {
                    loadRecentTokens();
                }
            });
        });

        // User search
        const userSearch = document.getElementById('userSearch');
        if (userSearch) {
            let searchTimeout;
            userSearch.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    loadUsers(e.target.value);
                }, 300);
            });
        }

        // Load more activity
        const loadMoreBtn = document.getElementById('loadMoreActivity');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', () => {
                state.activityOffset += state.activityLimit;
                loadRecentActivity();
            });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // Auto Refresh
    // ═══════════════════════════════════════════════════════════

    function startAutoRefresh() {
        setInterval(() => {
            if (state.autoRefresh && state.connected) {
                loadStatistics();
                loadSystemHealth();
            }
        }, state.refreshInterval);
    }

    // ═══════════════════════════════════════════════════════════
    // Initialization
    // ═══════════════════════════════════════════════════════════

    function initialize() {
        console.log('Initializing admin dashboard...');

        initializeSocket();
        setupEventHandlers();
        loadDashboardData();
        startAutoRefresh();

        console.log('Admin dashboard initialized');
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }

})();
