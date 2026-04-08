-- Migration 010: Thought supersession
-- Supports the append+supersede update model: facts are never overwritten,
-- only superseded by a newer version. Superseded thoughts are excluded from
-- default queries but remain retrievable for history.

-- Add superseded status to the status enum (SQLite has no enums; this is a convention)
-- Valid statuses: active, archived, deleted, superseded

ALTER TABLE thoughts ADD COLUMN superseded_by TEXT REFERENCES thoughts(id);

CREATE INDEX IF NOT EXISTS idx_thoughts_superseded_by ON thoughts(superseded_by);
