#!/usr/bin/env bash
set -euo pipefail

# Load .env if present
if [ -f "$(dirname "$0")/../.env" ]; then
  # shellcheck disable=SC1091
  source "$(dirname "$0")/../.env"
fi

PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-${POSTGRES_PORT:-5432}}"
PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-luxtorque_dev}}"
PGUSER="${PGUSER:-luxtorque_app}"
PGPASSWORD="${PGPASSWORD:-luxtorque_app_password}"

export PGPASSWORD

echo "━━━ LuxTorque DB Smoke Test ━━━"
echo "Host:     $PGHOST:$PGPORT"
echo "Database: $PGDATABASE"
echo "User:     $PGUSER"
echo ""

# 1. Check psql is available
if ! command -v psql &>/dev/null; then
  echo "✗ psql not found. Install PostgreSQL client tools and retry."
  exit 1
fi

# 2. Test connectivity
echo "→ Testing connection..."
if ! psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -c '\conninfo' &>/dev/null; then
  echo "✗ Could not connect to PostgreSQL."
  echo "  Is the Docker container running? Try: docker compose up -d"
  exit 1
fi
echo "  ✓ Connected"

# 3. Confirm PostgreSQL version is 18 or later
echo "→ Checking PostgreSQL version..."
PG_VERSION=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tAc "SELECT current_setting('server_version_num')::int;")
if [ "$PG_VERSION" -lt 180000 ]; then
  echo "✗ PostgreSQL version is below 18 (got version number: $PG_VERSION)."
  exit 1
fi
echo "  ✓ Version OK (server_version_num: $PG_VERSION)"

# 4. Confirm pgcrypto extension is available
echo "→ Checking pgcrypto extension..."
EXT=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tAc "SELECT extname FROM pg_extension WHERE extname = 'pgcrypto';")
if [ "$EXT" != "pgcrypto" ]; then
  echo "✗ pgcrypto extension not found. Check db-init.sql ran correctly."
  exit 1
fi
echo "  ✓ pgcrypto present"

# 5. Confirm application role cannot bypass RLS (sanity check)
echo "→ Checking role is not superuser..."
IS_SUPER=$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tAc "SELECT rolsuper FROM pg_roles WHERE rolname = current_user;")
if [ "$IS_SUPER" = "t" ]; then
  echo "✗ Application role has superuser privileges — this will bypass RLS. Fix db-init.sql."
  exit 1
fi
echo "  ✓ Role is not superuser"

echo ""
echo "━━━ All checks passed ━━━"
exit 0
