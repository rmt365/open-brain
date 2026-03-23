import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

const BASE_PATH = window.__BASE_PATH || '';

/**
 * Backup health stoplight indicator.
 *
 * Polls GET /health/backup every 60 seconds and renders a colored dot.
 * Tap/click toggles a tooltip overlay with details.
 *
 * Usage: <backup-indicator></backup-indicator>
 */
class BackupIndicator extends LitElement {
  static properties = {
    _status: { type: String, state: true },
    _lastActivity: { type: String, state: true },
    _lagSeconds: { type: Number, state: true },
    _dbSizeBytes: { type: Number, state: true },
    _enabled: { type: Boolean, state: true },
    _showTooltip: { type: Boolean, state: true },
  };

  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      position: relative;
    }

    .backup-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 8px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 11px;
      transition: background 0.2s;
    }

    .backup-badge:hover {
      background: rgba(255, 255, 255, 0.08);
    }

    .backup-badge .icon {
      font-size: 12px;
    }

    .backup-badge .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .backup-badge.healthy .dot { background: #22c55e; }
    .backup-badge.warning .dot { background: #f59e0b; }
    .backup-badge.error .dot { background: #ef4444; }
    .backup-badge.disabled .dot { background: #64748b; }

    .backup-badge .label {
      color: #64748b;
    }

    .tooltip {
      position: absolute;
      top: 24px;
      right: 0;
      background: #1e293b;
      border: 1px solid rgba(129, 140, 248, 0.2);
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 12px;
      color: #e2e8f0;
      white-space: nowrap;
      z-index: 100;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      line-height: 1.5;
    }
  `;

  constructor() {
    super();
    this._status = 'disabled';
    this._lastActivity = null;
    this._lagSeconds = 0;
    this._dbSizeBytes = null;
    this._enabled = false;
    this._showTooltip = false;
    this._intervalId = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._fetchHealth();
    this._intervalId = setInterval(() => this._fetchHealth(), 60000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
  }

  async _fetchHealth() {
    try {
      const res = await fetch(`${BASE_PATH}/health/backup`);
      if (!res.ok) {
        this._status = 'error';
        return;
      }
      const data = await res.json();
      this._status = data.status;
      this._enabled = data.enabled;
      this._lastActivity = data.lastActivity;
      this._lagSeconds = data.lagSeconds;
      this._dbSizeBytes = data.dbSizeBytes;
    } catch {
      this._status = 'error';
    }
  }

  _toggleTooltip(e) {
    e.stopPropagation();
    this._showTooltip = !this._showTooltip;
  }

  _formatLag(seconds) {
    if (seconds < 0) return 'unknown';
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  }

  _formatSize(bytes) {
    if (bytes === null || bytes === undefined) return 'unknown';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  render() {
    return html`
      <div class="backup-badge ${this._status}" @click=${this._toggleTooltip} title="Backup status">
        <span class="icon">&#128451;</span>
        <span class="dot"></span>
      </div>
      ${this._showTooltip ? html`
        <div class="tooltip">
          ${!this._enabled
            ? 'Backups disabled'
            : html`Last backup: ${this._formatLag(this._lagSeconds)}<br>Size: ${this._formatSize(this._dbSizeBytes)}`
          }
        </div>
      ` : ''}
    `;
  }
}

customElements.define('backup-indicator', BackupIndicator);
