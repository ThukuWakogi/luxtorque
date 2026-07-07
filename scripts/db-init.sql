-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Application role (limited privileges — not superuser, not BYPASSRLS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'luxtorque_app') THEN
    CREATE ROLE luxtorque_app LOGIN PASSWORD 'luxtorque_app_password';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE luxtorque_dev TO luxtorque_app;
GRANT USAGE ON SCHEMA public TO luxtorque_app;

-- Note: table-level grants are applied during migrations, not here.
-- This file only provisions the role and extensions.
