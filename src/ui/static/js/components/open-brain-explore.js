import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';
import { hierarchy, treemap, treemapSquarify } from 'https://cdn.jsdelivr.net/npm/d3-hierarchy@3/+esm';
import './backup-indicator.js';
import './api-key-dialog.js';
import { hasApiKey, getAuthHeaders } from './auth-mixin.js';

const BASE_PATH = window.__BASE_PATH || '';

// AREA_COLORS is now built dynamically from the API response
const DEFAULT_UNCLASSIFIED_COLOR = '#475569';

const TYPE_COLORS = {
  reference: '#818cf8',
  idea: '#60a5fa',
  task: '#f59e0b',
  note: '#94a3b8',
  observation: '#22c55e',
  question: '#06b6d4',
  decision: '#a855f7',
  reflection: '#ec4899',
  expense: '#f97316',
  contract: '#14b8a6',
  maintenance: '#84cc16',
  insurance: '#0ea5e9',
  event: '#fb7185',
  person: '#10b981',
};


class OpenBrainExplore extends LitElement {
  static properties = {
    _viewLevel: { type: String, state: true },
    _selectedArea: { type: String, state: true },
    _selectedTopic: { type: String, state: true },
    _treeData: { type: Object, state: true },
    _thoughts: { type: Array, state: true },
    _loading: { type: Boolean, state: true },
    _expandedId: { type: String, state: true },
    _editingField: { type: String, state: true },
    _suggestions: { type: Array, state: true },
    _showTriage: { type: Boolean, state: true },
    _triageLoading: { type: Boolean, state: true },
    _lifeAreas: { type: Array, state: true },
    _areaColors: { type: Object, state: true },
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
      --system-bubble: #1e293b;
      --text-primary: #f1f5f9;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --input-border: #312e81;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      background: var(--header-bg);
      border-bottom: 1px solid rgba(129, 140, 248, 0.15);
      flex-shrink: 0;
      padding-top: calc(14px + env(safe-area-inset-top, 0px));
    }

    .header-icon { font-size: 22px; }
    .header-title {
      font-size: 17px;
      font-weight: 600;
      color: var(--text-primary);
      flex: 1;
    }

