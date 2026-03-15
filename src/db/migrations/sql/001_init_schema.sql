-- Migration: Initial Open Brain schema
-- Creates the thoughts table for capturing and searching thoughts

CREATE TABLE IF NOT EXISTS thoughts (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  thought_type TEXT DEFAULT 'note',
  topic TEXT,
  source_channel TEXT DEFAULT 'api',
  auto_type TEXT,
  auto_topics TEXT,                      -- JSON array
  confidence REAL,
  embedding BLOB,                        -- float32 vector (dimension depends on model)
  embedding_model TEXT DEFAULT 'mxbai-embed-large',
  _vss_rowid INTEGER,                    -- stable rowid for VSS
  status TEXT DEFAULT 'active',
  metadata TEXT,                         -- JSON
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_thoughts_thought_type ON thoughts(thought_type);
CREATE INDEX IF NOT EXISTS idx_thoughts_source_channel ON thoughts(source_channel);
CREATE INDEX IF NOT EXISTS idx_thoughts_status ON thoughts(status);
CREATE INDEX IF NOT EXISTS idx_thoughts_created_at ON thoughts(created_at);
CREATE INDEX IF NOT EXISTS idx_thoughts_topic ON thoughts(topic);
CREATE UNIQUE INDEX IF NOT EXISTS idx_thoughts_vss_rowid ON thoughts(_vss_rowid);

-- Auto-assign _vss_rowid on INSERT when not explicitly provided
CREATE TRIGGER IF NOT EXISTS thoughts_assign_vss_rowid
AFTER INSERT ON thoughts
WHEN NEW._vss_rowid IS NULL
BEGIN
  UPDATE thoughts SET _vss_rowid = (
    SELECT COALESCE(MAX(_vss_rowid), 0) + 1 FROM thoughts
  ) WHERE id = NEW.id;
END;

-- Auto-update updated_at on UPDATE
CREATE TRIGGER IF NOT EXISTS thoughts_update_timestamp
AFTER UPDATE ON thoughts
BEGIN
  UPDATE thoughts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
