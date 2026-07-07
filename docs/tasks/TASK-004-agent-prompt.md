# TASK-004: Provision PostgreSQL 18 (local + staging)

**Depends on:** TASK-001 (cloud provider decision must be recorded in `/docs/decisions/0001-cloud-provider.md`)

## What you're doing and why
This task stands up a local PostgreSQL 18 instance via Docker Compose and documents the steps
a human must follow to provision a matching staging database in the cloud. You are not responsible
for creating cloud resources — that requires credentials and explicit human sign-off. Your job is
to make the local environment fully working and leave staging instructions that are accurate enough
to execute without guesswork.

This is an infrastructure configuration task. Do not touch application code, Prisma schemas,
or any auth/RBAC logic — those come in later tasks.

---

## Steps

### 1. Verify the dependency

Before creating any files, confirm TASK-001 is complete:
- `/docs/decisions/0001-cloud-provider.md` exists and names exactly one provider (AWS or GCP).

If it does not exist, **stop. Report that TASK-001 is incomplete. Do not proceed.**

---

### 2. Check for an existing `docker-compose.yml`

Search the repo root and `infra/` for any existing `docker-compose.yml` or `docker-compose.*.yml`.

- If one exists and already defines a `postgres` service, read it first. Extend it rather than replace it.
- If none exists, create one from scratch at repo root.

---

### 3. Create or update `docker-compose.yml`

Place the file at repo root. It must define at minimum:

- A `postgres` service running **PostgreSQL 18** (use the official `postgres:18-alpine` image).
- A named volume for data persistence across container restarts.
- An `adminer` service for local DB inspection (image: `adminer:latest`, port `8080`).
- All credentials sourced from environment variables, never hardcoded.

**`docker-compose.yml`:**
```yaml
services:
  postgres:
    image: postgres:18-alpine
    container_name: luxtorque-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-luxtorque}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-luxtorque_dev_password}
      POSTGRES_DB: ${POSTGRES_DB:-luxtorque_dev}
    ports:
      - "${POSTGRES_PORT:-5432}:5432"
    volumes:
      - postgres_data:/var/lib/postgresql
      - ./scripts/db-init.sql:/docker-entrypoint-initdb.d/00-init.sql:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-luxtorque} -d ${POSTGRES_DB:-luxtorque_dev}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  adminer:
    image: adminer:latest
    container_name: luxtorque-adminer
    restart: unless-stopped
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
    name: luxtorque_postgres_data
```

---

### 4. Create `/scripts/db-init.sql`

This file runs once on first container start (via `docker-entrypoint-initdb.d`).
It must create the application database user with limited privileges (not superuser),
and enable extensions needed later (UUID generation).

**`/scripts/db-init.sql`:**
```sql
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
```

> **Important:** The superuser credentials in `docker-compose.yml` are for local dev only.
> The application must connect as `luxtorque_app`, not as the superuser, in all environments.
> Row-level security (added in a later task) requires this separation — a superuser bypasses RLS.

---

### 5. Create or update `.env.example`

Add all database-related variables to `.env.example` at repo root.
If the file already exists, append only — do not remove existing entries.

```env
# ── Database (local Docker Compose) ─────────────────────────────
POSTGRES_USER=luxtorque
POSTGRES_PASSWORD=luxtorque_dev_password
POSTGRES_DB=luxtorque_dev
POSTGRES_PORT=5432

# Application role (used by Prisma / NestJS — not the superuser)
DATABASE_URL=postgresql://luxtorque_app:luxtorque_app_password@localhost:5432/luxtorque_dev

# Superuser URL — for migrations and RLS policy management only
DATABASE_URL_SUPERUSER=postgresql://luxtorque:luxtorque_dev_password@localhost:5432/luxtorque_dev
```

Then create a local `.env` by copying the example:
```bash
cp .env.example .env
```

Confirm `.env` is already in `.gitignore` (it must have been added in TASK-002).
If it is missing from `.gitignore`, add it now and note the omission.

---

### 6. Create `/scripts/db-smoke-test.sh`

This script verifies the local Postgres instance is reachable and the application role works.
It must exit `0` on success and a non-zero code with a clear error message on failure.

**`/scripts/db-smoke-test.sh`:**
```bash
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
```

Make it executable:
```bash
chmod +x scripts/db-smoke-test.sh
```

---

### 7. Create `/docs/infra/database.md`

Document both local and staging database setup. For staging, write accurate human-executable
steps — do not provision anything yourself unless you have credentials and explicit permission.

Read `/docs/decisions/0001-cloud-provider.md` first. The staging section must match the chosen provider.

