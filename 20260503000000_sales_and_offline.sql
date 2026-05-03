-- Migration: Sales module and offline sync tracking
-- Date: 2026-05-03
-- Non-breaking additions only

-- 1. Sales table for tracking item sales
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  sale_price NUMERIC(10, 2),
  sale_date DATE,
  buyer_info TEXT,
  platform TEXT, -- e.g., 'yad2', 'facebook', 'direct'
  notes TEXT,
  created_by_user_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for sales queries
CREATE INDEX IF NOT EXISTS idx_sales_item_id ON public.sales(item_id);
CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON public.sales(sale_date);

-- Trigger for updated_at
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for sales
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sales in their projects" ON public.sales
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.items i
      JOIN public.user_projects up ON up.project_id = i.project_id
      WHERE i.id = sales.item_id AND up.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert sales in their projects" ON public.sales
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.items i
      JOIN public.user_projects up ON up.project_id = i.project_id
      WHERE i.id = sales.item_id AND up.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update sales in their projects" ON public.sales
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.items i
      JOIN public.user_projects up ON up.project_id = i.project_id
      WHERE i.id = sales.item_id AND up.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete sales in their projects" ON public.sales
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.items i
      JOIN public.user_projects up ON up.project_id = i.project_id
      WHERE i.id = sales.item_id AND up.user_id = auth.uid()
    )
  );

-- 2. Processed recordings table for offline sync idempotency
CREATE TABLE IF NOT EXISTS public.processed_recordings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recording_id TEXT NOT NULL,
  apartment_id UUID REFERENCES public.apartments(id) ON DELETE SET NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  items_created INTEGER DEFAULT 0,
  transcription TEXT,
  UNIQUE(user_id, recording_id)
);

-- Index for processed recordings lookup
CREATE INDEX IF NOT EXISTS idx_processed_recordings_user_id ON public.processed_recordings(user_id);

-- RLS for processed_recordings
ALTER TABLE public.processed_recordings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own processed recordings" ON public.processed_recordings
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can insert own processed recordings" ON public.processed_recordings
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- 3. Photo sessions table for multi-photo capture tracking
CREATE TABLE IF NOT EXISTS public.photo_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  apartment_id UUID NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
  created_by_user_id UUID NOT NULL REFERENCES public.profiles(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  photo_count INTEGER DEFAULT 0
);

-- Index for photo sessions
CREATE INDEX IF NOT EXISTS idx_photo_sessions_apartment_id ON public.photo_sessions(apartment_id);

-- RLS for photo_sessions
ALTER TABLE public.photo_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view photo sessions in their projects" ON public.photo_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.apartments a
      JOIN public.user_projects up ON up.project_id = a.project_id
      WHERE a.id = photo_sessions.apartment_id AND up.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert photo sessions in their projects" ON public.photo_sessions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.apartments a
      JOIN public.user_projects up ON up.project_id = a.project_id
      WHERE a.id = photo_sessions.apartment_id AND up.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update photo sessions in their projects" ON public.photo_sessions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.apartments a
      JOIN public.user_projects up ON up.project_id = a.project_id
      WHERE a.id = photo_sessions.apartment_id AND up.user_id = auth.uid()
    )
  );

-- 4. Add sold flag to items table (non-breaking)
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS sold BOOLEAN DEFAULT FALSE;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS sale_price NUMERIC(10, 2);

-- Index for sold items
CREATE INDEX IF NOT EXISTS idx_items_sold ON public.items(sold) WHERE sold = TRUE;
