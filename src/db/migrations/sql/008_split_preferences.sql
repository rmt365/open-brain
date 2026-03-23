-- Migration 008: Split taste_preferences into preferences (rules) and config_artifacts (blocks)
-- Separates two conceptually different record types into their own tables.

-- Step 1: Create config_artifacts table
CREATE TABLE IF NOT EXISTS config_artifacts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT 'general',
  content TEXT NOT NULL,
  artifact_type TEXT NOT NULL CHECK (artifact_type IN ('claude-md', 'mcp-server', 'sub-agent', 'settings', 'hook', 'tool-config')),
  purpose TEXT DEFAULT NULL,
  constraint_type TEXT NOT NULL DEFAULT 'domain rule'
    CHECK (constraint_type IN ('domain rule', 'quality standard', 'business logic', 'formatting')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_config_artifact_domain ON config_artifacts(domain);
CREATE INDEX IF NOT EXISTS idx_config_artifact_type ON config_artifacts(artifact_type);

CREATE TRIGGER IF NOT EXISTS config_artifacts_update_timestamp
AFTER UPDATE ON config_artifacts
BEGIN
  UPDATE config_artifacts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Step 2: Migrate block rows from taste_preferences to config_artifacts
INSERT INTO config_artifacts (id, name, domain, content, artifact_type, purpose, constraint_type, created_at, updated_at)
SELECT
  id,
  preference_name,
  domain,
  COALESCE(content, ''),
  COALESCE(artifact_type, 'settings'),
  purpose,
  constraint_type,
  created_at,
  updated_at
FROM taste_preferences
WHERE format = 'block';

-- Step 3: Delete migrated rows
DELETE FROM taste_preferences WHERE format = 'block';

-- Step 4: Drop indexes and triggers BEFORE renaming/dropping columns
DROP INDEX IF EXISTS idx_taste_pref_domain;
DROP INDEX IF EXISTS idx_taste_pref_type;
DROP INDEX IF EXISTS idx_taste_pref_artifact;
DROP TRIGGER IF EXISTS taste_preferences_update_timestamp;
DROP TRIGGER IF EXISTS set_taste_preferences_updated_at;

-- Step 5: Rename taste_preferences to preferences
ALTER TABLE taste_preferences RENAME TO preferences;

-- Step 6: Drop unused columns from preferences
-- SQLite 3.35+ supports ALTER TABLE DROP COLUMN
ALTER TABLE preferences DROP COLUMN format;
ALTER TABLE preferences DROP COLUMN content;
ALTER TABLE preferences DROP COLUMN artifact_type;
ALTER TABLE preferences DROP COLUMN purpose;

-- Step 7: Re-create indexes and triggers for the renamed table
CREATE INDEX IF NOT EXISTS idx_pref_domain ON preferences(domain);
CREATE INDEX IF NOT EXISTS idx_pref_type ON preferences(constraint_type);

CREATE TRIGGER IF NOT EXISTS preferences_update_timestamp
AFTER UPDATE ON preferences
BEGIN
  UPDATE preferences SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