**`/docs/infra/database.md`:**
```markdown
# Database Infrastructure

## Local development

### Prerequisites
- Docker and Docker Compose installed
- `.env` file at repo root (copy from `.env.example`)

### Start the database
```bash
docker compose up -d postgres
```

Wait for healthy status:
```bash
docker compose ps
```

### Verify connectivity
```bash
bash scripts/db-smoke-test.sh
```

### Inspect with Adminer
```bash
docker compose up -d adminer
```
Open http://localhost:8080 in a browser.
- System: PostgreSQL
- Server: postgres (the Docker service name, not localhost)
- Username: luxtorque (superuser, for inspection only)
- Password: luxtorque_dev_password
- Database: luxtorque_dev

> Never use the superuser credentials in application code.
> The application connects as `luxtorque_app`.

### Reset local data
```bash
docker compose down -v   # removes the named volume
docker compose up -d postgres
```

---

## Staging environment

> **Note:** These steps must be run by a human with cloud credentials.
> The agent does not provision staging resources.

### Chosen provider
See `/docs/decisions/0001-cloud-provider.md`.

---

### If AWS (RDS)

1. **Create a PostgreSQL 18 RDS instance** in the AWS console or via Terraform:
   - Engine: PostgreSQL 18.x
   - Instance class: `db.t3.micro` (staging)
   - Multi-AZ: No (staging only)
   - Storage: 20 GB gp3, autoscaling enabled
   - VPC: place in the same VPC as the app's ECS/Cloud Run service
   - Public access: No — connect via VPC only

2. **Create the application database and role** by connecting as the master user:
   ```sql
   CREATE DATABASE luxtorque_staging;
   CREATE ROLE luxtorque_app LOGIN PASSWORD '<strong-password-from-secrets-manager>';
   GRANT CONNECT ON DATABASE luxtorque_staging TO luxtorque_app;
   GRANT USAGE ON SCHEMA public TO luxtorque_app;
   CREATE EXTENSION IF NOT EXISTS "pgcrypto";
   ```

3. **Store credentials in AWS Secrets Manager:**
   - Secret name: `luxtorque/staging/db`
   - Keys: `DATABASE_URL`, `DATABASE_URL_SUPERUSER`

4. **Grant the app's IAM role** permission to read the secret.

---

### If GCP (Cloud SQL)

1. **Create a PostgreSQL 18 Cloud SQL instance** in the GCP console or via Terraform:
   - Database version: POSTGRES_18
   - Machine type: `db-f1-micro` (staging)
   - Region: match your Cloud Run region
   - Connections: Private IP only (no public IP)

2. **Create the application database and user:**
   ```sql
   CREATE DATABASE luxtorque_staging;
   CREATE USER luxtorque_app WITH PASSWORD '<strong-password>';
   GRANT CONNECT ON DATABASE luxtorque_staging TO luxtorque_app;
   GRANT USAGE ON SCHEMA public TO luxtorque_app;
   CREATE EXTENSION IF NOT EXISTS "pgcrypto";
   ```

3. **Store credentials in GCP Secret Manager:**
   - Secret name: `luxtorque-staging-db-url`
   - Value: full `DATABASE_URL` connection string

4. **Grant the Cloud Run service account** the `Secret Manager Secret Accessor` role.

---

## Connection string format

```
postgresql://<user>:<password>@<host>:<port>/<database>
```

Example (local):
```
postgresql://luxtorque_app:luxtorque_app_password@localhost:5432/luxtorque_dev
```

---

## Security rules (all environments)

- The application **always** connects as `luxtorque_app`, never as the superuser.
- Migrations and RLS policy changes connect as the superuser via `DATABASE_URL_SUPERUSER`.
- The superuser password is never stored in application environment variables at runtime.
- Row-level security will be applied in a later task (TASK-005). The role separation established
  here is a prerequisite for that — do not flatten it.
```

---

### 8. Add a `db:smoke` script to root `package.json`

```json
"scripts": {
  "db:smoke": "bash scripts/db-smoke-test.sh",
  "db:up": "docker compose up -d postgres",
  "db:down": "docker compose down"
}
```

---

## Verification steps

Run these locally before marking done:

```bash
# 1. Bring up the database
docker compose up -d postgres

# 2. Wait for healthy status (up to 30 seconds)
docker compose ps

# 3. Run the smoke test — must exit 0
bash scripts/db-smoke-test.sh

# 4. Confirm version via psql directly
psql "$DATABASE_URL" -c "SELECT version();"

# 5. Confirm adminer loads
docker compose up -d adminer
# Open http://localhost:8080 and confirm login works

# 6. Confirm .env is not tracked by git
git status .env   # must show "nothing to commit" or untracked — never modified/staged
```

---

## Acceptance criteria (all must be true before marking done)

- [ ] `docker compose up -d postgres` starts a PostgreSQL 18 instance with no errors.
- [ ] `docker compose ps` reports the `postgres` service as `healthy`.
- [ ] `bash scripts/db-smoke-test.sh` exits `0` with all checks passing.
- [ ] The smoke test confirms PostgreSQL version ≥ 18.
- [ ] The smoke test confirms `pgcrypto` extension is present.
- [ ] The smoke test confirms the application role (`luxtorque_app`) is **not** a superuser.
- [ ] `adminer` service starts and is accessible at `http://localhost:8080`.
- [ ] `.env.example` contains all required database variables.
- [ ] `.env` is present locally but is **not** tracked by git.
- [ ] `/docs/infra/database.md` exists with local and staging instructions matching the chosen cloud provider.
- [ ] `/scripts/db-init.sql` creates the `luxtorque_app` role and enables `pgcrypto`.
- [ ] `pnpm db:smoke` runs the smoke test from the root `package.json`.
- [ ] No application code, Prisma schema, or auth logic was added or modified.

---

## What not to do

- Do not provision staging or production cloud database resources — document the steps for a human instead.
- Do not connect as the superuser in the smoke test — test the application role only.
- Do not hardcode passwords in any file that is committed to git; all credentials go in `.env` only.
- Do not grant the `luxtorque_app` role superuser, `BYPASSRLS`, or `CREATEROLE` privileges.
- Do not add Prisma or any ORM configuration in this task — that is TASK-005.
- Do not modify `ci.yml` to run the smoke test in CI — the smoke test requires Docker Compose and is a local-only check at this stage.
- Do not proceed to TASK-005 until every acceptance criterion above is checked.
