-- Allow ORG_ADMIN to update all user profiles
CREATE POLICY "ORG_ADMIN can update all profiles"
ON profiles
FOR UPDATE
TO authenticated
USING (user_is_org_admin(auth.uid()));