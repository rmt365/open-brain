-- Migration 009: API key management
-- Supports multiple API keys with scopes, enable/disable, and usage tracking
-- The master key (OPEN_BRAIN_API_KEY env var) always works; these are additional managed keys

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT 'read',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_used_at DATETIME DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_enabled ON api_keys(enabled);

CREATE TRIGGER IF NOT EXISTS api_keys_update_timestamp
AFTER UPDATE ON api_keys
BEGIN
  UPDATE api_keys SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