    .header-nav-link {
      font-size: 20px;
      text-decoration: none;
      opacity: 0.6;
      transition: opacity 0.15s;
      padding: 4px;
    }
    .header-nav-link:hover { opacity: 1; }

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

    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 10px 16px;
      font-size: 13px;
      color: var(--text-muted);
      background: rgba(30, 27, 75, 0.5);
      flex-shrink: 0;
    }

    .breadcrumb-link {
      color: var(--accent);
      cursor: pointer;
      text-decoration: none;
    }
    .breadcrumb-link:hover { text-decoration: underline; }
    .breadcrumb-sep { margin: 0 2px; }

    .content {
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }

    /* Treemap */
    .treemap-container {
      position: relative;
      width: 100%;
      padding: 8px;
      box-sizing: border-box;
    }

    .treemap-cell {
      position: absolute;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 8px;
      transition: opacity 0.15s, transform 0.15s;
      overflow: hidden;
      box-sizing: border-box;
    }

    .treemap-cell:hover {
      opacity: 0.85;
      transform: scale(0.98);
    }

    .treemap-cell:active {
      transform: scale(0.95);
    }

    .cell-name {
      font-size: 14px;
      font-weight: 600;
      color: white;
      text-shadow: 0 1px 3px rgba(0,0,0,0.5);
      word-break: break-word;
      line-height: 1.3;
    }

    .cell-count {
      font-size: 20px;
      font-weight: 700;
      color: rgba(255,255,255,0.9);
      text-shadow: 0 1px 3px rgba(0,0,0,0.5);
      margin-bottom: 2px;
    }

    .cell-name-small {
      font-size: 11px;
    }

    /* Thought list */
    .thought-list {
      padding: 8px 16px;
    }

    .thought-card {
      background: var(--system-bubble);
      border-radius: 10px;
      padding: 12px 14px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .thought-card:hover { background: #253247; }

    .thought-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }

    .type-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      color: white;
    }

    .thought-date {
      font-size: 11px;
      color: var(--text-muted);
      margin-left: auto;
    }

    .thought-text {
      font-size: 13px;
      line-height: 1.5;
      color: var(--text-secondary);
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
    }

    .thought-text.expanded {
      -webkit-line-clamp: unset;
      display: block;
    }

    .thought-meta {
      font-size: 11px;
      color: var(--text-muted);
      margin-top: 8px;
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .thought-id {
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 4px;
      font-family: monospace;
    }

    .edit-select {
      background: rgba(255,255,255,0.08);
      border: 1px solid var(--accent);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 12px;
      padding: 2px 6px;
      cursor: pointer;
    }

    .editable {
      cursor: pointer;
      border-bottom: 1px dashed var(--text-muted);
    }

    /* Triage */
    .triage-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      cursor: pointer;
      color: var(--accent);
      font-size: 13px;
      font-weight: 600;
      border-top: 1px solid rgba(129, 140, 248, 0.1);
      flex-shrink: 0;
    }

    .triage-toggle:hover {
      background: rgba(129, 140, 248, 0.05);
    }

    .triage-badge {
      background: rgba(239, 68, 68, 0.2);
      color: #fca5a5;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
    }

    .triage-panel {
      border-top: 1px solid rgba(129, 140, 248, 0.1);
      max-height: 40vh;
      overflow-y: auto;
      padding: 8px 16px;
      background: rgba(15, 14, 26, 0.8);
    }

    .suggestion-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }

    .suggestion-name {
      flex: 1;
      font-size: 13px;
      color: var(--text-secondary);
    }

    .suggestion-btn {
      padding: 4px 10px;
      border-radius: 6px;
      border: none;
      font-size: 11px;
      cursor: pointer;
      transition: background 0.15s;
    }

    .btn-approve {
      background: rgba(34, 197, 94, 0.15);
      color: #86efac;
    }
    .btn-approve:hover { background: rgba(34, 197, 94, 0.25); }

    .btn-reject {
      background: rgba(239, 68, 68, 0.1);
      color: #fca5a5;
    }
    .btn-reject:hover { background: rgba(239, 68, 68, 0.2); }

    .suggestion-area-select {
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--input-border);
      border-radius: 6px;
      color: var(--text-primary);
      font-size: 11px;
      padding: 3px 6px;
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted);
      font-size: 14px;
    }

    .loading {
      text-align: center;
      padding: 40px;
      color: var(--text-muted);
    }
  `;

  constructor() {
    super();
    this._viewLevel = 'root';
    this._selectedArea = null;
    this._selectedTopic = null;
    this._treeData = null;
    this._thoughts = [];
    this._loading = true;
    this._expandedId = null;
    this._editingField = null;
    this._suggestions = [];
    this._showTriage = false;
    this._triageLoading = false;
    this._lifeAreas = [];
    this._areaColors = { unclassified: DEFAULT_UNCLASSIFIED_COLOR };
    this._online = navigator.onLine;
  }

  connectedCallback() {
    super.connectedCallback();
    this._showApiKeyDialog = !hasApiKey();
    this._loadLifeAreas();
    this._loadBreakdown();
    this._loadSuggestions();
    window.addEventListener('popstate', this._handlePopState);
    this._onOnline = () => { this._online = true; };
    this._onOffline = () => { this._online = false; };
    window.addEventListener('online', this._onOnline);
    window.addEventListener('offline', this._onOffline);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('popstate', this._handlePopState);
    window.removeEventListener('online', this._onOnline);
    window.removeEventListener('offline', this._onOffline);
  }

  _handlePopState = () => {
    const params = new URLSearchParams(window.location.search);
    const area = params.get('area');
    const topic = params.get('topic');
    if (topic && area) {
      this._viewLevel = 'topic';
      this._selectedArea = area;
      this._selectedTopic = topic;
      this._loadThoughts(area, topic);
    } else if (area) {
      this._viewLevel = 'area';
      this._selectedArea = area;
      this._selectedTopic = null;
    } else {
      this._viewLevel = 'root';
      this._selectedArea = null;
      this._selectedTopic = null;
    }
  };

  _getHeaders() {
    return getAuthHeaders();
  }

  async _loadLifeAreas() {
    try {
      const res = await fetch(`${BASE_PATH}/life-areas`, { headers: this._getHeaders() });
      const json = await res.json();
      if (json.success && json.data) {
        this._lifeAreas = json.data;
        const colors = { unclassified: DEFAULT_UNCLASSIFIED_COLOR };
        for (const area of json.data) {
          colors[area.name] = area.color;
        }
        this._areaColors = colors;
      }
    } catch (e) {
      console.warn('Failed to load life areas:', e);
    }
  }

  async _loadBreakdown() {
    this._loading = true;
    try {
      const resp = await fetch(`${BASE_PATH}/thoughts/stats/breakdown`, {
        headers: this._getHeaders(),
      });
      if (resp.status === 401) { this._showApiKeyDialog = true; return; }
      if (resp.ok) {
        const result = await resp.json();
        if (result.success) {
          this._treeData = result.data;
        }
      }
    } catch {
      // Silent fail
    } finally {
      this._loading = false;
    }
  }

  async _loadSuggestions() {
    try {
      const resp = await fetch(`${BASE_PATH}/topics/suggestions`, {
        headers: this._getHeaders(),
      });
      if (resp.ok) {
        const result = await resp.json();
        if (result.success) {
          this._suggestions = result.data || [];
        }
      }
    } catch {
      // Silent fail
    }
  }

  async _loadThoughts(area, topic) {
    this._loading = true;
    try {
      const params = new URLSearchParams({ limit: '50' });
      params.set('life_area', area);
      if (topic && topic !== '(no topic)') params.set('topic', topic);

      const resp = await fetch(`${BASE_PATH}/thoughts?${params.toString()}`, {
        headers: this._getHeaders(),
      });
      if (resp.ok) {
        const result = await resp.json();
        if (result.success) {
          this._thoughts = result.data?.items || [];
        }
      }
    } catch {
      // Silent fail
    } finally {
      this._loading = false;
    }
  }

  _navigateToArea(area) {
    this._viewLevel = 'area';
    this._selectedArea = area;
    this._selectedTopic = null;
    history.pushState({}, '', `${BASE_PATH}/ui/explore?area=${encodeURIComponent(area)}`);
  }

  _navigateToTopic(topic) {
    this._viewLevel = 'topic';
    this._selectedTopic = topic;
    this._expandedId = null;
    this._loadThoughts(this._selectedArea, topic);
    history.pushState({}, '', `${BASE_PATH}/ui/explore?area=${encodeURIComponent(this._selectedArea)}&topic=${encodeURIComponent(topic)}`);
  }

  _navigateToRoot() {
    this._viewLevel = 'root';
    this._selectedArea = null;
    this._selectedTopic = null;
    this._expandedId = null;
    history.pushState({}, '', `${BASE_PATH}/ui/explore`);
  }

  _navigateBackToArea() {
    this._viewLevel = 'area';
    this._selectedTopic = null;
    this._expandedId = null;
    history.pushState({}, '', `${BASE_PATH}/ui/explore?area=${encodeURIComponent(this._selectedArea)}`);
  }

  _buildTreemapData(level) {
    if (!this._treeData) return null;

    if (level === 'root') {
      const children = [];
      for (const [area, data] of Object.entries(this._treeData.by_life_area)) {
        if (data.count > 0) {
          children.push({ name: area, value: data.count });
        }
      }
      if (this._treeData.unclassified.count > 0) {
        children.push({ name: 'unclassified', value: this._treeData.unclassified.count });
      }
      // Ensure minimum representation for all life areas
      for (const area of this._lifeAreas) {
        if (!children.find(c => c.name === area.name)) {
          children.push({ name: area.name, value: 0.5 }); // placeholder
        }
      }
      return { name: 'brain', children };
    }

    if (level === 'area' && this._selectedArea) {
      const areaData = this._selectedArea === 'unclassified'
        ? this._treeData.unclassified
        : this._treeData.by_life_area[this._selectedArea];
      if (!areaData) return null;

      const children = [];
      for (const [topic, count] of Object.entries(areaData.topics)) {
        children.push({ name: topic, value: count });
      }
      if (children.length === 0) {
        children.push({ name: '(empty)', value: 1 });
      }
      return { name: this._selectedArea, children };
    }

    return null;
  }

  _computeLayout(data, width, height) {
    const root = hierarchy(data).sum(d => d.value || 0).sort((a, b) => b.value - a.value);
    const tm = treemap().size([width, height]).tile(treemapSquarify).padding(4).round(true);
    tm(root);
    return root.leaves();
  }

  async _approveSuggestion(id, lifeArea) {
    try {
      const params = lifeArea ? `?life_area=${lifeArea}` : '';
      await fetch(`${BASE_PATH}/topics/suggestions/${id}/approve${params}`, {
        method: 'POST',
        headers: this._getHeaders(),
      });
      this._suggestions = this._suggestions.filter(s => s.id !== id);
      await this._loadBreakdown();
    } catch {
      // Silent fail
    }
  }

  async _rejectSuggestion(id) {
    try {
      await fetch(`${BASE_PATH}/topics/suggestions/${id}/reject`, {
        method: 'POST',
        headers: this._getHeaders(),
      });
      this._suggestions = this._suggestions.filter(s => s.id !== id);
    } catch {
      // Silent fail
    }
  }

  async _updateThought(id, field, value) {
    try {
      await fetch(`${BASE_PATH}/thoughts/${id}`, {
        method: 'PUT',
        headers: this._getHeaders(),
        body: JSON.stringify({ [field]: value }),
      });
      this._editingField = null;
      // Refresh thoughts
      if (this._selectedArea && this._selectedTopic) {
        await this._loadThoughts(this._selectedArea, this._selectedTopic);
      }
    } catch {
      // Silent fail
    }
  }

  _formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  _renderBreadcrumb() {
    const parts = [
      html`<span class="breadcrumb-link" @click=${this._navigateToRoot}>Explore</span>`,
    ];
    if (this._selectedArea) {
      parts.push(html`<span class="breadcrumb-sep">/</span>`);
      if (this._selectedTopic) {
        parts.push(html`<span class="breadcrumb-link" @click=${this._navigateBackToArea}>${this._selectedArea}</span>`);
        parts.push(html`<span class="breadcrumb-sep">/</span>`);
        parts.push(html`<span>${this._selectedTopic}</span>`);
      } else {
        parts.push(html`<span>${this._selectedArea}</span>`);
      }
    }
    return html`<div class="breadcrumb">${parts}</div>`;
  }

  _renderTreemap(level) {
    const data = this._buildTreemapData(level);
    if (!data || !data.children.length) {
      return html`<div class="empty-state">No data yet. Start capturing thoughts!</div>`;
    }

    // Use viewport-aware dimensions
    const width = Math.min(window.innerWidth - 16, 800);
    const height = Math.min(window.innerHeight - 160, 500);
    const leaves = this._computeLayout(data, width, height);

    const isRoot = level === 'root';
    const colorMap = isRoot ? this._areaColors : {};
    const parentColor = isRoot ? null : (this._areaColors[this._selectedArea] || this._areaColors.unclassified);

    return html`
      <div class="treemap-container" style="height: ${height}px; max-width: ${width}px; margin: 0 auto;">
        ${leaves.map((leaf, i) => {
          const w = leaf.x1 - leaf.x0;
          const h = leaf.y1 - leaf.y0;
          if (w < 4 || h < 4) return '';

          const bgColor = isRoot
            ? (colorMap[leaf.data.name] || '#475569')
            : this._topicColor(parentColor, i, leaves.length);

          const isPlaceholder = leaf.data.value < 1;
          const isSmall = w < 80 || h < 50;

          return html`
            <div class="treemap-cell"
              style="left:${leaf.x0}px; top:${leaf.y0}px; width:${w}px; height:${h}px;
                     background: ${bgColor}; opacity: ${isPlaceholder ? 0.3 : 0.85};"
              @click=${() => isRoot ? this._navigateToArea(leaf.data.name) : this._navigateToTopic(leaf.data.name)}>
              ${!isSmall ? html`
                <span class="cell-count">${isPlaceholder ? '' : Math.round(leaf.data.value)}</span>
              ` : ''}
              <span class="cell-name ${isSmall ? 'cell-name-small' : ''}">${leaf.data.name}</span>
            </div>
          `;
        })}
      </div>
    `;
  }

  _topicColor(parentColor, index, total) {
    // Generate lighter/darker variants of the parent area color
    const lightness = 30 + (index / Math.max(total - 1, 1)) * 30;
    // Parse hex to hsl-ish approach: just vary opacity
    const opacity = 0.5 + (index / Math.max(total - 1, 1)) * 0.4;
    return parentColor ? parentColor + Math.round(opacity * 255).toString(16).padStart(2, '0') : '#475569';
  }

  _renderThoughtList() {
    if (this._loading) return html`<div class="loading">Loading...</div>`;
    if (!this._thoughts.length) {
      return html`<div class="empty-state">No thoughts found for this topic.</div>`;
    }

    return html`
      <div class="thought-list">
        ${this._thoughts.map(t => {
          const isExpanded = this._expandedId === t.id;
          const typeColor = TYPE_COLORS[t.thought_type] || '#94a3b8';

          return html`
            <div class="thought-card" @click=${() => { this._expandedId = isExpanded ? null : t.id; }}>
              <div class="thought-header">
                <span class="type-badge" style="background: ${typeColor}20; color: ${typeColor};">
                  ${t.thought_type}
                </span>
                ${t.topic ? html`<span style="font-size:11px;color:var(--text-muted);">[${t.topic}]</span>` : ''}
                <span class="thought-date">${this._formatDate(t.created_at)}</span>
              </div>
              <div class="thought-text ${isExpanded ? 'expanded' : ''}">
                ${t.text}
              </div>
              ${isExpanded ? html`
                <div class="thought-meta">
                  <span>Type:
                    ${this._editingField === `type-${t.id}` ? html`
                      <select class="edit-select"
                        @change=${(e) => this._updateThought(t.id, 'thought_type', e.target.value)}
                        @blur=${() => { this._editingField = null; }}>
                        ${Object.keys(TYPE_COLORS).map(type => html`
                          <option value=${type} ?selected=${t.thought_type === type}>${type}</option>
                        `)}
                      </select>
                    ` : html`
                      <span class="editable" @click=${(e) => { e.stopPropagation(); this._editingField = `type-${t.id}`; }}>
                        ${t.thought_type}
                      </span>
                    `}
                  </span>
                  <span>Area:
                    ${this._editingField === `area-${t.id}` ? html`
                      <select class="edit-select"
                        @change=${(e) => this._updateThought(t.id, 'life_area', e.target.value)}
                        @blur=${() => { this._editingField = null; }}>
                        ${this._lifeAreas.map(area => html`
                          <option value=${area.name} ?selected=${(t.life_area || t.auto_life_area) === area.name}>${area.name}</option>
                        `)}
                      </select>
                    ` : html`
                      <span class="editable" @click=${(e) => { e.stopPropagation(); this._editingField = `area-${t.id}`; }}>
                        ${t.life_area || t.auto_life_area || 'none'}
                      </span>
                    `}
                  </span>
                  <span>Topic:
                    ${this._editingField === `topic-${t.id}` ? html`
                      <input class="edit-select" type="text"
                        .value=${t.topic || ''}
                        placeholder="Enter topic..."
                        @click=${(e) => e.stopPropagation()}
                        @keydown=${(e) => { if (e.key === 'Enter') this._updateThought(t.id, 'topic', e.target.value); }}
                        @blur=${(e) => { if (e.target.value !== (t.topic || '')) this._updateThought(t.id, 'topic', e.target.value); else this._editingField = null; }}>
                    ` : html`
                      <span class="editable" @click=${(e) => { e.stopPropagation(); this._editingField = `topic-${t.id}`; }}>
                        ${t.topic || '—'}
                      </span>
                    `}
                  </span>
                  ${t.auto_sentiment ? html`<span>Sentiment: ${t.auto_sentiment}</span>` : ''}
                  ${t.source_url ? html`<span>URL: <a href="${t.source_url}" target="_blank" style="color:var(--accent);" @click=${(e) => e.stopPropagation()}>link</a></span>` : ''}
                </div>
                <div class="thought-id">ID: ${t.id}</div>
              ` : ''}
            </div>
          `;
        })}
      </div>
    `;
  }

  _renderTriage() {
    if (!this._suggestions.length) return '';

    return html`
      <div class="triage-toggle" @click=${() => { this._showTriage = !this._showTriage; }}>
        ${this._showTriage ? '▼' : '▶'} Topic Suggestions
        <span class="triage-badge">${this._suggestions.length}</span>
      </div>
      ${this._showTriage ? html`
        <div class="triage-panel">
          ${this._suggestions.map(s => html`
            <div class="suggestion-row">
              <span class="suggestion-name">${s.name}</span>
              <select class="suggestion-area-select" id="area-${s.id}">
                <option value="">auto</option>
                ${this._lifeAreas.map(a => html`<option value=${a.name}>${a.name}</option>`)}
              </select>
              <button class="suggestion-btn btn-approve"
                @click=${() => {
                  const select = this.renderRoot.querySelector(`#area-${s.id}`);
                  this._approveSuggestion(s.id, select?.value || undefined);
                }}>✓</button>
              <button class="suggestion-btn btn-reject"
                @click=${() => this._rejectSuggestion(s.id)}>✗</button>
            </div>
          `)}
        </div>
      ` : ''}
    `;
  }

  _onApiKeyChanged() {
    this._showApiKeyDialog = false;
    this._loadLifeAreas();
    this._loadBreakdown();
    this._loadSuggestions();
  }

  render() {
    return html`
      <api-key-dialog
        .open=${this._showApiKeyDialog}
        .required=${!hasApiKey()}
        @api-key-changed=${this._onApiKeyChanged}
      ></api-key-dialog>
      <div class="header">
        <div class="header-icon">🧠</div>
        <span class="header-title">Explore</span>
        <a href="${BASE_PATH}/ui/brain" class="header-nav-link" title="Capture thoughts">💬</a>
        <a href="${BASE_PATH}/ui/browse" class="header-nav-link" title="Browse thoughts">📚</a>
        <a href="${BASE_PATH}/ui/keys" class="header-nav-link" title="Manage API keys">&#128273;</a>
        <backup-indicator></backup-indicator>
        <div class="header-status">
          <div class="status-dot ${this._online ? '' : 'offline'}"></div>
          ${this._online ? 'Online' : 'Offline'}
        </div>
      </div>

      ${this._renderBreadcrumb()}

      <div class="content">
        ${this._loading && !this._treeData ? html`<div class="loading">Loading...</div>` : ''}

        ${this._viewLevel === 'root' ? this._renderTreemap('root') : ''}
        ${this._viewLevel === 'area' ? this._renderTreemap('area') : ''}
        ${this._viewLevel === 'topic' ? this._renderThoughtList() : ''}
      </div>

      ${this._renderTriage()}
    `;
  }
}

customElements.define('open-brain-explore', OpenBrainExplore);
