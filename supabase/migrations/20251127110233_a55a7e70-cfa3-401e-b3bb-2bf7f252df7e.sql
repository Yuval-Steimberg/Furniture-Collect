-- Create function to automatically add project creator to user_projects
CREATE OR REPLACE FUNCTION public.handle_new_project()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  creator_role project_role;
BEGIN
  -- Check if creator is ORG_ADMIN or PROJECT_MANAGER
  SELECT 
    CASE 
      WHEN org_role = 'ORG_ADMIN' THEN 'PROJECT_MANAGER'::project_role
      WHEN org_role = 'PROJECT_MANAGER' THEN 'PROJECT_MANAGER'::project_role
      ELSE 'WORKER'::project_role
    END INTO creator_role
  FROM profiles
  WHERE id = auth.uid();

  -- Add creator to user_projects
  INSERT INTO user_projects (user_id, project_id, project_role)
  VALUES (auth.uid(), NEW.id, creator_role);

  RETURN NEW;
END;
$$;

-- Create trigger for new projects
DROP TRIGGER IF EXISTS on_project_created ON public.projects;
CREATE TRIGGER on_project_created
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_project();

-- Add UPDATE policy for user_projects (was missing!)
CREATE POLICY "Managers can update user project roles" ON public.user_projects
  FOR UPDATE USING (
    public.user_is_org_admin(auth.uid())
    OR public.user_is_project_manager(auth.uid(), project_id)
  );

-- Ensure apartments policies don't have recursion issues
DROP POLICY IF EXISTS "Users can view apartments in their projects" ON public.apartments;
DROP POLICY IF EXISTS "Users can insert apartments in their projects" ON public.apartments;
DROP POLICY IF EXISTS "Users can update apartments in their projects" ON public.apartments;

CREATE POLICY "Users can view apartments in their projects" ON public.apartments
  FOR SELECT USING (
    public.user_has_project_access(auth.uid(), project_id)
  );

CREATE POLICY "Users can insert apartments in their projects" ON public.apartments
  FOR INSERT WITH CHECK (
    public.user_has_project_access(auth.uid(), project_id)
  );

CREATE POLICY "Users can update apartments in their projects" ON public.apartments
  FOR UPDATE USING (
    public.user_has_project_access(auth.uid(), project_id)
  );

-- Ensure items policies don't have recursion issues
DROP POLICY IF EXISTS "Users can view items in their projects" ON public.items;
DROP POLICY IF EXISTS "Users can insert items in their projects" ON public.items;
DROP POLICY IF EXISTS "Users can update items in their projects" ON public.items;
DROP POLICY IF EXISTS "Users can delete items in their projects" ON public.items;

CREATE POLICY "Users can view items in their projects" ON public.items
  FOR SELECT USING (
    public.user_has_project_access(auth.uid(), project_id)
  );

CREATE POLICY "Users can insert items in their projects" ON public.items
  FOR INSERT WITH CHECK (
    public.user_has_project_access(auth.uid(), project_id)
  );

CREATE POLICY "Users can update items in their projects" ON public.items
  FOR UPDATE USING (
    public.user_has_project_access(auth.uid(), project_id)
  );

CREATE POLICY "Users can delete items in their projects" ON public.items
  FOR DELETE USING (
    public.user_has_project_access(auth.uid(), project_id)
  );