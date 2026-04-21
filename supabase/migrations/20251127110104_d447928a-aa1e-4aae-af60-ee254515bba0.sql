-- Drop problematic policies
DROP POLICY IF EXISTS "Users can view projects they're assigned to" ON public.projects;
DROP POLICY IF EXISTS "ORG_ADMIN and PROJECT_MANAGER can update projects" ON public.projects;
DROP POLICY IF EXISTS "Managers can assign users to projects" ON public.user_projects;
DROP POLICY IF EXISTS "Managers can remove users from projects" ON public.user_projects;
DROP POLICY IF EXISTS "Users can view their project assignments" ON public.user_projects;

-- Create helper function to check if user is in project (bypasses RLS)
CREATE OR REPLACE FUNCTION public.user_has_project_access(user_id_param UUID, project_id_param UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_projects
    WHERE user_id = user_id_param
    AND project_id = project_id_param
  );
$$;

-- Create helper function to check if user is project manager
CREATE OR REPLACE FUNCTION public.user_is_project_manager(user_id_param UUID, project_id_param UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_projects
    WHERE user_id = user_id_param
    AND project_id = project_id_param
    AND project_role = 'PROJECT_MANAGER'
  );
$$;

-- Create helper function to check if user is org admin
CREATE OR REPLACE FUNCTION public.user_is_org_admin(user_id_param UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id_param
    AND org_role = 'ORG_ADMIN'
  );
$$;

-- Recreate projects policies using helper functions
CREATE POLICY "Users can view projects they're assigned to" ON public.projects
  FOR SELECT USING (
    public.user_has_project_access(auth.uid(), id)
    OR public.user_is_org_admin(auth.uid())
  );

CREATE POLICY "ORG_ADMIN and PROJECT_MANAGER can update projects" ON public.projects
  FOR UPDATE USING (
    public.user_is_org_admin(auth.uid())
    OR public.user_is_project_manager(auth.uid(), id)
  );

-- Recreate user_projects policies using helper functions
CREATE POLICY "Users can view their project assignments" ON public.user_projects
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.user_is_org_admin(auth.uid())
    OR public.user_is_project_manager(auth.uid(), project_id)
  );

CREATE POLICY "Managers can assign users to projects" ON public.user_projects
  FOR INSERT WITH CHECK (
    public.user_is_org_admin(auth.uid())
    OR public.user_is_project_manager(auth.uid(), project_id)
  );

CREATE POLICY "Managers can remove users from projects" ON public.user_projects
  FOR DELETE USING (
    public.user_is_org_admin(auth.uid())
    OR public.user_is_project_manager(auth.uid(), project_id)
  );