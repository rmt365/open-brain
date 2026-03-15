-- Migration: Taxonomy system (life areas + managed topics)
-- Adds life_area classification to thoughts and a managed topic registry
-- with LLM-suggest/user-approve workflow for new topics.

-- Part A: Life area columns on thoughts
ALTER TABLE thoughts ADD COLUMN life_area TEXT;           -- user-provided
ALTER TABLE thoughts ADD COLUMN auto_life_area TEXT;      -- AI-assigned

CREATE INDEX IF NOT EXISTS idx_thoughts_life_area ON thoughts(life_area);
CREATE INDEX IF NOT EXISTS idx_thoughts_auto_life_area ON thoughts(auto_life_area);

-- Part B: Managed topics registry
CREATE TABLE IF NOT EXISTS managed_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  life_area TEXT,                                          -- optional default area association
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_managed_topics_life_area ON managed_topics(life_area);
CREATE INDEX IF NOT EXISTS idx_managed_topics_active ON managed_topics(active);

-- Part C: Suggested topics (LLM proposes, user approves/rejects)
CREATE TABLE IF NOT EXISTS suggested_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  suggested_from_thought_id TEXT REFERENCES thoughts(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_suggested_topics_status ON suggested_topics(status);

-- Part D: Seed starter topics
INSERT INTO managed_topics (name, life_area) VALUES
  -- craft (professional skill/discipline)
  ('software-architecture', 'craft'),
  ('ai-tooling', 'craft'),
  ('coding', 'craft'),
  -- business (revenue, clients, ops, pricing)
  ('pricing', 'business'),
  ('client-work', 'business'),
  ('invoicing', 'business'),
  -- systems (tools, infrastructure, processes)
  ('docker', 'systems'),
  ('automation', 'systems'),
  ('dev-environment', 'systems'),
  -- health
  ('fitness', 'health'),
  ('energy', 'health'),
  -- marriage
  ('date-ideas', 'marriage'),
  -- relationships
  ('birthdays', 'relationships'),
  ('networking', 'relationships'),
  -- creative (making things, side projects)
  ('side-projects', 'creative'),
  ('writing', 'creative'),
  -- wild (speculative, what-ifs)
  ('moonshots', 'wild'),
  -- meta (thinking about thinking)
  ('productivity', 'meta'),
  ('habits', 'meta');
