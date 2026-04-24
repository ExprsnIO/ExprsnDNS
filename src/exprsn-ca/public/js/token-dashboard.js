/**
 * Token Dashboard JavaScript
 * Handles token generation, validation, and management
 */

let tokens = [];
let certificates = [];
let generatedTokenData = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadTokens();
    loadCertificates();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Filter change listeners
    document.getElementById('filterType')?.addEventListener('change', filterTokens);
    document.getElementById('filterResource')?.addEventListener('change', filterTokens);
    document.getElementById('filterStatus')?.addEventListener('change', filterTokens);

    // Modal show events
    document.getElementById('generateTokenModal')?.addEventListener('show.bs.modal', loadCertificates);
}

// Toggle expiry fields based on type
function toggleExpiryFields() {
    const expiryType = document.getElementById('expiryType').value;
    const timeFields = document.getElementById('timeExpiryFields');
    const useFields = document.getElementById('useExpiryFields');

    if (expiryType === 'time') {
        timeFields.style.display = 'block';
        useFields.style.display = 'none';
        document.querySelector('[name="expirySeconds"]').required = true;
        document.querySelector('[name="maxUses"]').required = false;
    } else if (expiryType === 'use') {
        timeFields.style.display = 'none';
        useFields.style.display = 'block';
        document.querySelector('[name="expirySeconds"]').required = false;
        document.querySelector('[name="maxUses"]').required = true;
    } else {
        timeFields.style.display = 'none';
        useFields.style.display = 'none';
        document.querySelector('[name="expirySeconds"]').required = false;
        document.querySelector('[name="maxUses"]').required = false;
    }
}

// Set expiry preset
function setExpiryPreset() {
    const preset = document.getElementById('timePreset').value;
    const secondsInput = document.getElementById('expirySeconds');

    const presets = {
        '1h': 3600,
        '24h': 86400,
        '7d': 604800,
        '30d': 2592000,
        '90d': 7776000,
        '1y': 31536000
    };

    if (preset && presets[preset]) {
        secondsInput.value = presets[preset];
    }
}

// Load all tokens
async function loadTokens() {
    try {
        const response = await fetch('/api/tokens?limit=100');
        const data = await response.json();

        if (data.success) {
            tokens = data.tokens || [];
            updateStatistics();
            renderTokens(tokens);
        } else {
            showError('Failed to load tokens');
        }
    } catch (error) {
        console.error('Error loading tokens:', error);
        showError('Error loading tokens: ' + error.message);
    }
}

// Load certificates for token generation
async function loadCertificates() {
    try {
        const response = await fetch('/api/certificates?status=active');
        const data = await response.json();

        if (data.success) {
            certificates = data.certificates || [];
            const select = document.getElementById('certSelect');

            if (!select) return;

            select.innerHTML = '<option value="">Select a certificate...</option>' +
                certificates.map(cert => `
                    <option value="${cert.id}">
                        ${escapeHtml(cert.commonName)} (${cert.type}) - Expires ${new Date(cert.notAfter).toLocaleDateString()}
                    </option>
                `).join('');
        }
    } catch (error) {
        console.error('Error loading certificates:', error);
    }
}

// Update statistics
function updateStatistics() {
    const total = tokens.length;
    const active = tokens.filter(t => t.status === 'active').length;
    const revoked = tokens.filter(t => t.status === 'revoked').length;

    // Calculate expiring soon (within 7 days for time-based tokens)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const expiring = tokens.filter(t => {
        return t.status === 'active' &&
               t.expiryType === 'time' &&
               t.expiresAt &&
               new Date(t.expiresAt) < sevenDaysFromNow;
    }).length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statActive').textContent = active;
    document.getElementById('statExpiring').textContent = expiring;
    document.getElementById('statRevoked').textContent = revoked;
}

