-- Add item_category column for the structured 25-item category list.
-- This is a nullable text column so existing rows stay valid.
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS item_category text;
