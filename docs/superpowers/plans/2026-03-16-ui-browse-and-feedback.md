# UI Browse View & Capture Feedback — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add richer capture feedback for URL thoughts in the chat, and a new `/ui/browse` page for reviewing, searching, and correcting thoughts.

**Architecture:** Feature 1 modifies `_buildAck()` in the existing chat component. Feature 2 adds a new `<open-brain-browse>` Lit web component served at `/ui/browse`. Both views get nav links to each other. No backend changes — all APIs already exist.

**Tech Stack:** Lit web components (CDN), Hono (UI routes), vanilla JS

**Spec:** `docs/superpowers/specs/2026-03-16-ui-browse-and-feedback-design.md`

---

## Chunk 1: Capture Feedback

### Task 1: Improve `_buildAck()` for URL thoughts

**Files:**
- Modify: `src/ui/static/js/components/open-brain-chat.js:910-938`

- [ ] **Step 1: Replace `_buildAck()` method**

In `src/ui/static/js/components/open-brain-chat.js`, replace lines 910-938 (the `_buildAck` method) with:

```javascript
  _buildAck(data) {
    let text = 'Got it';
    const sourceUrl = data.source_url;
    const isUrlIngested = sourceUrl && data.thought_type === 'reference' && data.metadata?.title;
    const isUrlMentioned = sourceUrl && !isUrlIngested;

    if (isUrlIngested) {
      // URL-only: smart replace happened, content was fetched
      const domain = this._extractDomain(sourceUrl);
      text = `Fetched: ${data.metadata.title} from ${domain} — saved as reference, indexed for search`;
    } else if (isUrlMentioned) {
      // URL-mentioned or URL-only with failed fetch
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
      // Normal thought — no URL
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
```

- [ ] **Step 2: Add nav link to browse in header**

In the same file, find the header section in `render()` (around line 1361). Add a browse link before the status dot. Replace:

```javascript
        <div class="header-right">
          <div class="header-status">
```

With:

```javascript
        <div class="header-right">
          <a href="${BASE_PATH}/ui/browse" class="header-nav-link" title="Browse thoughts">&#128218;</a>
          <div class="header-status">
```

- [ ] **Step 3: Add CSS for the nav link**

Add to the `static styles` block (after the existing `.header-right` styles):

```css
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
```

- [ ] **Step 4: Manual test**

Rebuild the dev instance:
```bash
docker compose up -d --build
```

Test at `http://localhost:4012/ui/brain`:
1. Send a bare URL (e.g., `https://deno.com/blog`) — should see "Fetched: Blog | Deno from deno.com — saved as reference, indexed for search"
2. Send a thought with URL (e.g., "I was reading https://deno.com/blog and it was interesting") — should see "Got it — tagged as ... Also fetching https://deno.com/blog in the background."
3. Send a normal thought — should see "Got it — tagged as ..."
4. Verify browse link icon appears in header

- [ ] **Step 5: Commit**

```bash
git add src/ui/static/js/components/open-brain-chat.js
git commit -m "feat: richer capture feedback for URL thoughts in chat UI"
```

---

## Chunk 2: Browse View Component

### Task 2: Create `<open-brain-browse>` component

**Files:**
- Create: `src/ui/static/js/components/open-brain-browse.js`

- [ ] **Step 1: Create the browse component**

Create `src/ui/static/js/components/open-brain-browse.js` with the full component:

