-- Migration: PRD V2 Features - Collection Attribution, Audit Trail, Enhanced Status
-- Date: 2026-05-03
-- Non-breaking additions only

-- 1. Add collection attribution fields to items
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS collected_by TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS collected_at TIMESTAMPTZ;

-- 2. Add item status enum for more granular tracking
DO $$ BEGIN
  CREATE TYPE public.item_status AS ENUM ('pending', 'collected', 'not_collected', 'discarded');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE public.items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- 3. Add notes field to items
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS notes TEXT;

-- 4. Create audit_log table for tracking all changes
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL, -- 'item', 'apartment', 'project'
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'collect', 'status_change'
  old_value JSONB,
  new_value JSONB,
  changed_by_user_id UUID REFERENCES public.profiles(id),
  changed_by_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON public.audit_log(changed_by_user_id);

-- RLS for audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view audit logs for their projects" ON public.audit_log
  FOR SELECT USING (
    CASE 
      WHEN entity_type = 'item' THEN EXISTS (
        SELECT 1 FROM public.items i
        JOIN public.user_projects up ON up.project_id = i.project_id
        WHERE i.id = audit_log.entity_id AND up.user_id = auth.uid()
      )
      WHEN entity_type = 'apartment' THEN EXISTS (
        SELECT 1 FROM public.apartments a
        JOIN public.user_projects up ON up.project_id = a.project_id
        WHERE a.id = audit_log.entity_id AND up.user_id = auth.uid()
      )
      WHEN entity_type = 'project' THEN EXISTS (
        SELECT 1 FROM public.user_projects up
        WHERE up.project_id = audit_log.entity_id AND up.user_id = auth.uid()
      )
      ELSE FALSE
    END
  );

CREATE POLICY "Users can insert audit logs" ON public.audit_log
  FOR INSERT WITH CHECK (changed_by_user_id = auth.uid());

-- 5. Create collector_stats view for leaderboard
CREATE OR REPLACE VIEW public.collector_stats AS
SELECT 
  collected_by,
  COUNT(*) as items_collected,
  SUM(quantity) as total_quantity,
  SUM(estimated_weight_kg) as total_weight_kg,
  MAX(collected_at) as last_collection_at
FROM public.items
WHERE collected = TRUE AND collected_by IS NOT NULL
GROUP BY collected_by;

-- 6. Add target_demolition_date to projects
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS target_demolition_date DATE;

-- 7. Create issues view for manager dashboard
CREATE OR REPLACE VIEW public.item_issues AS
SELECT 
  i.id,
  i.description,
  i.project_id,
  i.apartment_id,
  p.name as project_name,
  a.building_number,
  a.apartment_number,
  CASE 
    WHEN i.collected = TRUE AND i.collected_by IS NULL THEN 'missing_collector'
    WHEN i.intended_for_collection = TRUE AND i.collected = FALSE THEN 'not_collected'
    ELSE NULL
  END as issue_type
FROM public.items i
JOIN public.projects p ON p.id = i.project_id
JOIN public.apartments a ON a.id = i.apartment_id
WHERE 
  (i.collected = TRUE AND i.collected_by IS NULL)
  OR (i.intended_for_collection = TRUE AND i.collected = FALSE);

-- 8. Add last_collector to profiles for autofill
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_collector_name TEXT;

-- 9. Create function to update collector stats
CREATE OR REPLACE FUNCTION public.update_item_collection(
  p_item_id UUID,
  p_collected_by TEXT,
  p_user_id UUID
) RETURNS void AS $$
BEGIN
  -- Update item
  UPDATE public.items 
  SET 
    collected = TRUE,
    collected_by = p_collected_by,
    collected_at = NOW(),
    status = 'collected'
  WHERE id = p_item_id;
  
  -- Update user's last collector name
  UPDATE public.profiles
  SET last_collector_name = p_collected_by
  WHERE id = p_user_id;
  
  -- Log audit
  INSERT INTO public.audit_log (entity_type, entity_id, action, new_value, changed_by_user_id, changed_by_name)
  VALUES ('item', p_item_id, 'collect', jsonb_build_object('collected_by', p_collected_by), p_user_id, p_collected_by);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
