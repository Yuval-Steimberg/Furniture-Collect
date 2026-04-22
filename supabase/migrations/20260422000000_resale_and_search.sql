-- =========================================================================
-- Resale value + search infrastructure
--   - estimated_resale_ils     Claude-estimated second-hand value in NIS
--   - duplicate_of              optional FK to an existing item this one
--                               likely duplicates (populated by the
--                               check-duplicate-item edge function)
-- =========================================================================

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS estimated_resale_ils NUMERIC(10, 2) CHECK (estimated_resale_ils IS NULL OR estimated_resale_ils >= 0),
  ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES public.items(id) ON DELETE SET NULL;

-- Index for the "review likely duplicates" dashboard later.
CREATE INDEX IF NOT EXISTS idx_items_duplicate_of
  ON public.items (apartment_id)
  WHERE duplicate_of IS NOT NULL;

-- Index for "high-value items to prioritize" views.
CREATE INDEX IF NOT EXISTS idx_items_resale_value
  ON public.items (project_id, estimated_resale_ils DESC NULLS LAST)
  WHERE intended_for_collection = TRUE AND collected = FALSE;
