// Open Brain — Shared Lit CSS
// Import this in every component: static styles = [sharedStyles, css`/* local */`];

import { css } from 'https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js';

// ─── Design tokens ─────────────────────────────────────────────────────────
// Defined on :host so they cascade into shadow DOM.
export const tokens = css`
  :host {
    /* Typography */
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: #e2e8f0;

    /* Backgrounds */
    --bg-page:   #0f0e1a;
    --bg-header: #1e1b4b;
    --bg-card:   #1e293b;
    --bg-input:  #1a1830;
    --bg-hover:  rgba(255, 255, 255, 0.06);

    /* Borders */
    --border:        #312e81;
    --border-subtle: rgba(129, 140, 248, 0.15);

    /* Accent */
    --accent:       #818cf8;
    --accent-deep:  #6366f1;
    --accent-bg:    rgba(99, 102, 241, 0.12);
    --accent-bg-hover: rgba(99, 102, 241, 0.2);

    /* Text */
    --text-primary:   #f1f5f9;
    --text-secondary: #94a3b8;
    --text-muted:     #64748b;

    /* Status */
    --color-success: #22c55e;
    --color-warning: #f59e0b;
    --color-danger:  #ef4444;

    /* Radii */
    --radius-sm: 6px;
    --radius-md: 8px;
    --radius-lg: 12px;
  }
`;

// ─── Page header ────────────────────────────────────────────────────────────
export const headerStyles = css`
  .header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    padding-top: max(12px, calc(12px + env(safe-area-inset-top, 0px)));
    background: var(--bg-header);
    border-bottom: 1px solid var(--border-subtle);
    flex-shrink: 0;
  }
  .header-icon  { font-size: 22px; }
  .header-title { font-size: 16px; font-weight: 600; color: var(--text-primary); flex: 1; }

  .header-nav-link {
    color: var(--text-secondary);
    text-decoration: none;
    font-size: 18px;
    padding: 4px 8px;
    border-radius: var(--radius-sm);
    opacity: 0.7;
    transition: opacity 0.15s;
  }
  .header-nav-link:hover { opacity: 1; }
`;

// ─── Status dot (online / offline) ──────────────────────────────────────────
export const statusDotStyles = css`
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-success);
    flex-shrink: 0;
  }
  .status-dot.offline { background: var(--color-danger); }

  .header-status {
    font-size: 12px;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 6px;
  }
`;

// ─── Buttons ────────────────────────────────────────────────────────────────
export const buttonStyles = css`
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: var(--radius-sm);
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: opacity 0.15s, background 0.15s;
    white-space: nowrap;
  }
  .btn:disabled { opacity: 0.45; cursor: default; }

  .btn-primary {
    background: var(--accent-deep);
    color: #fff;
  }
  .btn-primary:hover:not(:disabled) { background: #7c3aed; }

  .btn-secondary {
    background: transparent;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }
  .btn-secondary:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }

  .btn-danger {
    background: rgba(239, 68, 68, 0.1);
    color: var(--color-danger);
    border: 1px solid rgba(239, 68, 68, 0.25);
  }
  .btn-danger:hover:not(:disabled) { background: rgba(239, 68, 68, 0.2); }

  .btn-ghost {
    background: transparent;
    color: var(--text-muted);
    border: none;
    padding: 4px 8px;
  }
  .btn-ghost:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-hover); }
`;

// ─── Cards ──────────────────────────────────────────────────────────────────
export const cardStyles = css`
  .card {
    background: var(--bg-card);
    border-radius: var(--radius-md);
    padding: 14px 16px;
    margin-bottom: 10px;
  }
`;

// ─── Form elements ──────────────────────────────────────────────────────────
export const formStyles = css`
  .form-label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }

  .form-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    color: var(--text-primary);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }
  .form-input:focus        { border-color: var(--accent); }
  .form-input::placeholder { color: var(--text-muted); }

  .form-select {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
    color: var(--text-primary);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    cursor: pointer;
  }
  .form-select:focus { border-color: var(--accent); }
`;

// ─── Loading / empty / error states ─────────────────────────────────────────
export const stateStyles = css`
  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 48px 16px;
    color: var(--text-muted);
    font-size: 14px;
    gap: 8px;
  }
  .loading::before {
    content: '';
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 16px;
    color: var(--text-muted);
    font-size: 14px;
    text-align: center;
    gap: 8px;
  }
  .empty-state .empty-icon { font-size: 40px; opacity: 0.4; }

  .error-msg {
    background: rgba(239, 68, 68, 0.08);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: var(--radius-sm);
    padding: 10px 12px;
    color: #fca5a5;
    font-size: 13px;
    margin-bottom: 12px;
  }
`;

// ─── Convenience bundle ──────────────────────────────────────────────────────
// Most components can just import this one export.
export const sharedStyles = [tokens, headerStyles, statusDotStyles, buttonStyles, cardStyles, formStyles, stateStyles];
