# AGENT PROMPT — TASK-008: Implement Row-Level Security (RLS) Policies

> **Classification:** `[ISOLATION-CRITICAL]`
> **Depends on:** TASK-007 (complete and merged)
> **Risk level:** Highest in Phase 1 — do **not** self-certify as done; TASK-009 will run automated proofs

---

## 0. Pre-flight Checklist

Before writing a single line of SQL, verify:

- [ ] TASK-007 migration has been applied (`prisma migrate deploy` completed without errors)
- [ ] You can connect to the dev database as a **non-superuser** role (see §4 — you must create one if it doesn't exist)
- [ ] Every domain table carries both `org_id` and (where applicable) `branch_id` columns — confirm by running:

```sql
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('org_id', 'branch_id')
ORDER BY table_name, column_name;
```

- [ ] No existing `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statements are already present in prior migrations (check `prisma/migrations/` history)

---

## 1. Context

**Project:** LuxTorque Ltd — multi-tenant SaaS for car garage management (`luxtorque-v2` monorepo)
**Database:** PostgreSQL 18 (Prisma ORM, migrations under `packages/api/prisma/migrations/`)
**Goal:** Enforce tenant isolation at the database layer so that an application bug can never leak data across organisations.

**SRS requirement:** NFR-SEC-05 — tenant isolation must be enforced at the data-store layer independently of application logic.

**Tenancy model (two-layer):**
- Every domain table has `org_id UUID NOT NULL` (top-level tenant boundary)
- Tables scoped to a branch also carry `branch_id UUID NOT NULL`
- The `sessions` variable pair used throughout the codebase: `app.org_id` and `app.branch_id`

---

## 2. Architectural Decisions (Pre-Resolved — Do Not Revisit)

| Decision | Resolution |
|---|---|
| Session variable mechanism | `SET LOCAL "app.org_id" = '<uuid>';` per transaction via NestJS interceptor |
| Policy enforcement style | `PERMISSIVE` `USING` clause only (no separate `WITH CHECK` needed — `USING` covers both reads and writes by default in PostgreSQL) |
| Superuser bypass | Acceptable — Prisma migration runner connects as superuser; RLS does **not** apply to superusers. The application role must be non-superuser. |
| `branch_id` policy | Tables with `branch_id` enforce **both** `org_id` **and** `branch_id` in the `USING` clause (AND logic) |
| Policy for cross-org admin ops | Out of scope for Phase 1 — staff admin routes bypass via a dedicated DB role with `BYPASSRLS`, provisioned separately |
| Migration location | New Prisma migration: `prisma migrate dev --name rls_policies` |
| Documentation location | `/docs/infra/row-level-security.md` |

---

## 3. Critical Pitfall — `current_setting()` Empty-String Bug

> ⚠️ **This is a known production bug in this codebase. Read carefully.**

When a session variable has never been set, `current_setting('app.org_id', true)` returns **`''` (empty string)**, not `NULL`. This means:

```sql
-- ❌ WRONG — passes when var is unset ('' IS NOT NULL = true)
USING (org_id = current_setting('app.org_id', true)::uuid)

-- ❌ WRONG — blocks ALL rows when var is unset (casts '' to uuid → error)
USING (org_id::text = current_setting('app.org_id', true))
```

**Correct pattern — always guard against the empty string:**

```sql
-- ✅ CORRECT
USING (
  current_setting('app.org_id', true) <> ''
  AND org_id = current_setting('app.org_id', true)::uuid
)
```

Apply the identical guard to `branch_id`:

```sql
-- ✅ CORRECT for branch-scoped tables
USING (
  current_setting('app.org_id', true) <> ''
  AND org_id = current_setting('app.org_id', true)::uuid
  AND current_setting('app.branch_id', true) <> ''
  AND branch_id = current_setting('app.branch_id', true)::uuid
)
```

---

## 4. Step-by-Step Implementation

### Step 4.1 — Create the application database role (if not already present)

This must exist before RLS policies are useful. Add to the migration or a separate DBA script:

```sql
-- Run once on each environment (idempotent guard included)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'luxtorque_app') THEN
    CREATE ROLE luxtorque_app LOGIN PASSWORD 'change_me_per_env';
  END IF;
END$$;

GRANT CONNECT ON DATABASE luxtorque TO luxtorque_app;
GRANT USAGE ON SCHEMA public TO luxtorque_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO luxtorque_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO luxtorque_app;
```

> **Do not hardcode passwords in migrations.** Use `\gset` or environment injection for non-dev environments. For dev, `change_me_per_env` is acceptable.

### Step 4.2 — Write the Prisma migration

Create the migration file:

```bash
cd packages/api
pnpm prisma migrate dev --name rls_policies --create-only
```

Open the generated `migration.sql` and populate it. The file must follow this structure exactly:

#### 4.2.1 — Enable RLS on all `org_id`-carrying tables

```sql
-- ============================================================
-- Enable RLS on all tenant-scoped tables
-- ============================================================
-- List every table that carries org_id. Add new tables here
-- as new domain modules are introduced.

