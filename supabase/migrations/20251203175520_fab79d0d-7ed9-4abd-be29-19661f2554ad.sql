-- Add archived column to projects table
ALTER TABLE public.projects 
ADD COLUMN archived boolean NOT NULL DEFAULT false;

-- Add index for faster filtering
CREATE INDEX idx_projects_archived ON public.projects(archived);

-- Allow ORG_ADMIN to delete projects
CREATE POLICY "ORG_ADMIN can delete projects" 
ON public.projects 
FOR DELETE 
USING (user_is_org_admin(auth.uid()));