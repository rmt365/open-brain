-- Migration: Remove CHECK constraint from garden_actions to support new action types
-- SQLite cannot ALTER a CHECK constraint, so we recreate the table without it.
-- Action type validation is enforced in TypeScript (GardenAction.type union).
CREATE TABLE IF NOT EXISTS garden_actions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  details TEXT NOT NULL,
  affected_ids TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO garden_actions_new SELECT * FROM garden_actions;
DROP TABLE garden_actions;
ALTER TABLE garden_actions_new RENAME TO garden_actions;
CREATE INDEX IF NOT EXISTS idx_garden_actions_run ON garden_actions(run_id);
