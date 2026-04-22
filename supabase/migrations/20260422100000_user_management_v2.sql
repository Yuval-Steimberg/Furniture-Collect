-- =========================================================================
-- User Management 2.0
--   - profiles.title         free-text job title shown on the user card
--                            (e.g. "Ops Lead", "Field Team Alpha", "שותף")
--   - profiles.is_active     soft-suspend without deleting. Suspended users
--                            can't log in via the app (client-side check)
--                            and are filtered from assignment lists.
--   - profiles.last_active_at tracked on login + app use, shown on user card
--                            so admins see who's actively working.
-- =========================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS title            TEXT,
  ADD COLUMN IF NOT EXISTS is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS last_active_at   TIMESTAMPTZ;

-- Index to filter active-only users fast (used by project-assignment picker)
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles (is_active) WHERE is_active = FALSE;
