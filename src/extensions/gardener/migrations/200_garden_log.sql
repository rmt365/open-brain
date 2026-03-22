-- Migration: Garden actions log
-- Tracks automated gardening operations (dedup, consolidation, auto-approve, etc.)

CREATE TABLE IF NOT EXISTS garden_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('dedup_merge','consolidate','auto_approve',
      'auto_assign_topic','auto_assign_life_area','retroactive_tag')),
  details TEXT NOT NULL,
  affected_ids TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_garden_actions_run ON garden_actions(run_id);
