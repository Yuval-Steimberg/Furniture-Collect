-- Multi-photo support: store array of photo URLs per item
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}';

-- Status enum for three-state collection tracking
-- 'pending' | 'collected' | 'not_collected' | 'discarded'
-- Note: status column already added in 20260503120000 but kept IF NOT EXISTS for safety
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Backfill status from existing collected boolean
UPDATE public.items
SET status = CASE
  WHEN collected = TRUE THEN 'collected'
  ELSE 'pending'
END
WHERE status IS NULL OR status = 'pending';

-- Backfill photo_urls from existing image_url (single photo → first element of array)
UPDATE public.items
SET photo_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL AND (photo_urls IS NULL OR array_length(photo_urls, 1) IS NULL);

CREATE INDEX IF NOT EXISTS idx_items_status ON public.items(status);
