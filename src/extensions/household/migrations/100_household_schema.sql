-- Extension: Household Knowledge Base
-- Adapted from OB1's household-knowledge extension for SQLite
-- No user_id (open-brain is single-user)

CREATE TABLE IF NOT EXISTS household_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  location TEXT,
  details TEXT DEFAULT '{}',
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS household_vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  service_type TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  notes TEXT,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  last_used TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_household_items_category ON household_items(category);
CREATE INDEX IF NOT EXISTS idx_household_items_location ON household_items(location);
CREATE INDEX IF NOT EXISTS idx_household_vendors_service ON household_vendors(service_type);
