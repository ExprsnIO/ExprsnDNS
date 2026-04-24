/**
 * Certificate Dashboard JavaScript
 * Handles certificate generation, viewing, and management
 */

let certificates = [];
let rootCertificates = [];
let issuerCertificates = [];

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadCertificates();
    setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
    // Filter change listeners
    document.getElementById('filterType')?.addEventListener('change', filterCertificates);
    document.getElementById('filterStatus')?.addEventListener('change', filterCertificates);

    // Modal show events to load issuer options
    document.getElementById('intermediateCertModal')?.addEventListener('show.bs.modal', loadRootCertificates);
    document.getElementById('entityCertModal')?.addEventListener('show.bs.modal', loadIssuerCertificates);
}

// Load all certificates
async function loadCertificates() {
    try {
        const response = await fetch('/api/certificates?limit=100');
        const data = await response.json();

        if (data.success) {
            certificates = data.certificates || [];
            updateStatistics();
            renderCertificates(certificates);
        } else {
            showError('Failed to load certificates');
        }
    } catch (error) {
        console.error('Error loading certificates:', error);
        showError('Error loading certificates: ' + error.message);
    }
}

// Update statistics
function updateStatistics() {
    const total = certificates.length;
    const active = certificates.filter(c => c.status === 'active').length;
    const revoked = certificates.filter(c => c.status === 'revoked').length;

    // Calculate expiring soon (within 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const expiring = certificates.filter(c => {
        return c.status === 'active' && new Date(c.notAfter) < thirtyDaysFromNow;
    }).length;

    document.getElementById('statTotal').textContent = total;
    document.getElementById('statActive').textContent = active;
    document.getElementById('statExpiring').textContent = expiring;
    document.getElementById('statRevoked').textContent = revoked;
}

