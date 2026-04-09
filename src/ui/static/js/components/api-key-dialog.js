// Open Brain - Shared API Key Dialog Component
// Reusable dialog for entering/managing the API key across all pages

import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js';
import { tokens } from './shared-styles.js';
import { getApiKey, setApiKey, clearApiKey } from './auth-mixin.js';

class ApiKeyDialog extends LitElement {
  static properties = {
    open: { type: Boolean, reflect: true },
    required: { type: Boolean },
  };

  static styles = [tokens, css`
    :host { display: contents; }

    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 20px;
    }

    .dialog {
      background: var(--bg-header);
      border-radius: var(--radius-lg);
      padding: 24px;
      max-width: 360px;
      width: 100%;
    }

    .dialog h3 { margin: 0 0 8px; font-size: 16px; color: var(--text-primary); }
    .dialog p  { margin: 0 0 16px; font-size: 13px; color: var(--text-secondary); line-height: 1.5; }

    .dialog input {
      width: 100%;
      box-sizing: border-box;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      border-radius: var(--radius-md);
      padding: 10px 12px;
      color: var(--text-primary);
      font-size: 14px;
      font-family: monospace;
      outline: none;
      margin-bottom: 16px;
    }
    .dialog input:focus { border-color: var(--accent); }

    .btn-row { display: flex; gap: 8px; justify-content: flex-end; }

    button {
      padding: 8px 16px;
      border-radius: var(--radius-md);
      border: none;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .btn-primary { background: var(--accent-deep); color: white; }
    .btn-primary:hover { background: #4f46e5; }

    .btn-secondary { background: var(--bg-hover); color: var(--text-secondary); }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.15); }

    .btn-danger { background: rgba(239, 68, 68, 0.2); color: #fca5a5; }
    .btn-danger:hover { background: rgba(239, 68, 68, 0.3); }
  `];

  constructor() {
    super();
    this.open = false;
    this.required = false;
  }

  _save() {
    const input = this.renderRoot.querySelector('input');
    const key = input ? input.value.trim() : '';
    if (key) {
      setApiKey(key);
      this.open = false;
      this.dispatchEvent(new CustomEvent('api-key-changed', {
        detail: { action: 'saved' },
        bubbles: true,
        composed: true,
      }));
    }
  }

  _clear() {
    clearApiKey();
    this.open = false;
    this.dispatchEvent(new CustomEvent('api-key-changed', {
      detail: { action: 'cleared' },
      bubbles: true,
      composed: true,
    }));
  }

  _cancel() {
    if (!this.required) {
      this.open = false;
    }
  }

  render() {
    if (!this.open) return html``;

    const currentKey = getApiKey();

    return html`
      <div class="overlay" @click=${(e) => {
        if (e.target === e.currentTarget && !this.required) {
          this.open = false;
        }
      }}>
        <div class="dialog">
          <h3>${currentKey ? 'API Key Settings' : 'Enter API Key'}</h3>
          <p>${currentKey
            ? 'Update or clear your API key.'
            : 'An API key is required to use Open Brain.'
          }</p>
          <input
            type="password"
            placeholder="Enter API key..."
            .value=${currentKey}
            @keydown=${(e) => { if (e.key === 'Enter') this._save(); }}
          />
          <div class="btn-row">
            ${currentKey ? html`
              <button class="btn-danger" @click=${this._clear}>Clear</button>
            ` : ''}
            ${!this.required ? html`
              <button class="btn-secondary" @click=${this._cancel}>Cancel</button>
            ` : ''}
            <button class="btn-primary" @click=${this._save}>Save</button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('api-key-dialog', ApiKeyDialog);
