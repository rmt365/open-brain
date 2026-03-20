import { LitElement, html, css, unsafeHTML } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/all/lit-all.min.js';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@15/lib/marked.esm.js';

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
    _showApiKeyDialog: { type: Boolean, state: true },
    _needsApiKey: { type: Boolean, state: true },
    _showPreferences: { type: Boolean, state: true },
    _preferences: { type: Array, state: true },
    _prefLoading: { type: Boolean, state: true },
    _prefEditing: { type: String, state: true },
    _prefFormData: { type: Object, state: true },
    _pendingFile: { type: Object, state: true },
    _lightboxSrc: { type: String, state: true },
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
    .header-nav-link {
      color: var(--text-secondary);
      text-decoration: none;
      font-size: 18px;
      padding: 4px 8px;
      border-radius: 6px;
      transition: background 0.15s;
    }
    .header-nav-link:hover {
      background: rgba(255,255,255,0.1);
      color: var(--text-primary);
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

    .message.system p {
      margin: 0 0 8px 0;
    }

    .message.system p:last-child {
      margin-bottom: 0;
    }

    .message.system ul, .message.system ol {
      margin: 4px 0 8px 0;
      padding-left: 20px;
    }

    .message.system li {
      margin-bottom: 2px;
    }

    .message.system strong {
      color: var(--text-primary);
    }

    .message.system code {
      background: rgba(255, 255, 255, 0.08);
      padding: 1px 4px;
      border-radius: 3px;
      font-size: 13px;
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

    .upload-btn {
      width: 42px;
      height: 42px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: color 0.2s;
      -webkit-tap-highlight-color: transparent;
    }

    .upload-btn:hover {
      color: var(--accent);
    }

    .upload-btn svg {
      width: 20px;
      height: 20px;
    }

    .file-preview {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: rgba(129, 140, 248, 0.1);
      border-radius: 8px;
      font-size: 13px;
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .file-preview .file-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 200px;
    }

    .file-preview .file-remove {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 2px;
      font-size: 16px;
      line-height: 1;
    }

    .file-preview .file-remove:hover {
      color: #ef4444;
    }

    .doc-link {
      display: inline-block;
      margin-top: 8px;
      color: var(--accent);
      text-decoration: none;
      font-size: 13px;
      cursor: pointer;
    }
    .doc-link:hover { text-decoration: underline; }

    .lightbox-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      cursor: pointer;
    }
    .lightbox-overlay img {
      max-width: 90vw;
      max-height: 90vh;
      object-fit: contain;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
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

    /* Settings menu */
    .settings-menu {
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      background: #1e1b4b;
      border: 1px solid rgba(129, 140, 248, 0.2);
      border-radius: 8px;
      overflow: hidden;
      z-index: 50;
      min-width: 160px;
    }

    .settings-menu button {
      display: block;
      width: 100%;
      padding: 10px 16px;
      background: none;
      border: none;
      color: var(--text-secondary);
      font-size: 14px;
      text-align: left;
      cursor: pointer;
      transition: background 0.15s;
    }

    .settings-menu button:hover {
      background: rgba(129, 140, 248, 0.1);
      color: var(--text-primary);
    }

    /* Preferences panel */
    .pref-overlay {
      position: fixed;
      inset: 0;
      background: #0f0e1a;
      z-index: 200;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .pref-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px 20px;
      background: var(--header-bg);
      border-bottom: 1px solid rgba(129, 140, 248, 0.15);
      flex-shrink: 0;
      padding-top: calc(16px + env(safe-area-inset-top, 0px));
    }

    .pref-header h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
      flex: 1;
    }

    .pref-back-btn {
      background: none;
      border: none;
      color: var(--accent);
      cursor: pointer;
      font-size: 14px;
      padding: 6px 12px;
      border-radius: 6px;
      transition: background 0.15s;
    }

    .pref-back-btn:hover {
      background: rgba(129, 140, 248, 0.1);
    }

    .pref-body {
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
      -webkit-overflow-scrolling: touch;
    }

    .pref-actions {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .pref-add-btn, .pref-copy-btn {
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .pref-add-btn {
      background: var(--user-bubble);
      color: white;
    }

    .pref-add-btn:hover {
      background: #4f46e5;
    }

    .pref-copy-btn {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text-secondary);
    }

    .pref-copy-btn:hover {
      background: rgba(255, 255, 255, 0.15);
    }

    .pref-domain-group {
      margin-bottom: 20px;
    }

    .pref-domain-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .pref-card {
      background: var(--system-bubble);
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 8px;
      transition: background 0.15s;
    }

    .pref-card-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .pref-card-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
      flex: 1;
    }

    .pref-card-badge {
      display: inline-block;
      background: rgba(129, 140, 248, 0.15);
      color: var(--accent);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      white-space: nowrap;
    }

    .pref-card-field {
      font-size: 13px;
      line-height: 1.5;
      margin-bottom: 4px;
    }

    .pref-card-field strong {
      color: var(--text-muted);
      font-weight: 500;
    }

    .pref-card-field span {
      color: var(--text-secondary);
    }

    .pref-card-actions {
      display: flex;
      gap: 6px;
      margin-top: 8px;
    }

    .pref-card-actions button {
      padding: 4px 10px;
      border-radius: 6px;
      border: none;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .pref-edit-btn {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-muted);
    }

    .pref-edit-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: var(--text-secondary);
    }

    .pref-delete-btn {
      background: rgba(239, 68, 68, 0.1);
      color: #fca5a5;
    }

    .pref-delete-btn:hover {
      background: rgba(239, 68, 68, 0.2);
    }

    /* Preference form */
    .pref-form {
      background: var(--system-bubble);
      border: 1px solid rgba(129, 140, 248, 0.2);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .pref-form label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      margin-bottom: 4px;
      margin-top: 10px;
    }

    .pref-form label:first-child {
      margin-top: 0;
    }

    .pref-form input,
    .pref-form textarea,
    .pref-form select {
      width: 100%;
      box-sizing: border-box;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--input-border);
      border-radius: 8px;
      padding: 8px 12px;
      color: var(--text-primary);
      font-size: 14px;
      font-family: inherit;
      outline: none;
    }

    .pref-form textarea {
      resize: vertical;
      min-height: 60px;
    }

    .pref-form select {
      cursor: pointer;
    }

    .pref-form input:focus,
    .pref-form textarea:focus,
    .pref-form select:focus {
      border-color: var(--accent);
    }

    .pref-form .btn-row {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      margin-top: 14px;
    }

    .pref-form button {
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.2s;
    }

    .pref-empty {
      text-align: center;
      padding: 40px 20px;
      color: var(--text-muted);
      font-size: 14px;
      line-height: 1.6;
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
    this._showPreferences = false;
    this._preferences = [];
    this._prefLoading = false;
    this._prefEditing = null;
    this._showSettings = false;
    this._prefFormData = null;
    this._pendingFile = null;
    this._lightboxSrc = null;
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

  _parseInput(text) {
    if (text.startsWith('?')) return { isQuery: true, isPref: false, content: text.slice(1).trim() };
    if (text.startsWith('/ask ')) return { isQuery: true, isPref: false, content: text.slice(5).trim() };
    if (text.startsWith('/pref ')) return { isQuery: false, isPref: true, content: text.slice(6).trim() };
    return { isQuery: false, isPref: false, content: text };
  }

  _triggerFileInput() {
    const input = this.renderRoot.querySelector('#doc-file-input');
    if (input) input.click();
  }

  _onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      this._addMsg('error', 'Unsupported file type. Use JPEG, PNG, WebP, or PDF.');
      e.target.value = '';
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      this._addMsg('error', 'File too large. Maximum size is 20MB.');
      e.target.value = '';
      return;
    }

    this._pendingFile = file;
    e.target.value = '';
  }

  _clearPendingFile() {
    this._pendingFile = null;
  }

  async _uploadDocument() {
    const file = this._pendingFile;
    if (!file) return;

    if (!this.online) {
      this._addMsg('error', 'Document upload requires an internet connection.');
      return;
    }

    const contextText = this.inputText.trim();
    const displayName = file.name || 'document';
    const userText = contextText
      ? `[Uploaded: ${displayName}] ${contextText}`
      : `[Uploaded: ${displayName}]`;

    this.messages = [...this.messages, {
      type: 'user',
      text: userText,
      timestamp: new Date().toISOString(),
    }];

    this.inputText = '';
    this._pendingFile = null;
    this.loading = true;

    const textarea = this.renderRoot.querySelector('textarea');
    if (textarea) textarea.style.height = 'auto';

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('source_channel', 'web');
      if (contextText) formData.append('context', contextText);
      if (this.user) formData.append('metadata_user', this.user);

      const headers = {};
      const apiKey = this._getApiKey();
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

      const resp = await fetch(`${BASE_PATH}/documents/upload`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (resp.status === 401) {
        this._showApiKeyDialog = true;
        this._addMsg('error', 'API key required.');
        return;
      }

      const responseText = await resp.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseErr) {
        console.error('[Chat:Upload] Response not valid JSON:', responseText.substring(0, 500));
        this._addMsg('error', `Server returned invalid response (HTTP ${resp.status})`);
        return;
      }

      if (result.success && result.data) {
        const ext = result.data.extraction;
        const docOpts = result.data.thought_id ? {
          documentUrl: `${BASE_PATH}/documents/${result.data.thought_id}`,
          documentMimeType: file.type,
          documentFilename: file.name || 'document',
        } : {};
        if (ext) {
          const parts = [`**${ext.title}**`];
          parts.push(`Type: ${ext.document_type}`);
          if (ext.vendor) parts.push(`Vendor: ${ext.vendor}`);
          if (ext.total_amount) parts.push(`Amount: ${ext.total_amount}`);
          if (ext.date) parts.push(`Date: ${ext.date}`);
          if (ext.extracted_text) {
            const preview = ext.extracted_text.length > 300
              ? ext.extracted_text.substring(0, 300) + '...'
              : ext.extracted_text;
            parts.push(`\n${preview}`);
          }
          this._addMsg('system', parts.join('\n'), { markdown: true, ...docOpts });
        } else {
          this._addMsg('system', 'Document uploaded and saved.', { markdown: true, ...docOpts });
        }
      } else {
        this._addMsg('error', result.error || 'Upload failed.');
      }
    } catch (err) {
      this._addMsg('error', err.message || 'Network error during upload');
    } finally {
      this.loading = false;
      this._saveMessageHistory();
    }
  }

  /** Shared POST helper — handles auth, content-type, and error responses. */
  async _apiPost(path, body) {
    const resp = await fetch(`${BASE_PATH}${path}`, {
      method: 'POST',
      headers: this._getHeaders(),
      body: JSON.stringify(body),
    });

    if (resp.status === 401) {
      this._showApiKeyDialog = true;
      throw new Error('API key required. Use the settings button to enter your key.');
    }

    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('Failed to reach Open Brain service.');
    }

    return resp.json();
  }

  async _send() {
    // If there's a pending file, upload it instead
    if (this._pendingFile) {
      return this._uploadDocument();
    }

    const text = this.inputText.trim();
    if (!text || this.loading) return;

    const userMsg = {
      type: 'user',
      text,
      timestamp: new Date().toISOString(),
    };
    this.messages = [...this.messages, userMsg];
    this.inputText = '';

    const textarea = this.renderRoot.querySelector('textarea');
    if (textarea) textarea.style.height = 'auto';

    const { isQuery, isPref, content } = this._parseInput(text);

    // Preference extraction mode — no offline support
    if (isPref) {
      if (!this.online) {
        this._addMsg('error', 'Preference extraction requires an internet connection.');
        return;
      }
      this.loading = true;
      try {
        const result = await this._apiPost('/preferences/extract', { text: content });
        if (result.success && result.data) {
          const p = result.data;
          this._addMsg('system', `**Preference saved:** ${p.preference_name}\n- **Domain:** ${p.domain}\n- **Want:** ${p.want}\n- **Reject:** ${p.reject}\n- **Type:** ${p.constraint_type}`, { markdown: true });
        } else {
          this._addMsg('error', result.error || 'Could not extract preference.');
        }
      } catch (err) {
        this._addMsg('error', err.message || 'Network error');
      } finally {
        this.loading = false;
        this._saveMessageHistory();
      }
      return;
    }

    // Query mode — no offline support
    if (isQuery) {
      if (!this.online) {
        this._addMsg('error', 'Brain queries require an internet connection.');
        return;
      }
      this.loading = true;
      try {
        const result = await this._apiPost('/thoughts/query', { question: content });
        if (result.success && result.data) {
          this._addMsg('system', result.data.answer, { markdown: true });
        } else {
          this._addMsg('error', result.error || 'Query failed.');
        }
      } catch (err) {
        this._addMsg('error', err.message || 'Network error');
      } finally {
        this.loading = false;
        this._saveMessageHistory();
      }
      return;
    }

    // Capture mode
    const body = { text, source_channel: 'web', metadata: {} };
    if (this.user) body.metadata.user = this.user;

    if (!this.online) {
      this._queueOffline(body, userMsg);
      return;
    }

    this.loading = true;
    try {
      const result = await this._apiPost('/thoughts', body);

      if (result.success && result.data) {
        const ack = this._buildAck(result.data);
        this.messages = [...this.messages, ack];
      } else if (result.offline) {
        this._queueOffline(body, userMsg);
        this._addMsg('system', 'You\'re offline. This thought will be sent when you reconnect.');
      } else {
        this._addMsg('error', result.error || 'Something went wrong.');
      }
    } catch (err) {
      this._queueOffline(body, userMsg);
      this._addMsg('system', 'Offline. Thought queued for when you reconnect.');
    } finally {
      this.loading = false;
      this._saveMessageHistory();
    }
  }

  _viewDocument(e, msg) {
    e.preventDefault();
    if (msg.documentMimeType && msg.documentMimeType.startsWith('image/')) {
      this._lightboxSrc = msg.documentUrl;
    } else {
      window.open(msg.documentUrl, '_blank');
    }
  }

  _addMsg(type, text, opts = {}) {
    this.messages = [...this.messages, {
      type,
      text,
      timestamp: new Date().toISOString(),
      ...opts,
    }];
  }

  _buildAck(data) {
    let text = 'Got it';
    const sourceUrl = data.source_url;
    const isUrlIngested = sourceUrl && data.thought_type === 'reference' && data.metadata?.title;
    const isUrlMentioned = sourceUrl && !isUrlIngested;

    if (isUrlIngested) {
      const domain = this._extractDomain(sourceUrl);
      text = `Fetched: ${data.metadata.title} from ${domain} \u2014 saved as reference, indexed for search`;
    } else if (isUrlMentioned) {
      const parts = [];
      if (data.auto_type) parts.push(data.auto_type);
      if (data.auto_topics?.length > 0) {
        const topicsStr = data.auto_topics.join(', ');
        text = parts.length > 0
          ? `Got it \u2014 tagged as ${parts[0]} about ${topicsStr}. Also fetching ${sourceUrl} in the background.`
          : `Got it \u2014 about ${topicsStr}. Also fetching ${sourceUrl} in the background.`;
      } else if (parts.length > 0) {
        text = `Got it \u2014 tagged as ${parts[0]}. Also fetching ${sourceUrl} in the background.`;
      } else {
        text = `Got it \u2014 captured. Also fetching ${sourceUrl} in the background.`;
      }
    } else {
      const parts = [];
      if (data.auto_type) parts.push(data.auto_type);
      if (data.auto_topics?.length > 0) {
        const topicsStr = data.auto_topics.join(', ');
        text = parts.length > 0
          ? `Got it \u2014 tagged as ${parts[0]} about ${topicsStr}`
          : `Got it \u2014 about ${topicsStr}`;
      } else if (parts.length > 0) {
        text = `Got it \u2014 tagged as ${parts[0]}`;
      } else {
        text = 'Got it \u2014 captured';
      }
    }

    return {
      type: 'system',
      text,
      autoType: data.auto_type || null,
      autoTopics: data.auto_topics || [],
      timestamp: new Date().toISOString(),
    };
  }

  _extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
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

  // ============================================================
  // PREFERENCES METHODS
  // ============================================================

  async _loadPreferences() {
    this._prefLoading = true;
    try {
      const resp = await fetch(`${BASE_PATH}/preferences`, {
        headers: this._getHeaders(),
      });
      if (resp.ok) {
        const result = await resp.json();
        if (result.success) {
          this._preferences = result.data || [];
        }
      }
    } catch {
      // Silent fail
    } finally {
      this._prefLoading = false;
    }
  }

  _openPreferences() {
    this._showSettings = false;
    this._showPreferences = true;
    this._prefFormData = null;
    this._prefEditing = null;
    this._loadPreferences();
  }

  _openAddPrefForm() {
    this._prefEditing = null;
    this._prefFormData = {
      preference_name: '',
      domain: 'general',
      reject: '',
      want: '',
      constraint_type: 'quality standard',
    };
  }

  _openEditPrefForm(pref) {
    this._prefEditing = pref.id;
    this._prefFormData = {
      preference_name: pref.preference_name,
      domain: pref.domain,
      reject: pref.reject,
      want: pref.want,
      constraint_type: pref.constraint_type,
    };
  }

  _cancelPrefForm() {
    this._prefFormData = null;
    this._prefEditing = null;
  }

  async _savePref() {
    if (!this._prefFormData) return;
    const data = this._prefFormData;
    if (!data.preference_name || !data.reject || !data.want) return;

    try {
      if (this._prefEditing) {
        await fetch(`${BASE_PATH}/preferences/${this._prefEditing}`, {
          method: 'PUT',
          headers: this._getHeaders(),
          body: JSON.stringify(data),
        });
      } else {
        await fetch(`${BASE_PATH}/preferences`, {
          method: 'POST',
          headers: this._getHeaders(),
          body: JSON.stringify(data),
        });
      }
      this._prefFormData = null;
      this._prefEditing = null;
      await this._loadPreferences();
    } catch {
      // Silent fail
    }
  }

  async _deletePref(id) {
    if (!confirm('Delete this preference?')) return;
    try {
      await fetch(`${BASE_PATH}/preferences/${id}`, {
        method: 'DELETE',
        headers: this._getHeaders(),
      });
      await this._loadPreferences();
    } catch {
      // Silent fail
    }
  }

  async _copyPrefBlock() {
    try {
      const resp = await fetch(`${BASE_PATH}/preferences/block`, {
        headers: this._getHeaders(),
      });
      if (resp.ok) {
        const result = await resp.json();
        if (result.success && result.data.block) {
          await navigator.clipboard.writeText(result.data.block);
          // Brief visual feedback
          const btn = this.renderRoot.querySelector('.pref-copy-btn');
          if (btn) {
            const original = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = original; }, 1500);
          }
        }
      }
    } catch {
      // Silent fail
    }
  }

  _renderPreferencesPanel() {
    // Group preferences by domain
    const grouped = {};
    for (const p of this._preferences) {
      if (!grouped[p.domain]) grouped[p.domain] = [];
      grouped[p.domain].push(p);
    }
    const domains = Object.keys(grouped).sort();

    return html`
      <div class="pref-overlay">
        <div class="pref-header">
          <h2>Taste Preferences</h2>
          <button class="pref-back-btn" @click=${() => { this._showPreferences = false; }}>Done</button>
        </div>
        <div class="pref-body">
          <div class="pref-actions">
            <button class="pref-add-btn" @click=${this._openAddPrefForm}>+ Add Preference</button>
            ${this._preferences.length > 0 ? html`
              <button class="pref-copy-btn" @click=${this._copyPrefBlock}>Copy Block</button>
            ` : ''}
          </div>

          ${this._prefFormData && !this._prefEditing ? this._renderPrefForm() : ''}

          ${this._prefLoading ? html`
            <div class="pref-empty">Loading...</div>
          ` : domains.length === 0 && !this._prefFormData ? html`
            <div class="pref-empty">
              No preferences yet. Add your first one to start building your taste profile.
            </div>
          ` : domains.map((domain) => html`
            <div class="pref-domain-group">
              <div class="pref-domain-label">${domain}</div>
              ${grouped[domain].map((p) =>
                this._prefEditing === p.id ? this._renderPrefForm() : html`
                  <div class="pref-card">
                    <div class="pref-card-header">
                      <span class="pref-card-name">${p.preference_name}</span>
                      <span class="pref-card-badge">${p.constraint_type}</span>
                    </div>
                    <div class="pref-card-field">
                      <strong>Reject: </strong><span>${p.reject}</span>
                    </div>
                    <div class="pref-card-field">
                      <strong>Want: </strong><span>${p.want}</span>
                    </div>
                    <div class="pref-card-actions">
                      <button class="pref-edit-btn" @click=${() => this._openEditPrefForm(p)}>Edit</button>
                      <button class="pref-delete-btn" @click=${() => this._deletePref(p.id)}>Delete</button>
                    </div>
                  </div>
                `
              )}
            </div>
          `)}
        </div>
      </div>
    `;
  }

  _renderPrefForm() {
    const d = this._prefFormData;
    return html`
      <div class="pref-form">
        <label>Preference Name</label>
        <input type="text" .value=${d.preference_name}
          @input=${(e) => { this._prefFormData = { ...d, preference_name: e.target.value }; }} />

        <label>Domain</label>
        <input type="text" .value=${d.domain}
          @input=${(e) => { this._prefFormData = { ...d, domain: e.target.value }; }} />

        <label>Reject</label>
        <textarea .value=${d.reject}
          @input=${(e) => { this._prefFormData = { ...d, reject: e.target.value }; }}></textarea>

        <label>Want</label>
        <textarea .value=${d.want}
          @input=${(e) => { this._prefFormData = { ...d, want: e.target.value }; }}></textarea>

        <label>Constraint Type</label>
        <select .value=${d.constraint_type}
          @change=${(e) => { this._prefFormData = { ...d, constraint_type: e.target.value }; }}>
          <option value="quality standard">Quality Standard</option>
          <option value="domain rule">Domain Rule</option>
          <option value="business logic">Business Logic</option>
          <option value="formatting">Formatting</option>
        </select>

        <div class="btn-row">
          <button class="btn-secondary" @click=${this._cancelPrefForm}>Cancel</button>
          <button class="btn-primary" @click=${this._savePref}>
            ${this._prefEditing ? 'Update' : 'Add'}
          </button>
        </div>
      </div>
    `;
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

    // System message — render markdown for query responses
    return html`
      <div class="message system">
        <div>${msg.markdown ? unsafeHTML(marked.parse(msg.text, { breaks: true, gfm: true })) : msg.text}</div>
        ${msg.documentUrl ? html`
          <a class="doc-link" href=${msg.documentUrl} @click=${(e) => this._viewDocument(e, msg)}>
            View original${msg.documentFilename ? ` (${msg.documentFilename})` : ''}
          </a>
        ` : ''}
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
    const canSend = (this.inputText.trim().length > 0 || this._pendingFile) && !this.loading;

    return html`
      <div class="header">
        <div class="header-icon">&#129504;</div>
        <span class="header-title">Open Brain</span>
        <div class="header-right">
          <a href="${BASE_PATH}/ui/browse" class="header-nav-link" title="Browse thoughts">&#128218;</a>
          <div class="header-status">
            <div class="status-dot ${this.online ? '' : 'offline'}"></div>
            ${this.online ? 'Online' : 'Offline'}
          </div>
          <div style="position: relative;">
            <button class="settings-btn" @click=${() => { this._showSettings = !this._showSettings; }} title="Settings">
              &#9881;
            </button>
            ${this._showSettings ? html`
              <div class="settings-menu">
                <button @click=${() => { this._showSettings = false; this._showApiKeyDialog = true; }}>API Key</button>
                <button @click=${this._openPreferences}>Preferences</button>
                <a href="${BASE_PATH}/ui/setup" style="display:block;padding:8px 16px;color:#e2e8f0;text-decoration:none;font-size:14px;">Setup</a>
              </div>
            ` : ''}
          </div>
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
            Type a thought to capture it, <strong>?</strong> to ask your brain, or <strong>/pref</strong> to set a preference.
          </div>
        </div>
      `}

      <div class="input-area">
        <input
          id="doc-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          style="display:none"
          @change=${this._onFileSelected}
        />
        <button
          class="upload-btn"
          @click=${this._triggerFileInput}
          title="Upload document"
          aria-label="Upload document"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"></path>
          </svg>
        </button>
        ${this._pendingFile ? html`
          <div class="file-preview">
            <span class="file-name">${this._pendingFile.name}</span>
            <button class="file-remove" @click=${this._clearPendingFile} title="Remove file">&times;</button>
          </div>
        ` : ''}
        <textarea
          rows="1"
          placeholder="${this._pendingFile ? 'Add context (optional)...' : 'Capture a thought or ? to ask...'}"
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
      ${this._showPreferences ? this._renderPreferencesPanel() : ''}
      ${this._lightboxSrc ? html`
        <div class="lightbox-overlay" @click=${() => { this._lightboxSrc = null; }}>
          <img src=${this._lightboxSrc} alt="Document" />
        </div>
      ` : ''}
    `;
  }
}

customElements.define('open-brain-chat', OpenBrainChat);
