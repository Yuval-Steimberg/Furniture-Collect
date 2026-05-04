-- ============================================================
--  JAS Route — Place Editor  |  Supabase schema
--  Run this once in your Supabase project's SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS places (
  id         BIGSERIAL    PRIMARY KEY,
  name       TEXT         NOT NULL,
  sub        TEXT         NOT NULL DEFAULT '',
  cat        TEXT         NOT NULL DEFAULT 'anchor',
  lat        FLOAT8       NOT NULL,
  lng        FLOAT8       NOT NULL,
  "desc"     TEXT         NOT NULL DEFAULT '',
  hours      TEXT,
  contact    TEXT,
  address    TEXT         NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_places_updated_at ON places;
CREATE TRIGGER trg_places_updated_at
  BEFORE UPDATE ON places
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- Row-Level Security: allow everything with the anon key
-- (this is an internal admin tool — tighten later if needed)
ALTER TABLE places ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all" ON places;
CREATE POLICY "allow_all" ON places
  FOR ALL USING (true) WITH CHECK (true);

-- After seeding the 15 original places, advance the sequence so new
-- inserts start from id 16 and don't clash.
-- You only need to run this AFTER inserting the seed data:
--   SELECT setval(pg_get_serial_sequence('places', 'id'), (SELECT MAX(id) FROM places));
