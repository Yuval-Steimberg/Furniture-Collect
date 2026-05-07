-- Add collection_order to items so the project manager can set pickup sequence.
-- Initialize based on created_at order within each apartment.
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS collection_order INTEGER;

UPDATE public.items SET collection_order = sub.rn
FROM (
  SELECT id,
    (ROW_NUMBER() OVER (PARTITION BY apartment_id ORDER BY created_at ASC) - 1)::INTEGER AS rn
  FROM public.items
) sub
WHERE public.items.id = sub.id;