ALTER TABLE "Organisation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Branch"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User"         ENABLE ROW LEVEL SECURITY;
-- <continue for every domain table with org_id>
```

> Enumerate **every** table. Do not leave any out. Run the column query from §0 to confirm the full list.

#### 4.2.2 — Drop any pre-existing policies (idempotency)

```sql
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
```

#### 4.2.3 — Create org-scoped policies (tables without `branch_id`)

```sql
-- ============================================================
-- Org-scoped policies (no branch dimension)
-- ============================================================

CREATE POLICY rls_org_isolation ON "Organisation"
  AS PERMISSIVE FOR ALL
  TO luxtorque_app
  USING (
    current_setting('app.org_id', true) <> ''
    AND id = current_setting('app.org_id', true)::uuid
  );

CREATE POLICY rls_org_isolation ON "User"
  AS PERMISSIVE FOR ALL
  TO luxtorque_app
  USING (
    current_setting('app.org_id', true) <> ''
    AND org_id = current_setting('app.org_id', true)::uuid
  );

-- Repeat the same pattern for every org-scoped table
```

#### 4.2.4 — Create branch-scoped policies (tables with both `org_id` and `branch_id`)

```sql
-- ============================================================
-- Branch-scoped policies (org AND branch dimension)
-- ============================================================

CREATE POLICY rls_branch_isolation ON "Branch"
  AS PERMISSIVE FOR ALL
  TO luxtorque_app
  USING (
    current_setting('app.org_id', true) <> ''
    AND org_id = current_setting('app.org_id', true)::uuid
    AND current_setting('app.branch_id', true) <> ''
    AND id = current_setting('app.branch_id', true)::uuid
  );

-- Repeat for every branch-scoped table (WorkOrder, Inventory, etc.)
```

#### 4.2.5 — Force RLS even for the table owner

```sql
-- ============================================================
-- Force RLS on table owners (defense-in-depth)
-- ============================================================
ALTER TABLE "Organisation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Branch"       FORCE ROW LEVEL SECURITY;
ALTER TABLE "User"         FORCE ROW LEVEL SECURITY;
-- <all tables>
```

> `FORCE ROW LEVEL SECURITY` ensures policies apply even when the session runs as the table owner. The Prisma migration runner (superuser) is exempt regardless — this is intentional.

### Step 4.3 — NestJS interceptor: set session variables per request

Location: `packages/api/src/common/interceptors/rls-context.interceptor.ts`

```typescript
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    // Populated by your auth guard after validating the session
    const orgId: string | undefined = req.session?.orgId;
    const branchId: string | undefined = req.session?.branchId;

    if (!orgId) {
      // Unauthenticated requests — RLS will block all rows (empty string guard)
      return next.handle();
    }

    // Wrap the downstream handler in a transaction so SET LOCAL is scoped
    return new Observable((subscriber) => {
      this.prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `SET LOCAL "app.org_id" = '${orgId}'`,
          );
          if (branchId) {
            await tx.$executeRawUnsafe(
              `SET LOCAL "app.branch_id" = '${branchId}'`,
            );
          }
          // Re-invoke handler inside the transaction
          // Note: pass `tx` to services that need it, or use AsyncLocalStorage
          return next.handle().toPromise();
        })
        .then((v) => { subscriber.next(v); subscriber.complete(); })
        .catch((e) => subscriber.error(e));
    });
  }
}
```

> **Implementation note:** `SET LOCAL` scopes the variable to the current transaction only — it resets automatically on `COMMIT` or `ROLLBACK`. This is the correct scope. `SET` (without LOCAL) would persist for the entire connection, which is dangerous in a connection pool.

Register globally in `AppModule` or `CoreModule`:

```typescript
providers: [
  { provide: APP_INTERCEPTOR, useClass: RlsContextInterceptor },
],
```

### Step 4.4 — Write the documentation

Create `/docs/infra/row-level-security.md` following the outline in §6 below.

---

## 5. Manual `psql` Verification (Required Before PR)

Run these steps exactly. Record the output in your PR description.

```bash
# Connect as the app role (non-superuser)
psql "$DATABASE_URL" -U luxtorque_app
```

```sql
-- 1. Confirm RLS is enabled
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relrowsecurity = true
ORDER BY relname;
-- Expected: every domain table appears in this list

-- 2. Seed two orgs (if not already seeded)
-- (Connect as superuser for this step)
-- INSERT INTO "Organisation" ...

