// Open Brain - API Key Manager Page
// Admin interface for creating, viewing, and managing API keys

import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { sharedStyles } from './shared-styles.js';
import './api-key-dialog.js';
import { getApiKey, hasApiKey, getAuthHeaders } from './auth-mixin.js';

const BASE_PATH = window.__BASE_PATH || '';

const SCOPE_LABELS = {
  read: 'Read',
  write: 'Write',
  admin: 'Admin',
};

const SCOPE_COLORS = {
  read: '#22c55e',
  write: '#eab308',
  admin: '#ef4444',
};

class ApiKeyManager extends LitElement {
  static properties = {
    _keys: { type: Array, state: true },
    _loading: { type: Boolean, state: true },
    _error: { type: String, state: true },
    _showCreate: { type: Boolean, state: true },
    _newKeyName: { type: String, state: true },
    _newKeyScopes: { type: Array, state: true },
    _createdKey: { type: String, state: true },
    _showApiKeyDialog: { type: Boolean, state: true },
    _isAdmin: { type: Boolean, state: true },
    _deleteConfirm: { type: String, state: true },
    _copied: { type: Boolean, state: true },
  };

  static styles = [sharedStyles, css`
    :host {
      display: block;
      background: var(--bg-page);
      min-height: 100dvh;
    }

    .content {
      max-width: 720px;
      margin: 0 auto;
      padding: 24px 16px;
    }

    .section-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
    }

    .info-box {
      background: rgba(99, 102, 241, 0.1);
      border: 1px solid rgba(99, 102, 241, 0.3);
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 24px;
      font-size: 13px;
      color: #94a3b8;
      line-height: 1.6;
    }

    .no-admin {
      text-align: center;
      padding: 60px 20px;
      color: #94a3b8;
    }

    .no-admin h2 {
      margin-bottom: 12px;
      color: #e2e8f0;
    }

    /* Key list */
    .key-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 12px;
    }

    .key-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }

    .key-name {
      font-weight: 600;
      font-size: 15px;
      flex: 1;
    }

    .key-prefix {
      font-family: monospace;
      font-size: 13px;
      color: #94a3b8;
      background: rgba(255, 255, 255, 0.05);
      padding: 2px 8px;
      border-radius: 4px;
    }

    .key-meta {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: #64748b;
      margin-top: 8px;
    }

    .scope-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .scopes { display: flex; gap: 4px; }

    .key-actions {
      display: flex;
      gap: 8px;
      margin-top: 12px;
    }

    .toggle-btn {
      padding: 6px 12px;
      border-radius: 6px;
      border: none;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .toggle-btn.enable {
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
    }

    .toggle-btn.disable {
      background: rgba(239, 68, 68, 0.15);
      color: #fca5a5;
    }

    .disabled-overlay {
      opacity: 0.5;
    }

    .disabled-label {
      color: #f87171;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }

    /* Create form */
    .create-form {
      background: rgba(99, 102, 241, 0.08);
      border: 1px solid rgba(99, 102, 241, 0.2);
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 24px;
    }

    .scope-checkboxes {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }

    .scope-checkbox {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 14px;
    }

    .scope-checkbox input {
      accent-color: #818cf8;
      width: 16px;
      height: 16px;
    }

    .form-actions {
      display: flex;
      gap: 8px;
    }

    /* Created key display */
    .created-key-box {
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.3);
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 24px;
    }

    .created-key-box h3 {
      color: #4ade80;
      margin-bottom: 8px;
      font-size: 15px;
    }

    .created-key-box p {
      color: #94a3b8;
      font-size: 13px;
      margin-bottom: 12px;
    }

    .key-display {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .key-value {
      flex: 1;
      font-family: monospace;
      font-size: 13px;
      background: rgba(0, 0, 0, 0.3);
      padding: 10px 12px;
      border-radius: 6px;
      word-break: break-all;
      color: #e2e8f0;
    }

    .copy-btn {
      background: #6366f1;
      color: white;
      border: none;
      padding: 10px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      white-space: nowrap;
    }

    .copy-btn:hover {
      background: #4f46e5;
    }

  `];

