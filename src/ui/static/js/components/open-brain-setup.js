import { LitElement, html, css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

const BASE_PATH = window.__BASE_PATH || '';

class OpenBrainSetup extends LitElement {
  static properties = {
    _apiKey: { type: String, state: true },
    _authString: { type: String, state: true },
    _copied: { type: String, state: true },
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
    .header-title { font-size: 16px; font-weight: 600; flex: 1; }
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

    .content {
      flex: 1;
      overflow-y: auto;
      padding: 20px 16px;
      max-width: 640px;
      margin: 0 auto;
      width: 100%;
      box-sizing: border-box;
    }

    h2 {
      font-size: 20px;
      margin-bottom: 8px;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 14px;
      margin-bottom: 20px;
    }

    .key-section {
      background: var(--card-bg);
      border-radius: 8px;
      padding: 14px;
      margin-bottom: 20px;
    }
    .key-section label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: block;
      margin-bottom: 6px;
    }
    .key-input {
      width: 100%;
      box-sizing: border-box;
      background: rgba(255,255,255,0.05);
      border: 1px solid #312e81;
      border-radius: 6px;
      padding: 8px 12px;
      color: var(--text-primary);
      font-size: 13px;
      font-family: monospace;
      outline: none;
    }
    .key-input:focus { border-color: var(--accent); }

    .section {
      margin-bottom: 24px;
    }
    .section h3 {
      font-size: 15px;
      margin-bottom: 8px;
      color: var(--text-primary);
    }
    .section p {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.5;
      margin-bottom: 8px;
    }

    .code-block {
      background: #0f172a;
      border-radius: 6px;
      padding: 12px;
      font-family: monospace;
      font-size: 12px;
      line-height: 1.6;
      color: #a5b4fc;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      position: relative;
    }

    .copy-btn {
      position: absolute;
      top: 6px;
      right: 6px;
      background: rgba(255,255,255,0.1);
      border: none;
      color: var(--text-muted);
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      cursor: pointer;
    }
    .copy-btn:hover { color: var(--text-primary); background: rgba(255,255,255,0.15); }
    .copy-btn.copied { color: #22c55e; }

    .links {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
    }
    .link-card {
      flex: 1;
      background: var(--card-bg);
      border-radius: 8px;
      padding: 12px;
      text-align: center;
      text-decoration: none;
      color: var(--text-secondary);
      font-size: 13px;
      transition: background 0.15s;
    }
    .link-card:hover { background: #253349; color: var(--text-primary); }
    .link-card .icon { font-size: 24px; margin-bottom: 4px; }
  `;

  constructor() {
    super();
    this._apiKey = localStorage.getItem('open-brain-api-key') || '';
    this._authString = '';
    this._copied = '';
    this._updateAuth();
  }

  _updateAuth() {
    if (this._apiKey) {
      this._authString = btoa(`brain:${this._apiKey}`);
    } else {
      this._authString = '';
    }
  }

  _onKeyInput(e) {
    this._apiKey = e.target.value;
    this._updateAuth();
  }

  _getPublicUrl() {
    return window.location.origin;
  }

  async _copy(id, text) {
    try {
      await navigator.clipboard.writeText(text);
      this._copied = id;
      setTimeout(() => { this._copied = ''; }, 2000);
    } catch { /* ignore */ }
  }

  render() {
    const url = this._getPublicUrl();
    const mcpUrl = `${url}/mcp`;
    const hasKey = !!this._apiKey;

    return html`
      <div class="header">
        <div class="header-icon">&#129504;</div>
        <span class="header-title">Setup</span>
        <a href="${BASE_PATH}/ui/brain" class="header-nav-link" title="Chat">&#128172;</a>
        <a href="${BASE_PATH}/ui/browse" class="header-nav-link" title="Browse">&#128218;</a>
      </div>

      <div class="content">
        <h2>Connect Your Brain</h2>
        <p class="subtitle">Add Open Brain to your AI tools so they can capture thoughts, search your brain, and use your preferences.</p>

        <div class="links">
          <a href="${BASE_PATH}/ui/brain" class="link-card">
            <div class="icon">&#128172;</div>
            Chat
          </a>
          <a href="${BASE_PATH}/ui/browse" class="link-card">
            <div class="icon">&#128218;</div>
            Browse
          </a>
        </div>

        <div class="key-section">
          <label>Your API Key</label>
          <input class="key-input" type="text" placeholder="Enter your API key..."
            .value=${this._apiKey} @input=${this._onKeyInput} />
        </div>

        ${!hasKey ? html`<p class="subtitle">Enter your API key above to see personalized setup instructions.</p>` : html`

        <div class="section">
          <h3>Claude Code (CLI)</h3>
          <div class="code-block">
            <button class="copy-btn ${this._copied === 'cc' ? 'copied' : ''}"
              @click=${() => this._copy('cc', `claude mcp add ob ${mcpUrl} --transport http --scope user --header "Authorization: Basic ${this._authString}"`)}>
              ${this._copied === 'cc' ? 'Copied' : 'Copy'}
            </button>claude mcp add ob ${mcpUrl} \\
  --transport http --scope user \\
  --header "Authorization: Basic ${this._authString}"</div>
        </div>

        <div class="section">
          <h3>Claude Desktop / Cursor / Windsurf</h3>
          <p>Add to your MCP config file:</p>
          <div class="code-block">
            <button class="copy-btn ${this._copied === 'mcp' ? 'copied' : ''}"
              @click=${() => this._copy('mcp', JSON.stringify({ ob: { transport: "http", url: mcpUrl, headers: { Authorization: `Basic ${this._authString}` }}}, null, 2))}>
              ${this._copied === 'mcp' ? 'Copied' : 'Copy'}
            </button>${JSON.stringify({
              ob: {
                transport: "http",
                url: mcpUrl,
                headers: {
                  Authorization: `Basic ${this._authString}`
                }
              }
            }, null, 2)}</div>
        </div>

        <div class="section">
          <h3>VS Code (GitHub Copilot)</h3>
          <p>Add to VS Code settings:</p>
          <div class="code-block">
            <button class="copy-btn ${this._copied === 'vsc' ? 'copied' : ''}"
              @click=${() => this._copy('vsc', JSON.stringify({ "github.copilot.chat.mcp.servers": { ob: { type: "http", url: mcpUrl, headers: { Authorization: `Basic ${this._authString}` }}}}, null, 2))}>
              ${this._copied === 'vsc' ? 'Copied' : 'Copy'}
            </button>${JSON.stringify({
              "github.copilot.chat.mcp.servers": {
                ob: {
                  type: "http",
                  url: mcpUrl,
                  headers: {
                    Authorization: `Basic ${this._authString}`
                  }
                }
              }
            }, null, 2)}</div>
        </div>

        <div class="section">
          <h3>ChatGPT (Custom GPT)</h3>
          <p>Create a Custom GPT with Actions:</p>
          <p>1. Go to chatgpt.com/gpts/editor</p>
          <p>2. Add Action → paste the OpenAPI spec from the repo (docs/openapi-chatgpt.yaml)</p>
          <p>3. Authentication: API Key, type Bearer</p>
          <div class="code-block">
            <button class="copy-btn ${this._copied === 'gpt' ? 'copied' : ''}"
              @click=${() => this._copy('gpt', this._apiKey)}>
              ${this._copied === 'gpt' ? 'Copied' : 'Copy'}
            </button>Bearer Token: ${this._apiKey}</div>
        </div>

        `}
      </div>
    `;
  }
}

customElements.define('open-brain-setup', OpenBrainSetup);