-- 3. Scope session to Org A
SET LOCAL "app.org_id" = '<org_a_uuid>';

-- 4. Attempt to read Org B's data
SELECT COUNT(*) FROM "User" WHERE org_id = '<org_b_uuid>';
-- Expected: 0  (zero rows — not an error)

SELECT COUNT(*) FROM "User";
-- Expected: only Org A's rows are counted

-- 5. Attempt write across boundary
INSERT INTO "User" (id, org_id, ...) VALUES (gen_random_uuid(), '<org_b_uuid>', ...);
-- Expected: 0 rows inserted (silently blocked) OR policy violation error
-- Both outcomes are acceptable; zero-insert is preferred

-- 6. Confirm unscoped session returns zero rows (not all rows)
RESET "app.org_id";
SELECT COUNT(*) FROM "User";
-- Expected: 0 (empty-string guard kicks in — no var set means no rows visible)
```

> Copy the output of each query into the PR description under a `## RLS Verification` section.

---

## 6. Documentation — `/docs/infra/row-level-security.md`

The file must cover all of the following sections (expand with implementation specifics):

```markdown
# Row-Level Security (RLS) — LuxTorque

## Overview
Brief description of why RLS is used and what it guarantees.

## Tenancy Model
Explain org_id / branch_id two-layer structure.

## Session Variable Contract
- `app.org_id` — required for all authenticated requests
- `app.branch_id` — required for branch-scoped tables
- How/where these are set (RlsContextInterceptor, SET LOCAL)
- Why SET LOCAL and not SET

## Policy Structure
- Pattern used for org-scoped tables
- Pattern used for branch-scoped tables
- The empty-string guard and why it exists

## Tables Covered
List all tables with RLS enabled, and their scope (org / branch).

## Application Role
- Role name: luxtorque_app
- Permissions granted
- Why superuser bypass is intentional

## Known Limitations & Bypass Points
- Superuser connections (Prisma migration runner)
- BYPASSRLS role for staff admin (Phase 2)
- Direct psql access without SET LOCAL

## Testing
Reference TASK-009 automated proof suite.
```

---

## 7. Acceptance Criteria Checklist

All must be green before opening the PR.

| # | Criterion | How to verify |
|---|---|---|
| AC-1 | RLS enabled on **every** `org_id`-carrying table | `SELECT relname FROM pg_class WHERE relrowsecurity = true` — compare against column inventory |
| AC-2 | Non-superuser scoped to Org A reads zero rows from Org B | §5, step 4 |
| AC-3 | Unscoped session (no `app.org_id` set) returns zero rows, not all rows | §5, step 6 |
| AC-4 | `SET LOCAL` used (not `SET`) — scoped to transaction, not connection | Code review of interceptor |
| AC-5 | `FORCE ROW LEVEL SECURITY` applied to all RLS tables | `SELECT relforcerowsecurity FROM pg_class WHERE ...` |
| AC-6 | `/docs/infra/row-level-security.md` exists and covers all §6 sections | File present, reviewed |
| AC-7 | Migration is idempotent (policy drop block present) | Re-run `prisma migrate deploy` — no errors |
| AC-8 | Empty-string guard (`<> ''`) present in **every** policy `USING` clause | Code review of migration SQL |

> ⚠️ Do **not** mark this task complete on AC-2 alone. All 8 must pass. TASK-009 will add automated regression coverage.

---

## 8. Files to Create / Modify

| Path | Action |
|---|---|
| `packages/api/prisma/migrations/<timestamp>_rls_policies/migration.sql` | **Create** (via `prisma migrate dev --create-only`) |
| `packages/api/src/common/interceptors/rls-context.interceptor.ts` | **Create** |
| `packages/api/src/app.module.ts` (or CoreModule) | **Modify** — register `RlsContextInterceptor` globally |
| `docs/infra/row-level-security.md` | **Create** |

---

## 9. Out of Scope

- TASK-009's automated proof queries (do not write those here)
- Staff admin `BYPASSRLS` role provisioning (Phase 2)
- RLS on the `Organisation` table itself (orgs don't belong to other orgs — use a simple equality on `id`)
- Any change to Prisma schema files (`.prisma`) — this task is pure SQL + NestJS interceptor

---

## 10. Definition of Done

- [ ] Migration runs cleanly: `pnpm prisma migrate deploy` exits 0
- [ ] All AC-1 through AC-8 passed and documented in PR
- [ ] `RlsContextInterceptor` registered globally and covered by a unit test (spy on `$executeRawUnsafe`, assert correct `SET LOCAL` calls)
- [ ] `/docs/infra/row-level-security.md` merged to `main`
- [ ] PR description includes raw `psql` output from §5 verification
