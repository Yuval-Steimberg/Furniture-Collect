-- Step 1: Add VIEWER role to enum
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'VIEWER' 
    AND enumtypid = 'project_role'::regtype
  ) THEN
    ALTER TYPE project_role ADD VALUE 'VIEWER';
  END IF;
END $$;