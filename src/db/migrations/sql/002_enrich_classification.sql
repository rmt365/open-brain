-- Migration: Enrich classification metadata + taste preferences
-- Adds OB1-style metadata fields and taste preferences registry

-- Part A: Richer classification metadata on thoughts
ALTER TABLE thoughts ADD COLUMN auto_people TEXT;              -- JSON array of mentioned people
ALTER TABLE thoughts ADD COLUMN auto_action_items TEXT;         -- JSON array of extracted action items
ALTER TABLE thoughts ADD COLUMN auto_dates_mentioned TEXT;      -- JSON array of date references
ALTER TABLE thoughts ADD COLUMN auto_sentiment TEXT;            -- positive|negative|neutral|mixed

-- Part B: Clear old embeddings (dimension change: 384 → 1024)
UPDATE thoughts SET embedding = NULL, embedding_model = NULL WHERE embedding IS NOT NULL;

-- Part C: Taste preferences registry
CREATE TABLE IF NOT EXISTS taste_preferences (
  id TEXT PRIMARY KEY,
  preference_name TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT 'general',
  reject TEXT NOT NULL,
  want TEXT NOT NULL,
  constraint_type TEXT NOT NULL DEFAULT 'quality standard'
    CHECK (constraint_type IN ('domain rule', 'quality standard', 'business logic', 'formatting')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_taste_pref_domain ON taste_preferences(domain);
CREATE INDEX IF NOT EXISTS idx_taste_pref_type ON taste_preferences(constraint_type);

CREATE TRIGGER IF NOT EXISTS taste_preferences_update_timestamp
AFTER UPDATE ON taste_preferences
BEGIN
  UPDATE taste_preferences SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
