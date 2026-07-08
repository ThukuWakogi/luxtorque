-- ============================================================
-- Enable RLS on all tenant-scoped tables
-- ============================================================

ALTER TABLE "organisations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_branch_assignments" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Drop policies if re-running (idempotency)
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'rls_%'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename
    );
  END LOOP;
END$$;

-- ============================================================
-- Org-scoped policies (no branch dimension)
-- ============================================================

CREATE POLICY rls_org_isolation ON "organisations"
  AS PERMISSIVE FOR ALL
  TO luxtorque_app
  USING (
    current_setting('app.org_id', true) <> ''
    AND id = current_setting('app.org_id', true)
  );

CREATE POLICY rls_org_isolation ON "users"
  AS PERMISSIVE FOR ALL
  TO luxtorque_app
  USING (
    current_setting('app.org_id', true) <> ''
    AND org_id = current_setting('app.org_id', true)
  );

-- ============================================================
-- Branch-scoped policies (org AND branch dimension)
-- ============================================================

CREATE POLICY rls_branch_isolation ON "branches"
  AS PERMISSIVE FOR ALL
  TO luxtorque_app
  USING (
    current_setting('app.org_id', true) <> ''
    AND org_id = current_setting('app.org_id', true)
    AND current_setting('app.branch_id', true) <> ''
    AND id = current_setting('app.branch_id', true)
  );

CREATE POLICY rls_branch_isolation ON "staff_branch_assignments"
  AS PERMISSIVE FOR ALL
  TO luxtorque_app
  USING (
    current_setting('app.org_id', true) <> ''
    AND org_id = current_setting('app.org_id', true)
    AND current_setting('app.branch_id', true) <> ''
    AND branch_id = current_setting('app.branch_id', true)
  );

-- ============================================================
-- Force RLS on table owners (defense-in-depth)
-- ============================================================
ALTER TABLE "organisations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "branches" FORCE ROW LEVEL SECURITY;
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "staff_branch_assignments" FORCE ROW LEVEL SECURITY;