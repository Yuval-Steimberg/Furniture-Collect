-- Step 2: Create invitations table and functions

-- Create invitations table for project invites
CREATE TABLE IF NOT EXISTS public.project_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role project_role NOT NULL DEFAULT 'WORKER',
  invited_by UUID NOT NULL REFERENCES profiles(id),
  invited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(project_id, email)
);

-- Enable RLS on invitations
ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;

-- Project managers and org admins can view invitations for their projects
CREATE POLICY "Managers can view project invitations"
ON public.project_invitations
FOR SELECT
USING (
  user_is_org_admin(auth.uid()) OR 
  user_is_project_manager(auth.uid(), project_id)
);

-- Project managers and org admins can create invitations
CREATE POLICY "Managers can create project invitations"
ON public.project_invitations
FOR INSERT
WITH CHECK (
  user_is_org_admin(auth.uid()) OR 
  user_is_project_manager(auth.uid(), project_id)
);

-- Project managers and org admins can delete invitations
CREATE POLICY "Managers can delete project invitations"
ON public.project_invitations
FOR DELETE
USING (
  user_is_org_admin(auth.uid()) OR 
  user_is_project_manager(auth.uid(), project_id)
);

-- Users can view invitations sent to their email
CREATE POLICY "Users can view their own invitations"
ON public.project_invitations
FOR SELECT
USING (
  email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Function to accept invitation
CREATE OR REPLACE FUNCTION public.accept_project_invitation(invitation_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation record;
  v_user_email text;
BEGIN
  -- Get user email
  SELECT email INTO v_user_email FROM auth.users WHERE id = auth.uid();
  
  -- Get invitation details
  SELECT * INTO v_invitation 
  FROM project_invitations 
  WHERE id = invitation_id 
    AND email = v_user_email
    AND accepted_at IS NULL
    AND expires_at > now();
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  -- Add user to project
  INSERT INTO user_projects (user_id, project_id, project_role)
  VALUES (auth.uid(), v_invitation.project_id, v_invitation.role)
  ON CONFLICT (user_id, project_id) DO UPDATE
  SET project_role = EXCLUDED.project_role;
  
  -- Mark invitation as accepted
  UPDATE project_invitations
  SET accepted_at = now()
  WHERE id = invitation_id;
  
  RETURN TRUE;
END;
$$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_project_invitations_email ON project_invitations(email);
CREATE INDEX IF NOT EXISTS idx_project_invitations_project ON project_invitations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_invitations_expires ON project_invitations(expires_at);

-- Function to check if user is viewer
CREATE OR REPLACE FUNCTION public.user_is_viewer(user_id_param uuid, project_id_param uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_projects
    WHERE user_id = user_id_param
    AND project_id = project_id_param
    AND project_role = 'VIEWER'
  );
$$;

-- Update RLS policies for apartments to allow viewers to see but not modify
DROP POLICY IF EXISTS "Users can insert apartments in their projects" ON apartments;
CREATE POLICY "Users can insert apartments in their projects"
ON apartments
FOR INSERT
WITH CHECK (
  user_has_project_access(auth.uid(), project_id) AND 
  NOT user_is_viewer(auth.uid(), project_id)
);

DROP POLICY IF EXISTS "Users can update apartments in their projects" ON apartments;
CREATE POLICY "Users can update apartments in their projects"
ON apartments
FOR UPDATE
USING (
  user_has_project_access(auth.uid(), project_id) AND 
  NOT user_is_viewer(auth.uid(), project_id)
);

-- Update items policies similarly
DROP POLICY IF EXISTS "Users can insert items in their projects" ON items;
CREATE POLICY "Users can insert items in their projects"
ON items
FOR INSERT
WITH CHECK (
  user_has_project_access(auth.uid(), project_id) AND 
  NOT user_is_viewer(auth.uid(), project_id)
);

DROP POLICY IF EXISTS "Users can update items in their projects" ON items;
CREATE POLICY "Users can update items in their projects"
ON items
FOR UPDATE
USING (
  user_has_project_access(auth.uid(), project_id) AND 
  NOT user_is_viewer(auth.uid(), project_id)
);

DROP POLICY IF EXISTS "Users can delete items in their projects" ON items;
CREATE POLICY "Users can delete items in their projects"
ON items
FOR DELETE
USING (
  user_has_project_access(auth.uid(), project_id) AND 
  NOT user_is_viewer(auth.uid(), project_id)
);