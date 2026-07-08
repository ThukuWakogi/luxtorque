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
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO luxtorque_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO luxtorque_app;
ALTER DEFAULT PRIVILEGES FOR ROLE luxtorque IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO luxtorque_app;
ALTER DEFAULT PRIVILEGES FOR ROLE luxtorque IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO luxtorque_app;
