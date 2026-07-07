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
