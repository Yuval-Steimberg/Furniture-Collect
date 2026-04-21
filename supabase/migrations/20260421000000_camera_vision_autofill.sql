-- =========================================================================
-- Camera + vision autofill — schema + storage additions
-- Adds AI-origin metadata to items and sets up the item-photos bucket.
-- Works alongside the existing voice/text parsing pipeline.
-- =========================================================================

-- ---- 1. Schema additions on items ---------------------------------------

-- Condition grading, inferred by vision or set manually in the edit dialog.
-- scrap_only = beyond repair; goes to recycling not reuse.
DO $$ BEGIN
  CREATE TYPE public.item_condition AS ENUM ('as_new', 'good', 'needs_repair', 'scrap_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Source of truth for how an item was created. Useful for analytics +
-- confidence filtering ("show me all low-confidence AI items to review").
DO $$ BEGIN
  CREATE TYPE public.item_source AS ENUM ('voice', 'text', 'image', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS condition     public.item_condition,
  ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC(3, 2) CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  ADD COLUMN IF NOT EXISTS source        public.item_source NOT NULL DEFAULT 'manual';

-- Partial index for the "review low-confidence AI items" view.
CREATE INDEX IF NOT EXISTS idx_items_ai_low_confidence
  ON public.items (apartment_id)
  WHERE ai_confidence IS NOT NULL AND ai_confidence < 0.6;

-- ---- 2. Storage bucket for item photos ----------------------------------

-- Public=true chosen for v1 simplicity (furniture photos are low-sensitivity
-- and signed-URL rotation on every render is expensive). If photos ever
-- include room context that's sensitive (identifiable, personal effects in
-- view), flip `public` to false and switch client to createSignedUrl().
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'item-photos',
  'item-photos',
  true,
  10 * 1024 * 1024, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ---- 3. Storage RLS policies --------------------------------------------
-- Path convention: item-photos/{project_id}/{apartment_id}/{uuid}.jpg
-- (string_to_array(name, '/'))[1] extracts project_id for the scope check.

-- Wipe any earlier-migration versions of these policies (idempotent re-run).
DROP POLICY IF EXISTS "item-photos: project members can read"   ON storage.objects;
DROP POLICY IF EXISTS "item-photos: project members can upload" ON storage.objects;
DROP POLICY IF EXISTS "item-photos: project managers can delete" ON storage.objects;

CREATE POLICY "item-photos: project members can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'item-photos'
    AND EXISTS (
      SELECT 1 FROM public.user_projects up
      WHERE up.user_id = auth.uid()
        AND up.project_id::text = (string_to_array(name, '/'))[1]
    )
  );

CREATE POLICY "item-photos: project members can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'item-photos'
    AND EXISTS (
      SELECT 1 FROM public.user_projects up
      WHERE up.user_id = auth.uid()
        AND up.project_id::text = (string_to_array(name, '/'))[1]
    )
  );

CREATE POLICY "item-photos: project managers can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'item-photos'
    AND EXISTS (
      SELECT 1 FROM public.user_projects up
      WHERE up.user_id = auth.uid()
        AND up.project_id::text = (string_to_array(name, '/'))[1]
        AND up.project_role = 'PROJECT_MANAGER'
    )
  );

-- Also allow ORG_ADMIN to delete across all projects.
DROP POLICY IF EXISTS "item-photos: org admins can delete" ON storage.objects;
CREATE POLICY "item-photos: org admins can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'item-photos'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.org_role = 'ORG_ADMIN'
    )
  );

-- ---- 4. Optional: processed-recordings dedupe table ---------------------
-- Used by the offline-voice-capture feature (spec in docs/specs/). Creating
-- it now so both features can share the idempotency pattern.
CREATE TABLE IF NOT EXISTS public.processed_recordings (
  id                    UUID PRIMARY KEY,            -- client-generated recording uuid
  user_id               UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  apartment_id          UUID NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
  kind                  TEXT NOT NULL CHECK (kind IN ('voice', 'image')),
  transcription         TEXT,
  parsed_items_count    INTEGER,
  processing_time_ms    INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.processed_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own processed recordings"
  ON public.processed_recordings FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own processed recordings"
  ON public.processed_recordings FOR INSERT
  WITH CHECK (user_id = auth.uid());
