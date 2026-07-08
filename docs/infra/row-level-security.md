# Row-Level Security (RLS) — LuxTorque

## Overview
Row-Level Security (RLS) is used to enforce tenant isolation at the database layer. This ensures that application bugs or missing authorization checks cannot leak data across organisations.

## Tenancy Model
LuxTorque uses a two-layer tenancy model:
- `org_id` is the top-level tenant boundary for every domain record.
- `branch_id` is the second-level boundary for branch-scoped tables.

Every domain table carries `org_id`; branch-scoped tables also carry `branch_id`.

## Session Variable Contract
The database contract uses session variables to carry tenant context during a transaction:
- `app.org_id` — required for all authenticated requests and every org-scoped policy.
- `app.branch_id` — required for branch-scoped tables in addition to `app.org_id`.

These variables are set by the `RlsContextInterceptor` in the API using `SET LOCAL`, which scopes them to the current transaction only. `SET LOCAL` is used instead of `SET` so tenant context does not leak across pooled connections.

## Policy Structure
Org-scoped tables use the following pattern:

```sql
USING (
  current_setting('app.org_id', true) <> ''
  AND org_id = current_setting('app.org_id', true)::uuid
)
```

Branch-scoped tables use this pattern:

```sql
USING (
  current_setting('app.org_id', true) <> ''
  AND org_id = current_setting('app.org_id', true)::uuid
  AND current_setting('app.branch_id', true) <> ''
  AND branch_id = current_setting('app.branch_id', true)::uuid
)
```

The empty-string guard `<> ''` is critical because `current_setting(..., true)` returns an empty string when the session variable is unset. Without the guard, the policy could behave incorrectly or raise a cast error.

## Tables Covered
The following tables have RLS enabled:
- `organisations` — org scoped
- `branches` — branch scoped
- `users` — org scoped
- `staff_branch_assignments` — branch scoped

## Application Role
- Role name: `luxtorque_app`
- Permissions granted: `CONNECT` on the database, `USAGE` on schema `public`, and `SELECT, INSERT, UPDATE, DELETE` on all tables in schema `public`.

The superuser connection used for migrations bypasses RLS intentionally. Production application requests must use the `luxtorque_app` role so policies are enforced.

## Known Limitations & Bypass Points
- Superuser connections (for example, the migration runner) bypass RLS by design.
- Cross-org admin operations are out of scope for Phase 1 and will be handled by a dedicated `BYPASSRLS` role in a later phase.
- Direct `psql` access without `SET LOCAL` is not tenant-scoped and should be limited to trusted administrative sessions.

## Testing
This task is the RLS implementation layer. Automated regression proof coverage is provided by TASK-009.