  constructor() {
    super();
    this._keys = [];
    this._loading = true;
    this._error = '';
    this._showCreate = false;
    this._newKeyName = '';
    this._newKeyScopes = ['read', 'write'];
    this._createdKey = '';
    this._showApiKeyDialog = !hasApiKey();
    this._isAdmin = false;
    this._deleteConfirm = '';
    this._copied = false;
  }

  connectedCallback() {
    super.connectedCallback();
    if (hasApiKey()) {
      this._loadKeys();
    }
  }

  async _loadKeys() {
    this._loading = true;
    this._error = '';
    try {
      const res = await fetch(`${BASE_PATH}/api-keys`, { headers: getAuthHeaders() });
      if (res.status === 401) {
        this._showApiKeyDialog = true;
        return;
      }
      if (res.status === 403) {
        this._isAdmin = false;
        this._loading = false;
        return;
      }
      const json = await res.json();
      if (json.success) {
        this._keys = json.data;
        this._isAdmin = true;
      }
    } catch (e) {
      this._error = 'Failed to load API keys';
    } finally {
      this._loading = false;
    }
  }

  async _createKey() {
    if (!this._newKeyName.trim()) return;
    if (this._newKeyScopes.length === 0) return;

    try {
      const res = await fetch(`${BASE_PATH}/api-keys`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: this._newKeyName.trim(),
          scopes: this._newKeyScopes,
        }),
      });
      const json = await res.json();
      if (json.success) {
        this._createdKey = json.data.raw_key;
        this._showCreate = false;
        this._newKeyName = '';
        this._newKeyScopes = ['read', 'write'];
        this._copied = false;
        this._loadKeys();
      } else {
        this._error = json.error || 'Failed to create key';
      }
    } catch {
      this._error = 'Failed to create key';
    }
  }

  async _toggleKey(id, currentEnabled) {
    try {
      await fetch(`${BASE_PATH}/api-keys/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      this._loadKeys();
    } catch {
      this._error = 'Failed to update key';
    }
  }

  async _deleteKey(id) {
    try {
      await fetch(`${BASE_PATH}/api-keys/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      this._deleteConfirm = '';
      this._loadKeys();
    } catch {
      this._error = 'Failed to delete key';
    }
  }

  _toggleScope(scope) {
    if (this._newKeyScopes.includes(scope)) {
      this._newKeyScopes = this._newKeyScopes.filter(s => s !== scope);
    } else {
      this._newKeyScopes = [...this._newKeyScopes, scope];
    }
  }

  async _copyKey() {
    try {
      await navigator.clipboard.writeText(this._createdKey);
      this._copied = true;
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = this._createdKey;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this._copied = true;
    }
  }

  _onApiKeyChanged() {
    this._showApiKeyDialog = false;
    this._loadKeys();
  }

  _renderScopeBadge(scope) {
    const color = SCOPE_COLORS[scope] || '#94a3b8';
    return html`
      <span class="scope-badge" style="background: ${color}20; color: ${color};">
        ${SCOPE_LABELS[scope] || scope}
      </span>
    `;
  }

  _renderKeyCard(key) {
    const isDisabled = !key.enabled;
    return html`
      <div class="key-card ${isDisabled ? 'disabled-overlay' : ''}">
        <div class="key-header">
          <span class="key-name">${key.name}</span>
          ${isDisabled ? html`<span class="disabled-label">Disabled</span>` : ''}
          <span class="key-prefix">${key.key_prefix}...</span>
        </div>
        <div class="scopes">
          ${key.scopes.map(s => this._renderScopeBadge(s))}
        </div>
        <div class="key-meta">
          <span>Created: ${new Date(key.created_at).toLocaleDateString()}</span>
          <span>Last used: ${key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}</span>
        </div>
        <div class="key-actions">
          <button
            class="toggle-btn ${isDisabled ? 'enable' : 'disable'}"
            @click=${() => this._toggleKey(key.id, key.enabled)}
          >
            ${isDisabled ? 'Enable' : 'Disable'}
          </button>
          ${this._deleteConfirm === key.id ? html`
            <button class="btn btn-danger" @click=${() => this._deleteKey(key.id)}>Confirm Delete</button>
            <button class="btn btn-secondary" @click=${() => { this._deleteConfirm = ''; }}>Cancel</button>
          ` : html`
            <button class="btn btn-danger" @click=${() => { this._deleteConfirm = key.id; }}>Delete</button>
          `}
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <api-key-dialog
        .open=${this._showApiKeyDialog}
        .required=${!hasApiKey()}
        @api-key-changed=${this._onApiKeyChanged}
      ></api-key-dialog>

      <div class="header">
        <div class="header-icon">&#128273;</div>
        <span class="header-title">API Keys</span>
        <a href="${BASE_PATH}/ui/brain" class="header-nav-link" title="Capture thoughts">&#128172;</a>
        <a href="${BASE_PATH}/ui/browse" class="header-nav-link" title="Browse thoughts">&#128218;</a>
        <a href="${BASE_PATH}/ui/explore" class="header-nav-link" title="Explore brain">&#127758;</a>
      </div>

      <div class="content">
        ${this._loading ? html`<div class="loading">Loading...</div>` : ''}

        ${!this._loading && !this._isAdmin && !this._showApiKeyDialog ? html`
          <div class="no-admin">
            <h2>Admin Access Required</h2>
            <p>Your current API key does not have admin scope. Use the master key or an admin-scoped key to manage API keys.</p>
          </div>
        ` : ''}

        ${!this._loading && this._isAdmin ? html`
          <div class="info-box">
            API keys allow you to grant scoped access to your brain. The master key (set via environment variable) always has full access.
            Keys created here can be limited to read-only, read-write, or full admin access.
          </div>

          ${this._createdKey ? html`
            <div class="created-key-box">
              <h3>Key Created Successfully</h3>
              <p>Copy this key now. It will not be shown again.</p>
              <div class="key-display">
                <div class="key-value">${this._createdKey}</div>
                <button class="copy-btn" @click=${this._copyKey}>
                  ${this._copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div style="margin-top: 12px;">
                <button class="btn btn-secondary" @click=${() => { this._createdKey = ''; }}>Dismiss</button>
              </div>
            </div>
          ` : ''}

          ${this._showCreate ? html`
            <div class="create-form">
              <label class="form-label">Key Name</label>
              <input
                class="form-input"
                type="text"
                placeholder="e.g., Platform read access, Mobile app..."
                .value=${this._newKeyName}
                @input=${(e) => { this._newKeyName = e.target.value; }}
                @keydown=${(e) => { if (e.key === 'Enter') this._createKey(); }}
              />

              <label class="form-label">Scopes</label>
              <div class="scope-checkboxes">
                ${['read', 'write', 'admin'].map(scope => html`
                  <label class="scope-checkbox">
                    <input
                      type="checkbox"
                      .checked=${this._newKeyScopes.includes(scope)}
                      @change=${() => this._toggleScope(scope)}
                    />
                    ${SCOPE_LABELS[scope]}
                  </label>
                `)}
              </div>

              <div class="form-actions">
                <button class="btn btn-primary" @click=${this._createKey}>Create Key</button>
                <button class="btn btn-secondary" @click=${() => { this._showCreate = false; }}>Cancel</button>
              </div>
            </div>
          ` : html`
            <button class="btn btn-primary" @click=${() => { this._showCreate = true; }}>+ Create API Key</button>
          `}

          ${this._error ? html`<div class="error-msg">${this._error}</div>` : ''}

          <h2 class="section-title">API Keys (${this._keys.length})</h2>

          ${this._keys.length === 0 ? html`
            <div class="empty-state">No API keys created yet. The master key is configured via environment variable.</div>
          ` : ''}

          ${this._keys.map(key => this._renderKeyCard(key))}
        ` : ''}
      </div>
    `;
  }
}

customElements.define('api-key-manager', ApiKeyManager);