// Render certificates in table
function renderCertificates(certs) {
    const tbody = document.getElementById('certificateList');

    if (certs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-4 text-muted">
                    <i class="bi bi-inbox fs-1 d-block mb-2"></i>
                    No certificates found
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = certs.map(cert => `
        <tr class="cert-list-item">
            <td>
                <strong>${escapeHtml(cert.commonName)}</strong>
                ${cert.organization ? `<br><small class="text-muted">${escapeHtml(cert.organization)}</small>` : ''}
            </td>
            <td>
                <span class="cert-type-badge cert-type-${cert.type || 'client'}">
                    ${cert.type || 'client'}
                </span>
            </td>
            <td>
                <span class="status-badge status-${cert.status}">
                    ${cert.status}
                </span>
            </td>
            <td>
                <code class="small">${cert.serialNumber.substring(0, 16)}...</code>
            </td>
            <td>
                ${new Date(cert.notAfter).toLocaleDateString()}
                ${isExpiringSoon(cert.notAfter) ? '<br><small class="text-warning"><i class="bi bi-exclamation-triangle"></i> Expiring soon</small>' : ''}
            </td>
            <td>
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="viewCertificate('${cert.id}')" title="View Details">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-outline-success" onclick="downloadCertificate('${cert.id}')" title="Download">
                        <i class="bi bi-download"></i>
                    </button>
                    ${cert.status === 'active' ? `
                        <button class="btn btn-outline-danger" onclick="revokeCertificate('${cert.id}')" title="Revoke">
                            <i class="bi bi-x-circle"></i>
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

// Filter certificates
function filterCertificates() {
    const type = document.getElementById('filterType').value;
    const status = document.getElementById('filterStatus').value;

    const filtered = certificates.filter(cert => {
        if (type && cert.type !== type) return false;
        if (status && cert.status !== status) return false;
        return true;
    });

    renderCertificates(filtered);
}

// Generate Root CA Certificate
async function generateRootCert() {
    const form = document.getElementById('rootCertForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    // Convert validityYears to number
    data.validityYears = parseInt(data.validityYears);

    try {
        showLoading('Generating root CA certificate...');

        const response = await fetch('/api/certificates/generate-root', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            hideLoading();
            showSuccess('Root CA certificate generated successfully!');
            bootstrap.Modal.getInstance(document.getElementById('rootCertModal')).hide();
            form.reset();
            loadCertificates();
        } else {
            hideLoading();
            showError('Failed to generate certificate: ' + result.error);
        }
    } catch (error) {
        hideLoading();
        console.error('Error:', error);
        showError('Error generating certificate: ' + error.message);
    }
}

// Generate Intermediate CA Certificate
async function generateIntermediateCert() {
    const form = document.getElementById('intermediateCertForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    // Convert validityYears to number
    data.validityYears = parseInt(data.validityYears);
    data.pathLen = parseInt(data.pathLen);

    try {
        showLoading('Generating intermediate CA certificate...');

        const response = await fetch('/api/certificates/generate-intermediate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            hideLoading();
            showSuccess('Intermediate CA certificate generated successfully!');
            bootstrap.Modal.getInstance(document.getElementById('intermediateCertModal')).hide();
            form.reset();
            loadCertificates();
        } else {
            hideLoading();
            showError('Failed to generate certificate: ' + result.error);
        }
    } catch (error) {
        hideLoading();
        console.error('Error:', error);
        showError('Error generating certificate: ' + error.message);
    }
}

// Generate Entity Certificate
async function generateEntityCert() {
    const form = document.getElementById('entityCertForm');
    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    // Convert numeric fields
    data.validityDays = parseInt(data.validityDays);
    data.keySize = parseInt(data.keySize);

    // Parse SANs
    if (data.subjectAltNames) {
        data.subjectAltNames = data.subjectAltNames
            .split('\n')
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }

    try {
        showLoading('Generating entity certificate...');

        const response = await fetch('/api/certificates/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            hideLoading();
            showSuccess('Entity certificate generated successfully!');

            // Show the private key
            showPrivateKey(result.certificate.commonName, result.privateKey);

            bootstrap.Modal.getInstance(document.getElementById('entityCertModal')).hide();
            form.reset();
            loadCertificates();
        } else {
            hideLoading();
            showError('Failed to generate certificate: ' + result.error);
        }
    } catch (error) {
        hideLoading();
        console.error('Error:', error);
        showError('Error generating certificate: ' + error.message);
    }
}

// Load root certificates for intermediate CA generation
async function loadRootCertificates() {
    try {
        const response = await fetch('/api/certificates?type=root&status=active');
        const data = await response.json();

        if (data.success) {
            rootCertificates = data.certificates || [];
            const select = document.getElementById('rootCertSelect');
            select.innerHTML = '<option value="">Select Root CA...</option>' +
                rootCertificates.map(cert => `
                    <option value="${cert.id}">
                        ${escapeHtml(cert.commonName)} (Expires: ${new Date(cert.notAfter).toLocaleDateString()})
                    </option>
                `).join('');
        }
    } catch (error) {
        console.error('Error loading root certificates:', error);
    }
}

// Load issuer certificates for entity certificate generation
async function loadIssuerCertificates() {
    try {
        const response = await fetch('/api/certificates?status=active');
        const data = await response.json();

        if (data.success) {
            // Filter to only CAs (root and intermediate)
            issuerCertificates = (data.certificates || []).filter(cert =>
                cert.type === 'root' || cert.type === 'intermediate'
            );

            const select = document.getElementById('issuerSelect');
            select.innerHTML = '<option value="">Select Issuer...</option>';

            // Group by type
            const rootCerts = issuerCertificates.filter(c => c.type === 'root');
            const intermediateCerts = issuerCertificates.filter(c => c.type === 'intermediate');

            if (rootCerts.length > 0) {
                select.innerHTML += '<optgroup label="Root CAs">' +
                    rootCerts.map(cert => `
                        <option value="${cert.id}">
                            ${escapeHtml(cert.commonName)} (Expires: ${new Date(cert.notAfter).toLocaleDateString()})
                        </option>
                    `).join('') +
                    '</optgroup>';
            }

            if (intermediateCerts.length > 0) {
                select.innerHTML += '<optgroup label="Intermediate CAs">' +
                    intermediateCerts.map(cert => `
                        <option value="${cert.id}">
                            ${escapeHtml(cert.commonName)} (Expires: ${new Date(cert.notAfter).toLocaleDateString()})
                        </option>
                    `).join('') +
                    '</optgroup>';
            }
        }
    } catch (error) {
        console.error('Error loading issuer certificates:', error);
    }
}

// View certificate details
async function viewCertificate(id) {
    try {
        const response = await fetch(`/api/certificates/${id}`);
        const data = await response.json();

        if (data.success) {
            const cert = data.certificate;
            document.getElementById('certDetailContent').innerHTML = `
                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label class="text-muted small">Common Name</label>
                        <div class="fw-bold">${escapeHtml(cert.commonName)}</div>
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="text-muted small">Type</label>
                        <div><span class="cert-type-badge cert-type-${cert.type}">${cert.type}</span></div>
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="text-muted small">Status</label>
                        <div><span class="status-badge status-${cert.status}">${cert.status}</span></div>
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="text-muted small">Serial Number</label>
                        <div><code>${cert.serialNumber}</code></div>
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="text-muted small">Valid From</label>
                        <div>${new Date(cert.notBefore).toLocaleString()}</div>
                    </div>
                    <div class="col-md-6 mb-3">
                        <label class="text-muted small">Valid Until</label>
                        <div>${new Date(cert.notAfter).toLocaleString()}</div>
                    </div>
                    ${cert.organization ? `
                    <div class="col-md-6 mb-3">
                        <label class="text-muted small">Organization</label>
                        <div>${escapeHtml(cert.organization)}</div>
                    </div>
                    ` : ''}
                    ${cert.country ? `
                    <div class="col-md-6 mb-3">
                        <label class="text-muted small">Country</label>
                        <div>${escapeHtml(cert.country)}</div>
                    </div>
                    ` : ''}
                    <div class="col-12 mb-3">
                        <label class="text-muted small">Fingerprint (SHA-256)</label>
                        <div class="fingerprint">${cert.fingerprint}</div>
                    </div>
                    ${cert.subjectAlternativeNames && cert.subjectAlternativeNames.length > 0 ? `
                    <div class="col-12 mb-3">
                        <label class="text-muted small">Subject Alternative Names</label>
                        <div>${cert.subjectAlternativeNames.map(san => `<span class="badge bg-secondary me-1">${escapeHtml(san)}</span>`).join('')}</div>
                    </div>
                    ` : ''}
                </div>

                <div class="d-flex gap-2 mt-3">
                    <button class="btn btn-primary" onclick="downloadCertificate('${cert.id}')">
                        <i class="bi bi-download"></i> Download Certificate
                    </button>
                    ${cert.status === 'active' ? `
                        <button class="btn btn-danger" onclick="revokeCertificate('${cert.id}')">
                            <i class="bi bi-x-circle"></i> Revoke Certificate
                        </button>
                    ` : ''}
                </div>
            `;

            new bootstrap.Modal(document.getElementById('certDetailModal')).show();
        } else {
            showError('Failed to load certificate details');
        }
    } catch (error) {
        console.error('Error:', error);
        showError('Error loading certificate: ' + error.message);
    }
}

// Download certificate
async function downloadCertificate(id) {
    try {
        const cert = certificates.find(c => c.id === id);
        if (!cert) {
            showError('Certificate not found');
            return;
        }

        const response = await fetch(`/api/certificates/${id}`);
        const data = await response.json();

        if (data.success && data.certificate.pem) {
            const blob = new Blob([data.certificate.pem], { type: 'application/x-pem-file' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${cert.commonName.replace(/\s+/g, '_')}.pem`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            showSuccess('Certificate downloaded successfully');
        } else {
            showError('Certificate PEM not available');
        }
    } catch (error) {
        console.error('Error:', error);
        showError('Error downloading certificate: ' + error.message);
    }
}

// Revoke certificate
async function revokeCertificate(id) {
    const cert = certificates.find(c => c.id === id);
    if (!cert) return;

    if (!confirm(`Are you sure you want to revoke the certificate for "${cert.commonName}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    const reason = prompt('Revocation reason (optional):', 'unspecified');

    try {
        const response = await fetch(`/api/certificates/${id}/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason || 'unspecified' })
        });

        const result = await response.json();

        if (result.success) {
            showSuccess('Certificate revoked successfully');
            loadCertificates();

            // Close detail modal if open
            const detailModal = bootstrap.Modal.getInstance(document.getElementById('certDetailModal'));
            if (detailModal) {
                detailModal.hide();
            }
        } else {
            showError('Failed to revoke certificate: ' + result.error);
        }
    } catch (error) {
        console.error('Error:', error);
        showError('Error revoking certificate: ' + error.message);
    }
}

// Show private key modal
function showPrivateKey(commonName, privateKey) {
    const modalHtml = `
        <div class="modal fade" id="privateKeyModal" tabindex="-1">
            <div class="modal-dialog modal-lg">
                <div class="modal-content">
                    <div class="modal-header bg-warning text-dark">
                        <h5 class="modal-title">
                            <i class="bi bi-exclamation-triangle-fill"></i>
                            Private Key - Save Securely!
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="alert alert-danger">
                            <i class="bi bi-shield-exclamation"></i>
                            <strong>Important:</strong> This private key will only be shown once. Please save it securely!
                        </div>
                        <label class="form-label">Private Key for: <strong>${escapeHtml(commonName)}</strong></label>
                        <textarea class="form-control font-monospace" rows="15" readonly>${privateKey}</textarea>
                        <button class="btn btn-primary mt-3" onclick="copyPrivateKey()">
                            <i class="bi bi-clipboard"></i> Copy to Clipboard
                        </button>
                        <button class="btn btn-success mt-3" onclick="downloadPrivateKey('${escapeHtml(commonName)}')">
                            <i class="bi bi-download"></i> Download
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existing = document.getElementById('privateKeyModal');
    if (existing) existing.remove();

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    new bootstrap.Modal(document.getElementById('privateKeyModal')).show();
}

// Copy private key to clipboard
function copyPrivateKey() {
    const textarea = document.querySelector('#privateKeyModal textarea');
    textarea.select();
    document.execCommand('copy');
    showSuccess('Private key copied to clipboard');
}

// Download private key
function downloadPrivateKey(commonName) {
    const textarea = document.querySelector('#privateKeyModal textarea');
    const blob = new Blob([textarea.value], { type: 'application/x-pem-file' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${commonName.replace(/\s+/g, '_')}_private.key`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showSuccess('Private key downloaded');
}

// Utility functions
function isExpiringSoon(expiryDate) {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return new Date(expiryDate) < thirtyDaysFromNow;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(message) {
    // Create toast for loading
    showToast(message, 'info', 0);
}

function hideLoading() {
    // Remove loading toast
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
