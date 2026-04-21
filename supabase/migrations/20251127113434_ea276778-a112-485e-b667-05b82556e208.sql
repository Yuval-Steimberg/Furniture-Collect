-- Fix RLS policy that causes permission denied error
-- The issue is that the policy tries to access auth.users directly
-- We need a SECURITY DEFINER function to safely get the current user's email

CREATE OR REPLACE FUNCTION public.get_current_user_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM auth.users WHERE id = auth.uid();
$$;

-- Drop and recreate the policy using the new function
DROP POLICY IF EXISTS "Users can view their own invitations" ON project_invitations;

CREATE POLICY "Users can view their own invitations" 
ON public.project_invitations 
FOR SELECT 
USING (email = get_current_user_email());