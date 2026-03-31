// Open Brain - Shared Auth Utilities
// Centralizes API key storage and header construction for all UI components

const STORAGE_KEY = 'open-brain-api-key';

// Auto-consume ?key= param from URL (magic link onboarding)
(function consumeKeyParam() {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('key');
  if (key) {
    localStorage.setItem(STORAGE_KEY, key);
    params.delete('key');
    const clean = params.toString();
    const url = window.location.pathname + (clean ? '?' + clean : '') + window.location.hash;
    window.history.replaceState({}, '', url);
  }
})();

export function getApiKey() {
  return localStorage.getItem(STORAGE_KEY) || '';
}

export function setApiKey(key) {
  if (key) {
    localStorage.setItem(STORAGE_KEY, key);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function clearApiKey() {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasApiKey() {
  return !!localStorage.getItem(STORAGE_KEY);
}

export function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const key = getApiKey();
  if (key) {
    headers['Authorization'] = `Bearer ${key}`;
  }
  return headers;
}
