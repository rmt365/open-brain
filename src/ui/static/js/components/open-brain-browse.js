import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import './backup-indicator.js';
import './api-key-dialog.js';
import { hasApiKey, getAuthHeaders } from './auth-mixin.js';

const BASE_PATH = window.__BASE_PATH || '';

// Type badge colors
const TYPE_COLORS = {
  reference: '#818cf8',
  idea: '#60a5fa',
  task: '#f59e0b',
  note: '#94a3b8',
  observation: '#22c55e',
  question: '#06b6d4',
  decision: '#a855f7',
  reflection: '#ec4899',
};

// Abbreviated type labels
const TYPE_LABELS = {
  reference: 'ref',
  idea: 'idea',
  task: 'task',
  note: 'note',
  observation: 'obs',
  question: 'qn',
  decision: 'dec',
  reflection: 'refl',
};

const THOUGHT_TYPES = ['reference', 'idea', 'task', 'note', 'observation', 'question', 'decision', 'reflection'];

class OpenBrainBrowse extends LitElement {
  static properties = {
    _thoughts: { type: Array, state: true },
    _total: { type: Number, state: true },
    _loading: { type: Boolean, state: true },
    _searchQuery: { type: String, state: true },
    _activeFilter: { type: String, state: true },
    _expandedId: { type: String, state: true },
    _editingField: { type: String, state: true },
    _offset: { type: Number, state: true },
    _hasMore: { type: Boolean, state: true },
    _lightboxSrc: { type: String, state: true },
    _lifeAreas: { type: Array, state: true },
    _online: { type: Boolean, state: true },
    _showApiKeyDialog: { type: Boolean, state: true },
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
      --accent: #818cf8;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --card-bg: #1e293b;
      --input-bg: #1a1830;
      --input-border: #312e81;
    }

    .header {
      display: flex;
      align-items: center;
      padding: 12px 16px;
      background: var(--header-bg);
      gap: 10px;
      flex-shrink: 0;
    }
    .header-icon { font-size: 24px; }
    .header-title {
      font-size: 16px;
      font-weight: 600;
      flex: 1;
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
      color: var(--text-primary);
    }

    .controls {
      padding: 12px 16px;
      flex-shrink: 0;
    }
    .search-input {
      width: 100%;
      padding: 10px 14px;
      background: var(--input-bg);
      border: 1px solid var(--input-border);
      border-radius: 8px;
      color: var(--text-primary);
      font-size: 14px;
      outline: none;
      box-sizing: border-box;
    }
    .search-input:focus { border-color: var(--accent); }
    .search-input::placeholder { color: var(--text-muted); }

    .filters {
      display: flex;
      gap: 6px;
      padding: 0 16px 12px;
      flex-wrap: wrap;
      flex-shrink: 0;
    }
    .filter-chip {
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 12px;
      border: none;
      cursor: pointer;
      background: var(--card-bg);
      color: var(--text-secondary);
      transition: all 0.15s;
    }
    .filter-chip:hover { color: var(--text-primary); }
    .filter-chip.active {
      background: var(--accent);
      color: white;
    }

    .thought-list {
      flex: 1;
      overflow-y: auto;
      padding: 0 16px 16px;
      scroll-behavior: smooth;
    }
    .thought-list::-webkit-scrollbar { width: 4px; }
    .thought-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