```javascript
import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

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
const LIFE_AREAS = ['craft', 'business', 'systems', 'health', 'marriage', 'relationships', 'creative', 'wild', 'meta'];

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
  }

  connectedCallback() {
    super.connectedCallback();
    this._loadThoughts();
  }

  _getApiKey() {
    return localStorage.getItem('open-brain-api-key') || '';
  }

  _getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const apiKey = this._getApiKey();
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    return headers;
  }

  async _loadThoughts(append = false) {
    this._loading = true;
    try {
      const params = new URLSearchParams();
      params.set('limit', '50');
      params.set('offset', String(this._offset));
      if (this._activeFilter) params.set('type', this._activeFilter);

      const res = await fetch(`${BASE_PATH}/thoughts?${params}`, { headers: this._getHeaders() });
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
        this._thoughts = json.data.map(r => r.thought || r);
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

  _getTypeColor(type) {
    return TYPE_COLORS[type] || '#94a3b8';
  }

  _getTypeLabel(type) {
    return TYPE_LABELS[type] || type;
  }

  render() {
    return html`
      <div class="header">
        <div class="header-icon">&#129504;</div>
        <span class="header-title">Open Brain</span>
        <a href="${BASE_PATH}/ui/brain" class="header-nav-link" title="Capture thoughts">&#128172;</a>
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
    `;
  }

  _renderRow(t) {
    const topics = (t.auto_topics || []).join(', ');
    const domain = t.source_url ? this._extractDomain(t.source_url) : '';
    const meta = [topics, domain].filter(Boolean).join(' · ');
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
                  ${LIFE_AREAS.map(area => html`
                    <option value=${area} ?selected=${(t.life_area || t.auto_life_area) === area}>${area}</option>
                  `)}
                </select>
              ` : html`
                <span class="value editable"
                  @click=${(e) => { e.stopPropagation(); this._editingField = `area-${t.id}`; }}
                >${t.life_area || t.auto_life_area || '—'}</span>
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
        </div>
      </div>
    `;
  }
}

customElements.define('open-brain-browse', OpenBrainBrowse);
```

- [ ] **Step 2: Commit the new component**

```bash
git add src/ui/static/js/components/open-brain-browse.js
git commit -m "feat: add open-brain-browse Lit component"
```

---

### Task 3: Add `/ui/browse` route

**Files:**
- Modify: `src/ui/routes.ts:8-41`

- [ ] **Step 1: Add the browse route**

In `src/ui/routes.ts`, add a new route after the existing `/brain` route (after line 41). Insert before the `// GET /ui/manifest.json` comment:

```typescript
  // GET /ui/browse -- renders thought browser page
  router.get("/browse", (c: Context) => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#1e1b4b">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>Open Brain — Browse</title>
  <link rel="manifest" href="${basePath}/ui/manifest.json">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0f0e1a; height: 100dvh; overflow: hidden; }
  </style>
</head>
<body>
  <open-brain-browse></open-brain-browse>
  <script>window.__BASE_PATH = '${basePath}';</script>
  <script type="module" src="${basePath}/ui/static/js/components/open-brain-browse.js"></script>
</body>
</html>`;
    return c.html(html);
  });
```

- [ ] **Step 2: Verify type checking**

Run: `deno check src/main.ts`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/routes.ts
git commit -m "feat: add /ui/browse route"
```

---

## Chunk 3: Verification

### Task 4: Full verification and manual test

- [ ] **Step 1: Run verify**

```bash
deno task verify
```

Expected: Type check, lint, 56 tests all pass (no backend changes, so tests unchanged)

- [ ] **Step 2: Rebuild dev instance**

```bash
docker compose up -d --build
```

- [ ] **Step 3: Test capture feedback**

At `http://localhost:4012/ui/brain`:
1. Send `https://deno.com/blog` — expect "Fetched: Blog | Deno from deno.com — saved as reference, indexed for search"
2. Send `I was reading https://deno.com/blog and found it interesting` — expect "Got it — tagged as ... Also fetching ... in the background."
3. Send `Just thinking about lunch` — expect normal "Got it — tagged as ..."

- [ ] **Step 4: Test browse view**

At `http://localhost:4012/ui/browse`:
1. Verify thoughts load in compact feed
2. Click a type filter chip — verify list filters
3. Type in search box — verify semantic search works
4. Click a row — verify it expands with full details
5. Click type value in expanded view — verify dropdown appears
6. Select a different type — verify it updates (check the row after collapsing)
7. Click life area — verify dropdown and update
8. Click "Load more" if >50 thoughts
9. Verify nav links work between chat and browse

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address verification issues for browse UI"
```
