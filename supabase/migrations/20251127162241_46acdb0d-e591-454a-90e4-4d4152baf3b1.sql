-- Add collected_by_user_id column to items table
ALTER TABLE public.items 
ADD COLUMN collected_by_user_id UUID REFERENCES public.profiles(id);

-- Add index for better performance
CREATE INDEX idx_items_collected_by_user_id ON public.items(collected_by_user_id);

-- Add comment for documentation
COMMENT ON COLUMN public.items.collected_by_user_id IS 'User who marked the item as collected';