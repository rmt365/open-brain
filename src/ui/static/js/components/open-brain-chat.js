import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

const BASE_PATH = window.__BASE_PATH || '';

/**
 * Open Brain Chat — PWA chat interface for capturing thoughts.
 *
 * Usage: <open-brain-chat></open-brain-chat>
 *
 * URL params:
 *   ?user=Name — sets the user identity in metadata
 */
class OpenBrainChat extends LitElement {
  static properties = {
    messages: { type: Array, state: true },
    inputText: { type: String, state: true },
    loading: { type: Boolean, state: true },
    online: { type: Boolean, state: true },
    user: { type: String, state: true },
    _showSettings: { type: Boolean, state: true },
    _needsApiKey: { type: Boolean, state: true },
  };

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100dvh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #e2e8f0;
      background: #0f0e1a;
      --header-bg: #1e1b4b;
      --user-bubble: #4338ca;
      --system-bubble: #1e293b;
      --input-bg: #1a1830;
      --input-border: #312e81;
      --accent: #818cf8;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
    }

    /* Header */
    .header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      background: var(--header-bg);
      border-bottom: 1px solid rgba(129, 140, 248, 0.15);
      flex-shrink: 0;
      padding-top: calc(16px + env(safe-area-inset-top, 0px));
    }

    .header-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: rgba(129, 140, 248, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
    }

    .header-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .header-right {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-status {
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
    }

    .status-dot.offline {
      background: #ef4444;
    }

    .settings-btn {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 6px;
      font-size: 16px;
      line-height: 1;
      transition: color 0.2s;
    }

    .settings-btn:hover {
      color: var(--accent);
    }

    /* Messages area */
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      scroll-behavior: smooth;
      -webkit-overflow-scrolling: touch;
    }

    .messages::-webkit-scrollbar {
      width: 4px;
    }

    .messages::-webkit-scrollbar-track {
      background: transparent;
    }

    .messages::-webkit-scrollbar-thumb {
      background: rgba(129, 140, 248, 0.2);
      border-radius: 2px;
    }

    .message {
      max-width: 85%;
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 15px;
      line-height: 1.5;
      word-wrap: break-word;
      animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .message.user {
      align-self: flex-end;
      background: var(--user-bubble);
      color: var(--text-primary);
      border-bottom-right-radius: 4px;
    }

    .message.system {
      align-self: flex-start;
      background: var(--system-bubble);
      color: var(--text-secondary);
      border-bottom-left-radius: 4px;
    }

    .message.system .tag {
      display: inline-block;
      background: rgba(129, 140, 248, 0.15);
      color: var(--accent);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 12px;
      margin: 2px 2px 2px 0;
    }

    .message.error {
      align-self: flex-start;
      background: rgba(239, 68, 68, 0.15);
      color: #fca5a5;
      border-bottom-left-radius: 4px;
    }

    .message .timestamp {
      display: block;
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 6px;
    }

    /* Empty state */
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      gap: 12px;
      padding: 40px;
      text-align: center;
    }

    .empty-state .icon {
      font-size: 48px;
      opacity: 0.5;
    }

    .empty-state .hint {
      font-size: 14px;
      line-height: 1.6;
      max-width: 280px;
    }

    /* Loading indicator */
    .loading {
      align-self: flex-start;
      display: flex;
      gap: 6px;
      padding: 12px 16px;
    }

    .loading .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--text-muted);
      animation: bounce 1.4s ease-in-out infinite;
    }

    .loading .dot:nth-child(2) { animation-delay: 0.16s; }
    .loading .dot:nth-child(3) { animation-delay: 0.32s; }

    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }

    /* Input area */
    .input-area {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      padding: 12px 16px;
      padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      background: var(--input-bg);
      border-top: 1px solid rgba(129, 140, 248, 0.1);
      flex-shrink: 0;
    }

    .input-area textarea {
      flex: 1;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--input-border);
      border-radius: 20px;
      padding: 10px 16px;
      color: var(--text-primary);
      font-size: 15px;
      font-family: inherit;
      resize: none;
      outline: none;
      max-height: 120px;
      min-height: 42px;
      line-height: 1.4;
      transition: border-color 0.2s;
      overflow-y: auto;
    }

    .input-area textarea::placeholder {
      color: var(--text-muted);
    }

    .input-area textarea:focus {
      border-color: var(--accent);
    }

    .send-btn {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      border: none;
      background: var(--user-bubble);
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.2s, opacity 0.2s;
      -webkit-tap-highlight-color: transparent;
    }

    .send-btn:hover {
      background: #4f46e5;
    }

    .send-btn:active {
      background: #3730a3;
    }

    .send-btn:disabled {
      opacity: 0.4;
      cursor: default;
    }

    .send-btn svg {
      width: 20px;
      height: 20px;
    }

    /* Offline banner */
    .offline-banner {
      background: rgba(239, 68, 68, 0.15);
      color: #fca5a5;
      text-align: center;
      padding: 8px;
      font-size: 13px;
      flex-shrink: 0;
    }

    .offline-banner .queue-count {
      font-weight: 600;
    }

    /* API key dialog */
    .api-key-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 20px;
    }

    .api-key-dialog {
      background: #1e1b4b;
      border-radius: 16px;
      padding: 24px;
      max-width: 360px;
      width: 100%;
    }

    .api-key-dialog h3 {
      margin: 0 0 8px;
      font-size: 16px;
      color: var(--text-primary);
    }

    .api-key-dialog p {
      margin: 0 0 16px;
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.5;
    }

    .api-key-dialog input {
      width: 100%;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--input-border);
      border-radius: 8px;
      padding: 10px 12px;
      color: var(--text-primary);
      font-size: 14px;
      font-family: monospace;
      outline: none;
      margin-bottom: 16px;
    }

    .api-key-dialog input:focus {
      border-color: var(--accent);
    }

    .api-key-dialog .btn-row {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .api-key-dialog button {
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .api-key-dialog .btn-primary {
      background: var(--user-bubble);
      color: white;
    }

    .api-key-dialog .btn-primary:hover {
      background: #4f46e5;
    }

    .api-key-dialog .btn-secondary {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-secondary);
    }

    .api-key-dialog .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .api-key-dialog .btn-danger {
      background: rgba(239, 68, 68, 0.2);
      color: #fca5a5;
    }

    .api-key-dialog .btn-danger:hover {
      background: rgba(239, 68, 68, 0.3);
    }
  `;

  constructor() {
    super();
    this.messages = [];
    this.inputText = '';
    this.loading = false;
    this.online = navigator.onLine;
    this.user = '';
    this._offlineQueue = [];
    this._showApiKeyDialog = false;
  }

  connectedCallback() {
    super.connectedCallback();

    // Read user from URL param
    const params = new URLSearchParams(window.location.search);
    this.user = params.get('user') || '';

    // Load offline queue from localStorage
    this._loadOfflineQueue();

    // Load message history from localStorage
    this._loadMessageHistory();

    // Online/offline listeners
    this._onOnline = () => {
      this.online = true;
      this._drainOfflineQueue();
    };
    this._onOffline = () => { this.online = false; };
    window.addEventListener('online', this._onOnline);
    window.addEventListener('offline', this._onOffline);

    // Drain queue if we're already online
    if (this.online && this._offlineQueue.length > 0) {
      this._drainOfflineQueue();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('online', this._onOnline);
    window.removeEventListener('offline', this._onOffline);
  }

  updated(changed) {
    if (changed.has('messages')) {
      this._scrollToBottom();
    }
  }

  _getApiKey() {
    return localStorage.getItem('open-brain-api-key') || '';
  }

  _setApiKey(key) {
    if (key) {
      localStorage.setItem('open-brain-api-key', key);
    } else {
      localStorage.removeItem('open-brain-api-key');
    }
  }

  _getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const apiKey = this._getApiKey();
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    return headers;
  }

  _scrollToBottom() {
    requestAnimationFrame(() => {
      const container = this.renderRoot.querySelector('.messages');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }

  _autoGrow(e) {
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
    this.inputText = textarea.value;
  }

  _handleKeydown(e) {
    // Enter without shift sends the message
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._send();
    }
  }

  async _send() {
    const text = this.inputText.trim();
    if (!text || this.loading) return;

    // Add user message to display
    const userMsg = {
      type: 'user',
      text,
      timestamp: new Date().toISOString(),
    };
    this.messages = [...this.messages, userMsg];
    this.inputText = '';

    // Reset textarea height
    const textarea = this.renderRoot.querySelector('textarea');
    if (textarea) {
      textarea.style.height = 'auto';
    }

    // Build request body
    const body = {
      text,
      source_channel: 'web',
      metadata: {},
    };
    if (this.user) {
      body.metadata.user = this.user;
    }

    if (!this.online) {
      this._queueOffline(body, userMsg);
      return;
    }

    this.loading = true;

    try {
      const resp = await fetch(`${BASE_PATH}/thoughts`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify(body),
      });

      if (resp.status === 401) {
        // API key required or invalid
        this._showApiKeyDialog = true;
        this.messages = [...this.messages, {
          type: 'error',
          text: 'API key required. Use the settings button to enter your key.',
          timestamp: new Date().toISOString(),
        }];
        return;
      }

      // Check content-type before parsing JSON
      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        console.error('Non-JSON response:', resp.status, contentType);
        this.messages = [...this.messages, {
          type: 'error',
          text: 'Failed to reach Open Brain service.',
          timestamp: new Date().toISOString(),
        }];
        return;
      }

      const result = await resp.json();

      if (result.success && result.data) {
        const ack = this._buildAck(result.data);
        this.messages = [...this.messages, ack];
      } else if (result.offline) {
        // Service worker returned offline response
        this._queueOffline(body, userMsg);
        this.messages = [...this.messages, {
          type: 'system',
          text: 'You\'re offline. This thought will be sent when you reconnect.',
          timestamp: new Date().toISOString(),
        }];
      } else {
        this.messages = [...this.messages, {
          type: 'error',
          text: result.error || 'Something went wrong.',
          timestamp: new Date().toISOString(),
        }];
      }
    } catch (err) {
      // Network error — queue for later
      this._queueOffline(body, userMsg);
      this.messages = [...this.messages, {
        type: 'system',
        text: 'Offline. Thought queued for when you reconnect.',
        timestamp: new Date().toISOString(),
      }];
    } finally {
      this.loading = false;
      this._saveMessageHistory();
    }
  }

  _buildAck(data) {
    let text = 'Got it';
    const parts = [];

    if (data.auto_type) {
      parts.push(data.auto_type);
    }

    if (data.auto_topics && data.auto_topics.length > 0) {
      const topicsStr = data.auto_topics.join(', ');
      if (parts.length > 0) {
        text = `Got it \u2014 tagged as ${parts[0]} about ${topicsStr}`;
      } else {
        text = `Got it \u2014 about ${topicsStr}`;
      }
    } else if (parts.length > 0) {
      text = `Got it \u2014 tagged as ${parts[0]}`;
    } else {
      text = 'Got it \u2014 captured';
    }

    return {
      type: 'system',
      text,
      autoType: data.auto_type || null,
      autoTopics: data.auto_topics || [],
      timestamp: new Date().toISOString(),
    };
  }

  _queueOffline(body, userMsg) {
    this._offlineQueue.push({ body, timestamp: userMsg.timestamp });
    this._saveOfflineQueue();
  }

  async _drainOfflineQueue() {
    if (this._offlineQueue.length === 0) return;

    const queue = [...this._offlineQueue];
    this._offlineQueue = [];
    this._saveOfflineQueue();

    const headers = this._getHeaders();
    let sentCount = 0;
    for (const item of queue) {
      try {
        const resp = await fetch(`${BASE_PATH}/thoughts`, {
          method: 'POST',
          headers,
          body: JSON.stringify(item.body),
        });

        if (resp.status === 401) {
          this._offlineQueue.push(item);
          this._showApiKeyDialog = true;
          break;
        }

        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          this._offlineQueue.push(item);
          continue;
        }

        const result = await resp.json();
        if (result.success) {
          sentCount++;
        } else {
          this._offlineQueue.push(item);
        }
      } catch {
        this._offlineQueue.push(item);
      }
    }

    this._saveOfflineQueue();

    if (sentCount > 0) {
      this.messages = [...this.messages, {
        type: 'system',
        text: `Back online \u2014 sent ${sentCount} queued thought${sentCount > 1 ? 's' : ''}.`,
        timestamp: new Date().toISOString(),
      }];
      this._saveMessageHistory();
    }
  }

  _loadOfflineQueue() {
    try {
      const stored = localStorage.getItem('open-brain-offline-queue');
      if (stored) {
        this._offlineQueue = JSON.parse(stored);
      }
    } catch {
      this._offlineQueue = [];
    }
  }

  _saveOfflineQueue() {
    try {
      localStorage.setItem(
        'open-brain-offline-queue',
        JSON.stringify(this._offlineQueue)
      );
    } catch {
      // Storage full or unavailable
    }
  }

  _loadMessageHistory() {
    try {
      const stored = localStorage.getItem('open-brain-messages');
      if (stored) {
        const msgs = JSON.parse(stored);
        // Only keep last 100 messages
        this.messages = msgs.slice(-100);
      }
    } catch {
      this.messages = [];
    }
  }

  _saveMessageHistory() {
    try {
      // Keep last 100 messages
      const toSave = this.messages.slice(-100);
      localStorage.setItem('open-brain-messages', JSON.stringify(toSave));
    } catch {
      // Storage full or unavailable
    }
  }

  _formatTime(isoString) {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  }

  _saveApiKey() {
    const input = this.renderRoot.querySelector('.api-key-input');
    const key = input ? input.value.trim() : '';
    this._setApiKey(key);
    this._showApiKeyDialog = false;
  }

  _clearApiKey() {
    this._setApiKey('');
    this._showApiKeyDialog = false;
  }

  _renderMessage(msg) {
    if (msg.type === 'user') {
      return html`
        <div class="message user">
          ${msg.text}
          <span class="timestamp">${this._formatTime(msg.timestamp)}</span>
        </div>
      `;
    }

    if (msg.type === 'error') {
      return html`
        <div class="message error">
          ${msg.text}
          <span class="timestamp">${this._formatTime(msg.timestamp)}</span>
        </div>
      `;
    }

    // System acknowledgment
    return html`
      <div class="message system">
        <div>${msg.text}</div>
        ${msg.autoTopics && msg.autoTopics.length > 0 ? html`
          <div style="margin-top: 6px;">
            ${msg.autoTopics.map((t) => html`<span class="tag">${t}</span>`)}
          </div>
        ` : ''}
        <span class="timestamp">${this._formatTime(msg.timestamp)}</span>
      </div>
    `;
  }

  _renderApiKeyDialog() {
    const currentKey = this._getApiKey();
    return html`
      <div class="api-key-overlay" @click=${(e) => {
        if (e.target === e.currentTarget) {
          this._showApiKeyDialog = false;
        }
      }}>
        <div class="api-key-dialog">
          <h3>${currentKey ? 'API Key Settings' : 'Enter API Key'}</h3>
          <p>${currentKey
            ? 'Update or clear your API key.'
            : 'An API key is required to use Open Brain.'
          }</p>
          <input
            class="api-key-input"
            type="password"
            placeholder="Enter API key..."
            .value=${currentKey}
            @keydown=${(e) => { if (e.key === 'Enter') this._saveApiKey(); }}
          />
          <div class="btn-row">
            ${currentKey ? html`
              <button class="btn-danger" @click=${this._clearApiKey}>Clear</button>
            ` : ''}
            <button class="btn-secondary" @click=${() => {
              this._showApiKeyDialog = false;
            }}>Cancel</button>
            <button class="btn-primary" @click=${this._saveApiKey}>Save</button>
          </div>
        </div>
      </div>
    `;
  }

  render() {
    const hasMessages = this.messages.length > 0;
    const canSend = this.inputText.trim().length > 0 && !this.loading;

    return html`
      <div class="header">
        <div class="header-icon">&#129504;</div>
        <span class="header-title">Open Brain</span>
        <div class="header-right">
          <div class="header-status">
            <div class="status-dot ${this.online ? '' : 'offline'}"></div>
            ${this.online ? 'Online' : 'Offline'}
          </div>
          <button class="settings-btn" @click=${() => { this._showApiKeyDialog = true; }} title="Settings">
            &#9881;
          </button>
        </div>
      </div>

      ${!this.online && this._offlineQueue.length > 0 ? html`
        <div class="offline-banner">
          <span class="queue-count">${this._offlineQueue.length}</span>
          thought${this._offlineQueue.length > 1 ? 's' : ''} queued
        </div>
      ` : ''}

      ${hasMessages ? html`
        <div class="messages">
          ${this.messages.map((m) => this._renderMessage(m))}
          ${this.loading ? html`
            <div class="loading">
              <div class="dot"></div>
              <div class="dot"></div>
              <div class="dot"></div>
            </div>
          ` : ''}
        </div>
      ` : html`
        <div class="empty-state">
          <div class="icon">&#129504;</div>
          <div class="hint">
            What's on your mind? Type a thought, idea, question, or observation
            and it will be captured and classified.
          </div>
        </div>
      `}

      <div class="input-area">
        <textarea
          rows="1"
          placeholder="Capture a thought..."
          .value=${this.inputText}
          @input=${this._autoGrow}
          @keydown=${this._handleKeydown}
        ></textarea>
        <button
          class="send-btn"
          ?disabled=${!canSend}
          @click=${this._send}
          aria-label="Send"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"></line>
            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
          </svg>
        </button>
      </div>

      ${this._showApiKeyDialog ? this._renderApiKeyDialog() : ''}
    `;
  }
}

customElements.define('open-brain-chat', OpenBrainChat);
