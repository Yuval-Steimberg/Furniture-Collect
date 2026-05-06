-- =========================================================================
-- Bootstrap org-admin account: Steimberg172@gmail.com
-- Idempotent: safe to run multiple times.
-- Creates the auth user if missing, updates password + profile, and
-- assigns PROJECT_MANAGER on every existing project.
-- =========================================================================

DO $$
DECLARE
  v_id UUID;
BEGIN
  -- ── 1. Find or create the auth user ──────────────────────────────────
  SELECT id INTO v_id
  FROM auth.users
  WHERE lower(email) = lower('Steimberg172@gmail.com')
  LIMIT 1;

  IF v_id IS NULL THEN
    -- Create fresh user (email auto-confirmed so they can log in at once)
    v_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_id,
      'authenticated',
      'authenticated',
      'Steimberg172@gmail.com',
      crypt('12345678', gen_salt('bf')),
      now(),
      '{"name": "Yuval Steimberg"}'::jsonb,
      now(),
      now(),
      '', '', '', ''
    );

    -- handle_new_user trigger creates the profile row automatically.
    -- Give it a moment to fire by updating right after.
    UPDATE public.profiles
    SET org_role    = 'ORG_ADMIN',
        name        = 'Yuval Steimberg',
        is_active   = true,
        email       = 'Steimberg172@gmail.com'
    WHERE id = v_id;

  ELSE
    -- User exists — update password and elevate to ORG_ADMIN.
    UPDATE auth.users
    SET encrypted_password = crypt('12345678', gen_salt('bf')),
        updated_at         = now()
    WHERE id = v_id;

    UPDATE public.profiles
    SET org_role  = 'ORG_ADMIN',
        is_active = true
    WHERE id = v_id;
  END IF;

  -- ── 2. Grant PROJECT_MANAGER on every project ─────────────────────────
  INSERT INTO public.user_projects (user_id, project_id, project_role)
  SELECT v_id, p.id, 'PROJECT_MANAGER'
  FROM   public.projects p
  ON CONFLICT (user_id, project_id)
  DO UPDATE SET project_role = 'PROJECT_MANAGER';

END;
$$;
