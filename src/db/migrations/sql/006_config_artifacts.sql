-- Migration 006: Config artifact support
-- Adds artifact_type and purpose columns to taste_preferences
-- for project config portability (capturing/applying Claude Code configs across projects)

ALTER TABLE taste_preferences ADD COLUMN artifact_type TEXT DEFAULT NULL
  CHECK (artifact_type IN ('claude-md', 'mcp-server', 'sub-agent', 'settings', 'hook', 'tool-config'));

ALTER TABLE taste_preferences ADD COLUMN purpose TEXT DEFAULT NULL;

CREATE INDEX idx_taste_pref_artifact ON taste_preferences(artifact_type);