// Render tokens in table
function renderTokens(tkns) {
    const tbody = document.getElementById('tokenList');

    if (tkns.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-muted">
                    <i class="bi bi-inbox fs-1 d-block mb-2"></i>
                    No tokens found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = tkns.map(token => {
        const permissions = token.permissions || {};
        const permBadges = Object.entries(permissions)
            .filter(([key, val]) => val)
            .map(([key]) => `<span class="permission-badge perm-${key}">${key}</span>`)
            .join('');

        return `
            <tr class="token-list-item">
                <td>
                    <span class="resource-badge">${token.resourceType}</span>
                    <br>
                    <small class="text-muted">${escapeHtml(truncate(token.resourceValue, 50))}</small>
                </td>
                <td>
                    <span class="token-type-badge token-type-${token.expiryType}">
                        ${token.expiryType}
                    </span>
                </td>
                <td>${permBadges || '<span class="text-muted">None</span>'}</td>
                <td>
                    ${formatExpiry(token)}
                </td>
                <td>
                    <span class="status-badge status-${token.status}">
                        ${token.status}
                    </span>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-primary" onclick="viewToken('${token.id}')" title="View Details">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button class="btn btn-outline-info" onclick="validateTokenById('${token.id}')" title="Validate">
                            <i class="bi bi-shield-check"></i>
                        </button>
                        ${token.status === 'active' ? `
                            <button class="btn btn-outline-danger" onclick="revokeToken('${token.id}')" title="Revoke">
                                <i class="bi bi-x-circle"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Filter tokens
function filterTokens() {
    const type = document.getElementById('filterType').value;
    const resource = document.getElementById('filterResource').value;
    const status = document.getElementById('filterStatus').value;

    const filtered = tokens.filter(token => {
        if (type && token.expiryType !== type) return false;
        if (resource && token.resourceType !== resource) return false;
        if (status && token.status !== status) return false;
        return true;
    });

    renderTokens(filtered);
}

// Generate token
async function generateToken() {
    const form = document.getElementById('generateTokenForm');
    const formData = new FormData(form);
    const data = {
        certificateId: formData.get('certificateId'),
        resourceType: formData.get('resourceType'),
        resourceValue: formData.get('resourceValue'),
        expiryType: formData.get('expiryType'),
        permissions: {
            read: formData.get('permissionRead') === 'on',
            write: formData.get('permissionWrite') === 'on',
            update: formData.get('permissionUpdate') === 'on',
            delete: formData.get('permissionDelete') === 'on',
            append: formData.get('permissionAppend') === 'on'
        }
    };

    // Add expiry-specific fields
    if (data.expiryType === 'time') {
        data.expirySeconds = parseInt(formData.get('expirySeconds'));
        if (!data.expirySeconds || data.expirySeconds < 60) {
            showError('Expiry time must be at least 60 seconds');
            return;
        }
    } else if (data.expiryType === 'use') {
        data.maxUses = parseInt(formData.get('maxUses'));
        if (!data.maxUses || data.maxUses < 1) {
            showError('Maximum uses must be at least 1');
            return;
        }
    }

    // Validate at least one permission is selected
    const hasPermissions = Object.values(data.permissions).some(p => p);
    if (!hasPermissions) {
        showError('Please select at least one permission');
        return;
    }

    try {
        showLoading('Generating token...');

        const response = await fetch('/api/tokens/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            hideLoading();
            showSuccess('Token generated successfully!');

            // Store token data
            generatedTokenData = result.token;

            // Show generated token modal
            document.getElementById('generatedTokenContent').textContent = JSON.stringify(result.token, null, 2);
            new bootstrap.Modal(document.getElementById('generatedTokenModal')).show();

            // Close generation modal
            bootstrap.Modal.getInstance(document.getElementById('generateTokenModal')).hide();
            form.reset();
            loadTokens();
        } else {
            hideLoading();
            showError('Failed to generate token: ' + result.error);
        }
    } catch (error) {
        hideLoading();
        console.error('Error:', error);
        showError('Error generating token: ' + error.message);
    }
}

// Validate token
async function validateToken() {
    const form = document.getElementById('validateTokenForm');
    const formData = new FormData(form);

    let tokenInput = formData.get('token').trim();
    let tokenId = tokenInput;

    // Try to parse as JSON if it looks like JSON
    if (tokenInput.startsWith('{')) {
        try {
            const parsed = JSON.parse(tokenInput);
            tokenId = parsed.id;
        } catch (e) {
            // Not valid JSON, use as is
        }
    }

    const data = {
        token: tokenInput,
        tokenId: tokenId
    };

    // Add required permissions if any selected
    const requiredPerms = {};
    if (formData.get('requiredRead') === 'on') requiredPerms.read = true;
    if (formData.get('requiredWrite') === 'on') requiredPerms.write = true;
    if (formData.get('requiredUpdate') === 'on') requiredPerms.update = true;
    if (formData.get('requiredDelete') === 'on') requiredPerms.delete = true;

    if (Object.keys(requiredPerms).length > 0) {
        data.requiredPermissions = requiredPerms;
    }

    // Add resource if specified
    const resource = formData.get('resourceValue');
    if (resource) {
        data.resource = resource;
    }

    try {
        const response = await fetch('/api/tokens/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        const resultDiv = document.getElementById('validationResult');
        resultDiv.style.display = 'block';

        if (result.valid) {
            resultDiv.innerHTML = `
                <div class="alert alert-success">
                    <h6 class="alert-heading">
                        <i class="bi bi-check-circle-fill"></i> Token is Valid
                    </h6>
                    <hr>
                    <p class="mb-2"><strong>Token ID:</strong> ${result.token.id || 'N/A'}</p>
                    ${result.userId ? `<p class="mb-2"><strong>User ID:</strong> ${result.userId}</p>` : ''}
                    <p class="mb-0"><strong>Permissions:</strong></p>
                    <div class="mt-2">
                        ${Object.entries(result.permissions || {})
                            .filter(([k, v]) => v)
                            .map(([k]) => `<span class="permission-badge perm-${k}">${k}</span>`)
                            .join('')}
                    </div>
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div class="alert alert-danger">
                    <h6 class="alert-heading">
                        <i class="bi bi-x-circle-fill"></i> Token is Invalid
                    </h6>
                    <hr>
                    <p class="mb-0"><strong>Error:</strong> ${result.error || result.reason || 'Unknown error'}</p>
                    ${result.message ? `<p class="mb-0 mt-2">${result.message}</p>` : ''}
                </div>
            `;
        }
    } catch (error) {
        console.error('Error:', error);
        document.getElementById('validationResult').innerHTML = `
            <div class="alert alert-danger">
                <strong>Error:</strong> ${error.message}
            </div>
        `;
        document.getElementById('validationResult').style.display = 'block';
    }
}

// Validate token by ID (from token list)
async function validateTokenById(id) {
    const token = tokens.find(t => t.id === id);
    if (!token) return;

    document.querySelector('#validateTokenForm [name="token"]').value = token.id;
    new bootstrap.Modal(document.getElementById('validateTokenModal')).show();

    // Auto-validate
    setTimeout(() => validateToken(), 500);
}

// View token details
async function viewToken(id) {
    const token = tokens.find(t => t.id === id);
    if (!token) {
        showError('Token not found');
        return;
    }

    const permissions = token.permissions || {};
    const permBadges = Object.entries(permissions)
        .filter(([key, val]) => val)
        .map(([key]) => `<span class="permission-badge perm-${key}">${key}</span>`)
        .join('');

    document.getElementById('tokenDetailContent').innerHTML = `
        <div class="row">
            <div class="col-md-6 mb-3">
                <label class="text-muted small">Token ID</label>
                <div class="fingerprint">${token.id}</div>
            </div>
            <div class="col-md-6 mb-3">
                <label class="text-muted small">Status</label>
                <div><span class="status-badge status-${token.status}">${token.status}</span></div>
            </div>
            <div class="col-md-6 mb-3">
                <label class="text-muted small">Resource Type</label>
                <div><span class="resource-badge">${token.resourceType}</span></div>
            </div>
            <div class="col-md-6 mb-3">
                <label class="text-muted small">Expiry Type</label>
                <div><span class="token-type-badge token-type-${token.expiryType}">${token.expiryType}</span></div>
            </div>
            <div class="col-12 mb-3">
                <label class="text-muted small">Resource Value</label>
                <div class="fingerprint">${escapeHtml(token.resourceValue)}</div>
            </div>
            <div class="col-12 mb-3">
                <label class="text-muted small">Permissions</label>
                <div>${permBadges || '<span class="text-muted">None</span>'}</div>
            </div>
            ${token.expiryType === 'time' && token.expiresAt ? `
            <div class="col-md-6 mb-3">
                <label class="text-muted small">Expires At</label>
                <div>${new Date(token.expiresAt).toLocaleString()}</div>
            </div>
            ` : ''}
            ${token.expiryType === 'use' ? `
            <div class="col-md-6 mb-3">
                <label class="text-muted small">Uses Remaining</label>
                <div>${token.usesRemaining || 0}</div>
            </div>
            ` : ''}
            <div class="col-md-6 mb-3">
                <label class="text-muted small">Created At</label>
                <div>${new Date(token.createdAt).toLocaleString()}</div>
            </div>
        </div>

        <div class="d-flex gap-2 mt-3">
            <button class="btn btn-primary" onclick="validateTokenById('${token.id}')">
                <i class="bi bi-shield-check"></i> Validate Token
            </button>
            ${token.status === 'active' ? `
                <button class="btn btn-danger" onclick="revokeToken('${token.id}')">
                    <i class="bi bi-x-circle"></i> Revoke Token
                </button>
            ` : ''}
        </div>
    `;

    new bootstrap.Modal(document.getElementById('tokenDetailModal')).show();
}

// Revoke token
async function revokeToken(id) {
    const token = tokens.find(t => t.id === id);
    if (!token) return;

    if (!confirm(`Are you sure you want to revoke this token?\n\nResource: ${token.resourceValue}\n\nThis action cannot be undone.`)) {
        return;
    }

    const reason = prompt('Revocation reason (optional):', 'User requested revocation');

    try {
        const response = await fetch('/api/tokens/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tokenId: token.id, reason: reason || 'User requested revocation' })
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('Token revoked successfully');
            loadTokens();

            // Close detail modal if open
            const detailModal = bootstrap.Modal.getInstance(document.getElementById('tokenDetailModal'));
            if (detailModal) {
                detailModal.hide();
            }
        } else {
            showError('Failed to revoke token: ' + result.error);
        }
    } catch (error) {
        console.error('Error:', error);
        showError('Error revoking token: ' + error.message);
    }
}

// Copy generated token
function copyGeneratedToken() {
    const content = document.getElementById('generatedTokenContent').textContent;
    navigator.clipboard.writeText(content).then(() => {
        showSuccess('Token copied to clipboard');
    }).catch(err => {
        showError('Failed to copy token: ' + err.message);
    });
}

// Download generated token
function downloadGeneratedToken() {
    const content = document.getElementById('generatedTokenContent').textContent;
    const blob = new Blob([content], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ca-token-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showSuccess('Token downloaded');
}

// Utility functions
function formatExpiry(token) {
    if (token.expiryType === 'time' && token.expiresAt) {
        const expiryDate = new Date(token.expiresAt);
        const now = new Date();
        const diff = expiryDate - now;

        if (diff < 0) {
            return '<span class="text-danger">Expired</span>';
        } else if (diff < 604800000) { // 7 days
            return `<span class="text-warning">${expiryDate.toLocaleDateString()}<br><small>Expiring soon!</small></span>`;
        } else {
            return expiryDate.toLocaleDateString();
        }
    } else if (token.expiryType === 'use') {
        return `${token.usesRemaining || 0} uses left`;
    } else {
        return '<span class="text-muted">Never</span>';
    }
}

function truncate(str, length) {
    if (str.length <= length) return str;
    return str.substring(0, length) + '...';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(message) {
    showToast(message, 'info', 0);
}

function hideLoading() {
    const toasts = document.querySelectorAll('.toast');
    toasts.forEach(t => {
        const bsToast = bootstrap.Toast.getInstance(t);
        if (bsToast) bsToast.hide();
    });
}

function showSuccess(message) {
    showToast(message, 'success');
}

function showError(message) {
    showToast(message, 'danger');
}

function showToast(message, type, autohide = 3000) {
    const toastContainer = document.getElementById('toastContainer') || createToastContainer();

    const toastId = 'toast-' + Date.now();
    const toastHtml = `
        <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert" ${autohide ? `data-bs-autohide="true" data-bs-delay="${autohide}"` : 'data-bs-autohide="false"'}>
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;

    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement);
    toast.show();

    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

function createToastContainer() {
    const container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
    container.style.zIndex = '9999';
    document.body.appendChild(container);
    return container;
}
