-- Migration: URL ingestion (thought chunks) and forgotten thought surfacing
-- Adds chunk storage for long-form content and tracking for surfacing old thoughts.

-- Part A: Thought chunks table for URL-ingested content
CREATE TABLE IF NOT EXISTS thought_chunks (
  id TEXT PRIMARY KEY,
  thought_id TEXT NOT NULL REFERENCES thoughts(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  start_offset INTEGER NOT NULL,
  end_offset INTEGER NOT NULL,
  embedding BLOB,
  embedding_model TEXT,
  _vss_rowid INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(thought_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_chunks_thought_id ON thought_chunks(thought_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_vss_rowid ON thought_chunks(_vss_rowid);

-- Auto-assign _vss_rowid on INSERT
CREATE TRIGGER IF NOT EXISTS chunks_assign_vss_rowid
AFTER INSERT ON thought_chunks
WHEN NEW._vss_rowid IS NULL
BEGIN
  UPDATE thought_chunks SET _vss_rowid = (
    SELECT COALESCE(MAX(_vss_rowid), 0) + 1 FROM thought_chunks
  ) WHERE id = NEW.id;
END;

-- Part B: Source URL tracking on thoughts
ALTER TABLE thoughts ADD COLUMN source_url TEXT;

CREATE INDEX IF NOT EXISTS idx_thoughts_source_url ON thoughts(source_url);

-- Part C: Surfacing forgotten thoughts
ALTER TABLE thoughts ADD COLUMN last_surfaced DATETIME;
