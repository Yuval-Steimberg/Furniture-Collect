-- Idempotent safety migration: ensures all item columns added in recent
-- feature migrations exist in production. Uses IF NOT EXISTS throughout.

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS collected_by TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}';
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS notes TEXT;

-- Back-fill status for existing rows so the column is never NULL.
UPDATE public.items
SET status = CASE
  WHEN collected = TRUE THEN 'collected'
  ELSE 'pending'
END
WHERE status IS NULL;

-- Back-fill photo_urls from image_url for existing rows.
UPDATE public.items
SET photo_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL
  AND (photo_urls IS NULL OR array_length(photo_urls, 1) IS NULL);

CREATE INDEX IF NOT EXISTS idx_items_status ON public.items(status);
