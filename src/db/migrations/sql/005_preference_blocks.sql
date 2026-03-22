-- Migration: Add markdown block format to preferences
-- Allows preferences to store freeform markdown content (architecture docs, skill definitions)
-- in addition to the existing reject/want rule pairs.

ALTER TABLE taste_preferences ADD COLUMN format TEXT NOT NULL DEFAULT 'rule'
  CHECK (format IN ('rule', 'block'));
ALTER TABLE taste_preferences ADD COLUMN content TEXT;
