-- Add equal-split support to sessions
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS split_mode text NOT NULL DEFAULT 'items'
    CHECK (split_mode IN ('items', 'equal'));

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS split_total integer DEFAULT NULL;

-- Number of people to split among (including host) — used for equal-split mode
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS split_n integer DEFAULT NULL;