    .thought-row {
      display: flex;
      gap: 8px;
      padding: 10px 0;
      border-bottom: 1px solid rgba(30, 41, 59, 0.3);
      cursor: pointer;
      font-size: 13px;
      transition: opacity 0.15s;
    }
    .thought-row:hover { opacity: 0.85; }
    .type-badge {
      width: 50px;
      flex-shrink: 0;
      font-size: 11px;
      padding-top: 2px;
    }
    .thought-text {
      flex: 1;
      min-width: 0;
    }
    .thought-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .thought-meta {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .thought-time {
      width: 40px;
      flex-shrink: 0;
      text-align: right;
      font-size: 11px;
      color: var(--text-muted);
    }

    /* Expanded */
    .expanded {
      background: var(--card-bg);
      border-radius: 8px;
      margin: 6px 0;
      border-left: 3px solid var(--accent);
      overflow: hidden;
    }
    .expanded-header {
      display: flex;
      gap: 8px;
      padding: 10px 12px;
      cursor: pointer;
      align-items: flex-start;
    }
    .expanded-header .type-badge { font-size: 12px; }
    .expanded-header .thought-title {
      font-weight: 600;
      white-space: normal;
    }
    .expanded-body { padding: 0 12px 12px; }

    .source-url {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 10px;
    }
    .source-url .label {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .source-url a {
      font-size: 12px;
      color: var(--accent);
      text-decoration: none;
      word-break: break-all;
    }
    .source-url a:hover { text-decoration: underline; }

    .text-preview {
      font-size: 13px;
      color: #cbd5e1;
      line-height: 1.5;
      margin-bottom: 12px;
      padding: 10px;
      background: #0f172a;
      border-radius: 6px;
      max-height: 200px;
      overflow-y: auto;
      white-space: pre-wrap;
    }

    .topic-pills {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .topic-pill {
      background: #312e81;
      padding: 2px 8px;
      border-radius: 8px;
      font-size: 11px;
      color: #a5b4fc;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      font-size: 11px;
    }
    .meta-grid .label { color: var(--text-muted); }
    .meta-grid .value { color: var(--text-secondary); }
    .meta-grid .editable {
      cursor: pointer;
      border-bottom: 1px dashed var(--text-muted);
      padding-bottom: 1px;
    }
    .meta-grid .editable:hover { color: var(--accent); }

    .edit-select {
      background: var(--input-bg);
      border: 1px solid var(--accent);
      border-radius: 4px;
      color: var(--text-primary);
      font-size: 11px;
      padding: 2px 4px;
      outline: none;
    }

    .load-more {
      text-align: center;
      padding: 16px;
      color: var(--text-muted);
      font-size: 13px;
    }
    .load-more button {
      background: var(--card-bg);
      border: 1px solid var(--input-border);
      color: var(--text-secondary);
      padding: 8px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
    }
    .load-more button:hover { color: var(--text-primary); }

    .delete-row {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.05);
      text-align: right;
    }
    .delete-btn {
      background: none;
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #ef4444;
      padding: 4px 12px;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .delete-btn:hover {
      background: rgba(239, 68, 68, 0.15);
      border-color: #ef4444;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted);
    }
    .empty-state .icon { font-size: 48px; margin-bottom: 12px; }

    .spinner {
      text-align: center;
      padding: 20px;
      color: var(--text-muted);
    }

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
    .doc-link {
      font-size: 12px;
      color: var(--accent);
      text-decoration: none;
      cursor: pointer;
    }
    .doc-link:hover { text-decoration: underline; }
  `;

  constructor() {
    super();
    this._thoughts = [];
    this._total = 0;
    this._loading = false;
    this._searchQuery = '';
    this._activeFilter = '';
    this._expandedId = null;
    this._editingField = null;
    this._offset = 0;
    this._hasMore = true;
    this._online = navigator.onLine;
    this._lightboxSrc = null;
    this._lifeAreas = [];
  }

  connectedCallback() {
    super.connectedCallback();
    this._showApiKeyDialog = !hasApiKey();
    this._loadLifeAreas();
    this._loadThoughts();
    this._onOnline = () => { this._online = true; };
    this._onOffline = () => { this._online = false; };
    window.addEventListener('online', this._onOnline);
    window.addEventListener('offline', this._onOffline);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('online', this._onOnline);
    window.removeEventListener('offline', this._onOffline);
  }

  async _loadLifeAreas() {
    try {
      const res = await fetch(`${BASE_PATH}/life-areas`, { headers: this._getHeaders() });
      const json = await res.json();
      if (json.success && json.data) {
        this._lifeAreas = json.data;
      }
    } catch (e) {
      console.warn('Failed to load life areas:', e);
    }
  }

  _getHeaders() {
    return getAuthHeaders();
  }

  async _loadThoughts(append = false) {
    this._loading = true;
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      params.set('offset', String(this._offset));
      if (this._activeFilter) params.set('type', this._activeFilter);

      const res = await fetch(`${BASE_PATH}/thoughts?${params}`, { headers: this._getHeaders() });
      if (res.status === 401) { this._showApiKeyDialog = true; return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();

      if (json.success && json.data) {
        const items = json.data.items || [];
        this._thoughts = append ? [...this._thoughts, ...items] : items;
        this._total = json.data.total || 0;
        this._hasMore = this._thoughts.length < this._total;
      }
    } catch (err) {
      console.error('[Browse] Failed to load thoughts:', err);
    } finally {
      this._loading = false;
    }
  }

  async _searchThoughts() {
    if (!this._searchQuery.trim()) {
      this._offset = 0;
      this._loadThoughts();
      return;
    }
    this._loading = true;
    try {
      const res = await fetch(`${BASE_PATH}/thoughts/search`, {
        method: 'POST',
        headers: this._getHeaders(),
        body: JSON.stringify({
          query: this._searchQuery,
          thought_type: this._activeFilter || undefined,
          limit: 50,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && json.data) {
        this._thoughts = json.data.map(r => {
          const thought = r.thought || r;
          if (r.similarity !== undefined) thought._similarity = r.similarity;
          return thought;
        });
        this._total = this._thoughts.length;
        this._hasMore = false;
      }
    } catch (err) {
      console.error('[Browse] Search failed:', err);
    } finally {
      this._loading = false;
    }
  }

  _onSearchInput(e) {
    this._searchQuery = e.target.value;
    clearTimeout(this._searchDebounce);
    this._searchDebounce = setTimeout(() => this._searchThoughts(), 400);
  }

  _setFilter(type) {
    this._activeFilter = this._activeFilter === type ? '' : type;
    this._offset = 0;
    this._expandedId = null;
    if (this._searchQuery) {
      this._searchThoughts();
    } else {
      this._loadThoughts();
    }
  }

  _toggleExpand(id) {
    this._expandedId = this._expandedId === id ? null : id;
    this._editingField = null;
  }

  _loadMore() {
    this._offset += 50;
    this._loadThoughts(true);
  }

  async _deleteThought(id) {
    try {
      const res = await fetch(`${BASE_PATH}/thoughts/${id}`, {
        method: 'DELETE',
        headers: this._getHeaders(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._thoughts = this._thoughts.filter(t => t.id !== id);
      this._total = Math.max(0, this._total - 1);
      this._expandedId = null;
    } catch (err) {
      console.error('[Browse] Delete failed:', err);
    }
  }

  async _updateThought(id, field, value) {
    try {
      const body = {};
      body[field] = value;
      const res = await fetch(`${BASE_PATH}/thoughts/${id}`, {
        method: 'PUT',
        headers: this._getHeaders(),
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && json.data) {
        this._thoughts = this._thoughts.map(t => t.id === id ? json.data : t);
      }
    } catch (err) {
      console.error('[Browse] Update failed:', err);
    }
    this._editingField = null;
  }

  _formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts.includes('T') ? ts : ts + 'Z');
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'now';
    if (diffMin < 60) return `${diffMin}m`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 30) return `${diffDays}d`;
    return d.toLocaleDateString();
  }

  _extractDomain(url) {
    try { return new URL(url).hostname; } catch { return url; }
  }

  _viewDocument(e, thought) {
    e.preventDefault();
    e.stopPropagation();
    const mimeType = thought.metadata?.mime_type || '';
    const url = `${BASE_PATH}/documents/${thought.id}`;
    if (mimeType.startsWith('image/')) {
      this._lightboxSrc = url;
    } else {
      window.open(url, '_blank');
    }
  }

  _getTypeColor(type) {
    return TYPE_COLORS[type] || '#94a3b8';
  }

  _getTypeLabel(type) {
    return TYPE_LABELS[type] || type;
  }

  _onApiKeyChanged() {
    this._showApiKeyDialog = false;
    this._loadLifeAreas();
    this._loadThoughts();
  }

  render() {
    return html`
      <api-key-dialog
        .open=${this._showApiKeyDialog}
        .required=${!hasApiKey()}
        @api-key-changed=${this._onApiKeyChanged}
      ></api-key-dialog>
      <div class="header">
        <div class="header-icon">&#129504;</div>
        <span class="header-title">Open Brain</span>
        <a href="${BASE_PATH}/ui/brain" class="header-nav-link" title="Capture thoughts">&#128172;</a>
        <a href="${BASE_PATH}/ui/explore" class="header-nav-link" title="Explore brain">&#127758;</a>
        <backup-indicator></backup-indicator>
        <div class="header-status">
          <div class="status-dot ${this._online ? '' : 'offline'}"></div>
          ${this._online ? 'Online' : 'Offline'}
        </div>
      </div>

      <div class="controls">
        <input
          class="search-input"
          type="text"
          placeholder="Search thoughts..."
          .value=${this._searchQuery}
          @input=${this._onSearchInput}
        />
      </div>

      <div class="filters">
        <button
          class="filter-chip ${!this._activeFilter ? 'active' : ''}"
          @click=${() => this._setFilter('')}
        >All${this._total ? ` (${this._total})` : ''}</button>
        ${THOUGHT_TYPES.map(type => html`
          <button
            class="filter-chip ${this._activeFilter === type ? 'active' : ''}"
            @click=${() => this._setFilter(type)}
          >${type}</button>
        `)}
      </div>

      <div class="thought-list">
        ${this._thoughts.length === 0 && !this._loading ? html`
          <div class="empty-state">
            <div class="icon">&#129504;</div>
            <p>${this._searchQuery ? 'No matching thoughts found.' : 'No thoughts yet. Go capture some!'}</p>
          </div>
        ` : ''}

        ${this._thoughts.map(t => this._expandedId === t.id
          ? this._renderExpanded(t)
          : this._renderRow(t)
        )}

        ${this._loading ? html`<div class="spinner">Loading...</div>` : ''}

        ${!this._loading && this._hasMore && this._thoughts.length > 0 ? html`
          <div class="load-more">
            <button @click=${this._loadMore}>Load more</button>
          </div>
        ` : ''}
      </div>

      ${this._lightboxSrc ? html`
        <div class="lightbox-overlay" @click=${() => { this._lightboxSrc = null; }}>
          <img src=${this._lightboxSrc} alt="Document" />
        </div>
      ` : ''}
    `;
  }

  _renderRow(t) {
    const topics = (t.auto_topics || []).join(', ');
    const domain = t.source_url ? this._extractDomain(t.source_url) : '';
    const similarity = t._similarity !== undefined ? `${(t._similarity * 100).toFixed(0)}%` : '';
    const meta = [similarity, topics, domain].filter(Boolean).join(' · ');
    const title = t.metadata?.title || t.text;
    const displayTitle = title.length > 80 ? title.substring(0, 80) + '...' : title;

    return html`
      <div class="thought-row" @click=${() => this._toggleExpand(t.id)}>
        <div class="type-badge" style="color: ${this._getTypeColor(t.thought_type)}">
          ${this._getTypeLabel(t.thought_type)}
        </div>
        <div class="thought-text">
          <div class="thought-title">${displayTitle}</div>
          ${meta ? html`<div class="thought-meta">${meta}</div>` : ''}
        </div>
        <div class="thought-time">${this._formatTime(t.created_at)}</div>
      </div>
    `;
  }

  _renderExpanded(t) {
    const typeColor = this._getTypeColor(t.thought_type);
    const title = t.metadata?.title || t.text.split('\n')[0];
    const topics = t.auto_topics || [];

    return html`
      <div class="expanded" style="border-left-color: ${typeColor}">
        <div class="expanded-header" @click=${() => this._toggleExpand(t.id)}>
          <div class="type-badge" style="color: ${typeColor}">${t.thought_type}</div>
          <div class="thought-text">
            <div class="thought-title">${title}</div>
          </div>
          <div class="thought-time">${this._formatTime(t.created_at)}</div>
        </div>

        <div class="expanded-body">
          ${t.source_url ? html`
            <div class="source-url">
              <span class="label">Source</span>
              <a href="${t.source_url}" target="_blank" rel="noopener">${t.source_url}</a>
            </div>
          ` : ''}

          ${t.metadata?.wasabi_key ? html`
            <div class="source-url">
              <span class="label">Document</span>
              <a class="doc-link" href="${BASE_PATH}/documents/${t.id}" @click=${(e) => this._viewDocument(e, t)}>${t.metadata.original_filename || 'View original'}${t.metadata.file_size ? ` (${(t.metadata.file_size / 1024).toFixed(0)} KB)` : ''}</a>
            </div>
          ` : ''}

          <div class="text-preview">${t.text}</div>

          ${topics.length > 0 ? html`
            <div class="topic-pills">
              ${topics.map(topic => html`<span class="topic-pill">${topic}</span>`)}
            </div>
          ` : ''}

          <div class="meta-grid">
            <div>
              <span class="label">Type: </span>
              ${this._editingField === `type-${t.id}` ? html`
                <select class="edit-select"
                  @change=${(e) => this._updateThought(t.id, 'thought_type', e.target.value)}
                  @blur=${() => { this._editingField = null; }}>
                  ${THOUGHT_TYPES.map(type => html`
                    <option value=${type} ?selected=${t.thought_type === type}>${type}</option>
                  `)}
                </select>
              ` : html`
                <span class="value editable"
                  @click=${(e) => { e.stopPropagation(); this._editingField = `type-${t.id}`; }}
                >${t.thought_type}</span>
              `}
            </div>
            <div>
              <span class="label">Life area: </span>
              ${this._editingField === `area-${t.id}` ? html`
                <select class="edit-select"
                  @change=${(e) => this._updateThought(t.id, 'life_area', e.target.value)}
                  @blur=${() => { this._editingField = null; }}>
                  <option value="">—</option>
                  ${this._lifeAreas.map(area => html`
                    <option value=${area.name} ?selected=${(t.life_area || t.auto_life_area) === area.name}>${area.name}</option>
                  `)}
                </select>
              ` : html`
                <span class="value editable"
                  @click=${(e) => { e.stopPropagation(); this._editingField = `area-${t.id}`; }}
                >${t.life_area || t.auto_life_area || '—'}</span>
              `}
            </div>
            <div>
              <span class="label">Topic: </span>
              ${this._editingField === `topic-${t.id}` ? html`
                <input class="edit-select" type="text"
                  .value=${t.topic || ''}
                  placeholder="Enter topic..."
                  @keydown=${(e) => { if (e.key === 'Enter') this._updateThought(t.id, 'topic', e.target.value); }}
                  @blur=${(e) => { if (e.target.value !== (t.topic || '')) this._updateThought(t.id, 'topic', e.target.value); else this._editingField = null; }}>
              ` : html`
                <span class="value editable"
                  @click=${(e) => { e.stopPropagation(); this._editingField = `topic-${t.id}`; }}
                >${t.topic || '—'}</span>
              `}
            </div>
            <div>
              <span class="label">Sentiment: </span>
              <span class="value">${t.auto_sentiment || '—'}</span>
            </div>
            <div>
              <span class="label">Embedded: </span>
              <span class="value" style="color: ${t.has_embedding ? '#22c55e' : '#64748b'}">${t.has_embedding ? 'yes' : 'no'}</span>
            </div>
          </div>

          <div class="delete-row">
            <button class="delete-btn" @click=${(e) => { e.stopPropagation(); this._deleteThought(t.id); }}>Delete</button>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('open-brain-browse', OpenBrainBrowse);
