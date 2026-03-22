-- Migration 007: User-configurable life areas
-- Replaces hardcoded life area enum with database-driven table

CREATE TABLE IF NOT EXISTS life_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_life_areas_active ON life_areas(active);

-- Seed with current 9 life areas
INSERT OR IGNORE INTO life_areas (name, label, description, color, sort_order) VALUES
  ('craft', 'Craft', 'Professional skill and discipline — the actual work you do', '#818cf8', 0),
  ('business', 'Business', 'Revenue, clients, operations, pricing, invoicing', '#60a5fa', 1),
  ('systems', 'Systems', 'Tools, infrastructure, processes, automation, dev environment', '#22c55e', 2),
  ('health', 'Health', 'Physical health, mental health, energy, fitness', '#f59e0b', 3),
  ('marriage', 'Marriage', 'Spouse/partner relationship', '#ec4899', 4),
  ('relationships', 'Relationships', 'Friends, family, networking, birthdays, contact info', '#a855f7', 5),
  ('creative', 'Creative', 'Making things, side projects, hands-on play, tinkering', '#06b6d4', 6),
  ('wild', 'Wild', 'Speculative ideas, what-ifs, untethered brainstorms, moonshots', '#ef4444', 7),
  ('meta', 'Meta', 'Thinking about thinking, self-improvement, productivity, habits', '#94a3b8', 8);
