# TASK-007: Generate and apply initial migration

**Depends on:** TASK-006 (`npx prisma validate` passes, `npx prisma generate` passes, PostgreSQL 18 running locally)

## What you're doing and why
This task takes the schema designed in TASK-006 and materialises it as a real database migration,
then seeds the minimum fixture data needed for TASK-009's isolation tests. The seed is not
throw-away scaffolding — it is a contract with TASK-009. Structure and identifiers (email
addresses, branch codes) defined here must remain stable, because isolation tests will query
by them.

Two connection strings are in play:
- **`DATABASE_URL`** — application role (`luxtorque_app`). Used at runtime by NestJS. Has no DDL privileges.
- **`DATABASE_URL_SUPERUSER`** — superuser (`luxtorque`). Required for migrations. Has DDL privileges.

Migrations must run as superuser. Seeds run as the application role to confirm the role has
the access it needs in normal operation.

---

## Steps

### 1. Verify dependencies

Confirm TASK-006 is complete:
```bash
cd apps/api
npx prisma validate    # must exit 0
npx prisma generate    # must exit 0
```

Confirm the local database is healthy:
```bash
bash scripts/db-smoke-test.sh   # must exit 0
```

Confirm both connection strings are in `.env`:
```bash
grep DATABASE_URL .env
grep DATABASE_URL_SUPERUSER .env
```
If either is missing, add it from `.env.example` before continuing.

---

### 2. Install seed dependencies

The seed script needs to hash passwords in a format Better Auth's credential provider
can verify. Better Auth uses **bcrypt** internally. Install `bcryptjs` and its types:

```bash
pnpm --filter @luxtorque/api add bcryptjs
pnpm --filter @luxtorque/api add -D @types/bcryptjs
```

The seed runs via `tsx` (already available as a pnpm workspace tool). If `tsx` is not
present in the workspace, install it:

```bash
pnpm add -D tsx -w
```

---

### 3. Configure the Prisma seed script entry point

Add the following to `apps/api/package.json` so `prisma db seed` knows what to run:

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

---

### 4. Run the initial migration

Migrations require DDL privileges — use `DATABASE_URL_SUPERUSER`:

```bash
cd apps/api
dotenv -e ../../.env -- npx prisma migrate dev \
  --name init \
  --url "$DATABASE_URL_SUPERUSER"
```

If `dotenv-cli` is not available, load the variable directly:
```bash
cd apps/api
export $(grep -v '^#' ../../.env | xargs)
npx prisma migrate dev --name init --url "$DATABASE_URL_SUPERUSER"
```

**What this does:**
- Creates `prisma/migrations/<timestamp>_init/migration.sql`.
- Applies the SQL to the local PostgreSQL 18 instance.
- Records the migration in the `_prisma_migrations` table.

**What to check after it runs:**
- The command exits 0 with no errors.
- `prisma/migrations/<timestamp>_init/migration.sql` exists and is non-empty.
- Running `npx prisma migrate status` shows no pending migrations.

If the migration fails:
- Do not manually patch the SQL file.
- Identify the schema issue, fix `schema.prisma`, then re-run.
- If needed, reset the local DB first: `npx prisma migrate reset --force --url "$DATABASE_URL_SUPERUSER"`.

---

### 5. Verify tables were created

After migration, confirm all expected tables exist:

```bash
psql "$DATABASE_URL_SUPERUSER" -c "
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name;
"
```

Expected tables (at minimum):
```
_prisma_migrations
accounts
branches
organisations
sessions
staff_branch_assignments
users
verifications
```

If any table is missing, the migration did not apply correctly. Do not proceed.

---

### 6. Verify application role access

Confirm `luxtorque_app` can perform reads and writes — not just the superuser:

```bash
psql "$DATABASE_URL" -c "
  SELECT COUNT(*) FROM organisations;
  SELECT COUNT(*) FROM users;
"
```

Both must return `0` (empty tables, migration applied, role has access). If either fails
with a permission error, table-level grants are missing from `db-init.sql` or the migration.
Fix the grant before proceeding — this is the role the application uses at runtime.

---

### 7. Create the seed script

**Path:** `apps/api/prisma/seed.ts`

The seed produces exactly:
- 1 Organisation
- 2 Branches (Nairobi HQ, Mombasa Branch)
- 1 Org Owner user assigned to both branches (home: Nairobi HQ)
- 1 Branch Manager user assigned to Nairobi HQ only — **not** Mombasa Branch

The Branch Manager's absence from Mombasa Branch is intentional. TASK-009 uses this to
assert that a Branch Manager cannot read or mutate data scoped to a branch they are not
assigned to. Do not assign the Branch Manager to Mombasa Branch.

Use **stable, known identifiers** (emails, branch codes) so TASK-009 can look up entities
by these values rather than relying on generated UUIDs.

```typescript
import 'dotenv/config'; // Must be first

import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Stable seed identifiers ────────────────────────────────────────────────
// These values are referenced by TASK-009 isolation tests.
// Do not change them without updating the tests.

export const SEED = {
  org: {
    name: 'LuxTorque Demo Org',
  },
  branches: {
    nairobi: { branchCode: 'NBI-001', name: 'Nairobi HQ' },
    mombasa: { branchCode: 'MSA-001', name: 'Mombasa Branch' },
  },
  users: {
    orgOwner: {
      email: 'owner@luxtorque.dev',
      name: 'Demo Org Owner',
      password: 'Seed_Password_1!',  // Only for local dev fixtures — never reuse in production
      role: 'ORG_ADMIN',
    },
    branchManager: {
      email: 'manager@luxtorque.dev',
      name: 'Demo Branch Manager',
      password: 'Seed_Password_2!',
      role: 'BRANCH_MANAGER',
    },
  },
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 10;

async function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_ROUNDS);
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding database...');

  // ── Wipe in dependency order (safe for local dev only) ───────────────────
  await prisma.$transaction([
    prisma.staffBranchAssignment.deleteMany(),
    prisma.account.deleteMany(),
    prisma.session.deleteMany(),
    prisma.verification.deleteMany(),
    prisma.user.deleteMany(),
    prisma.branch.deleteMany(),
    prisma.organisation.deleteMany(),
  ]);

  // ── Organisation ─────────────────────────────────────────────────────────
  const org = await prisma.organisation.create({
    data: {
      name: SEED.org.name,
      defaultCurrency: 'KES',
      defaultTaxRate: 0.16,    // 16% VAT
      billingPlan: 'FREE',
    },
  });
  console.log(`  ✓ Organisation: ${org.name} (${org.id})`);

  // ── Branches ─────────────────────────────────────────────────────────────
  const branchNairobi = await prisma.branch.create({
    data: {
      orgId: org.id,
      name: SEED.branches.nairobi.name,
      branchCode: SEED.branches.nairobi.branchCode,
      address: 'Waiyaki Way, Westlands, Nairobi, Kenya',
      latitude: -1.2641,
      longitude: 36.8026,
      timeZone: 'Africa/Nairobi',
      status: 'ACTIVE',
      openingHours: {
        monday:    { open: '08:00', close: '18:00' },
        tuesday:   { open: '08:00', close: '18:00' },
        wednesday: { open: '08:00', close: '18:00' },
        thursday:  { open: '08:00', close: '18:00' },
        friday:    { open: '08:00', close: '17:00' },
        saturday:  { open: '09:00', close: '13:00' },
        sunday:    { open: null,    close: null     },
      },
    },
  });
  console.log(`  ✓ Branch: ${branchNairobi.name} (${branchNairobi.branchCode})`);

  const branchMombasa = await prisma.branch.create({
    data: {
      orgId: org.id,
      name: SEED.branches.mombasa.name,
      branchCode: SEED.branches.mombasa.branchCode,
      address: 'Nyali Road, Nyali, Mombasa, Kenya',
      latitude: -4.0234,
      longitude: 39.7237,
      timeZone: 'Africa/Nairobi',
      status: 'ACTIVE',
      openingHours: {
        monday:    { open: '08:00', close: '18:00' },
        tuesday:   { open: '08:00', close: '18:00' },
        wednesday: { open: '08:00', close: '18:00' },
        thursday:  { open: '08:00', close: '18:00' },
        friday:    { open: '08:00', close: '17:00' },
        saturday:  { open: '09:00', close: '13:00' },
        sunday:    { open: null,    close: null     },
      },
    },
  });
  console.log(`  ✓ Branch: ${branchMombasa.name} (${branchMombasa.branchCode})`);

  // ── Users ─────────────────────────────────────────────────────────────────
  const now = new Date();

  const orgOwner = await prisma.user.create({
    data: {
      name: SEED.users.orgOwner.name,
      email: SEED.users.orgOwner.email,
      emailVerified: true,
      orgId: org.id,
      role: SEED.users.orgOwner.role,
      status: 'ACTIVE',
      preferredBranchId: branchNairobi.id,
      createdAt: now,
      updatedAt: now,
    },
  });
  console.log(`  ✓ User: ${orgOwner.name} (${orgOwner.role})`);

  const branchManager = await prisma.user.create({
    data: {
      name: SEED.users.branchManager.name,
      email: SEED.users.branchManager.email,
      emailVerified: true,
      orgId: org.id,
      role: SEED.users.branchManager.role,
      status: 'ACTIVE',
      preferredBranchId: branchNairobi.id,
      createdAt: now,
      updatedAt: now,
    },
  });
  console.log(`  ✓ User: ${branchManager.name} (${branchManager.role})`);

  // ── Better Auth credential accounts ──────────────────────────────────────
  // Passwords are hashed with bcrypt (rounds=10) to match Better Auth's
  // credential provider. These accounts allow seeded users to sign in
  // via the normal auth flow during local development and integration tests.

  await prisma.account.create({
    data: {
      accountId: orgOwner.email,
      providerId: 'credential',
      userId: orgOwner.id,
      password: await hashPassword(SEED.users.orgOwner.password),
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.account.create({
    data: {
      accountId: branchManager.email,
      providerId: 'credential',
      userId: branchManager.id,
      password: await hashPassword(SEED.users.branchManager.password),
      createdAt: now,
      updatedAt: now,
    },
  });
  console.log('  ✓ Credential accounts created');

  // ── Staff branch assignments ───────────────────────────────────────────────
  // Org Owner → Nairobi HQ (home) + Mombasa Branch
  await prisma.staffBranchAssignment.create({
    data: {
      orgId: org.id,
      userId: orgOwner.id,
      branchId: branchNairobi.id,
      role: 'ORG_ADMIN',
      isHomeBranch: true,
    },
  });

  await prisma.staffBranchAssignment.create({
    data: {
      orgId: org.id,
      userId: orgOwner.id,
      branchId: branchMombasa.id,
      role: 'ORG_ADMIN',
      isHomeBranch: false,
    },
  });
  console.log('  ✓ Org Owner assigned to both branches');

  // Branch Manager → Nairobi HQ only.
  // !! DO NOT assign Branch Manager to Mombasa Branch !!
  // TASK-009 isolation tests assert this user cannot access MSA-001 data.
  await prisma.staffBranchAssignment.create({
    data: {
      orgId: org.id,
      userId: branchManager.id,
      branchId: branchNairobi.id,
      role: 'BRANCH_MANAGER',
      isHomeBranch: true,
    },
  });
  console.log('  ✓ Branch Manager assigned to Nairobi HQ only (Mombasa intentionally excluded)');

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\nSeed complete:');
  console.log(`  Organisation : ${org.name}`);
  console.log(`  Branches     : ${branchNairobi.branchCode}, ${branchMombasa.branchCode}`);
  console.log(`  Org Owner    : ${orgOwner.email}`);
  console.log(`  Branch Mgr   : ${branchManager.email} (NBI-001 only)`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

---

### 8. Run the seed

```bash
cd apps/api
npx prisma db seed
```

The seed connects as the **application role** (`DATABASE_URL`). If the seed fails with a
permission error, the application role is missing table-level grants — fix the grant issue
before continuing. Do not run the seed as the superuser to paper over a permissions bug.

---

### 9. Verify seed output

Run these queries to confirm the fixture is exactly correct:

```bash
psql "$DATABASE_URL" << 'SQL'
-- 1. One organisation
SELECT id, name, default_currency FROM organisations;

-- 2. Two branches, both under the same org
SELECT id, org_id, branch_code, name FROM branches ORDER BY branch_code;

-- 3. Two users, both ORG_ADMIN and BRANCH_MANAGER
SELECT id, email, role, org_id FROM users ORDER BY role;

-- 4. Assignments: org owner has 2, branch manager has 1
SELECT u.email, sba.branch_id, b.branch_code, sba.role, sba.is_home_branch
FROM staff_branch_assignments sba
JOIN users u ON u.id = sba.user_id
JOIN branches b ON b.id = sba.branch_id
ORDER BY u.email, b.branch_code;

-- 5. Confirm branch manager is NOT assigned to MSA-001
SELECT COUNT(*) AS "should_be_0"
FROM staff_branch_assignments sba
JOIN users u ON u.id = sba.user_id
JOIN branches b ON b.id = sba.branch_id
WHERE u.email = 'manager@luxtorque.dev'
  AND b.branch_code = 'MSA-001';

-- 6. Two credential accounts exist
SELECT account_id, provider_id, user_id FROM accounts;
SQL
```

Query 5 must return `0`. Any other value is a seed bug — fix it before marking done.

---

### 10. Add a `db:seed` script to root `package.json`

```json
"scripts": {
  "db:seed": "pnpm --filter @luxtorque/api exec prisma db seed",
  "db:migrate": "pnpm --filter @luxtorque/api exec prisma migrate dev",
  "db:reset": "pnpm --filter @luxtorque/api exec prisma migrate reset --force"
}
```

---

### 11. Add seed safety guard

The wipe at the top of the seed is safe locally but dangerous if accidentally run against
staging or production. Add a guard as the very first thing in `main()`, before the
`deleteMany` block:

```typescript
async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed must never run in production. Exiting.');
  }
  // ... rest of seed
}
```

---

## Acceptance criteria (all must be true before marking done)

- [ ] `npx prisma migrate dev --name init --url "$DATABASE_URL_SUPERUSER"` exits 0.
- [ ] `prisma/migrations/<timestamp>_init/migration.sql` exists and is non-empty.
- [ ] `npx prisma migrate status` reports no pending migrations.
- [ ] All eight expected tables exist in the `public` schema.
- [ ] `psql "$DATABASE_URL"` (application role) can `SELECT` from all tables without permission errors.
- [ ] `apps/api/prisma/seed.ts` exists with the production guard as the first statement in `main()`.
- [ ] `npx prisma db seed` exits 0 with no errors.
- [ ] Seed produces exactly 1 organisation, 2 branches, 2 users, 3 staff branch assignments, 2 accounts.
- [ ] `manager@luxtorque.dev` has **zero** assignments to `MSA-001` (verified by query 5 above).
- [ ] `apps/api/package.json` has `"prisma": { "seed": "tsx prisma/seed.ts" }`.
- [ ] Root `package.json` has `db:seed`, `db:migrate`, and `db:reset` scripts.
- [ ] `bcryptjs` is installed as a dependency; `@types/bcryptjs` as a devDependency.
- [ ] `pnpm test` still passes across all packages (no regressions).

---

## What not to do

- Do not run migrations as the application role (`DATABASE_URL`) — it has no DDL privileges.
- Do not manually edit the generated `migration.sql` file — fix schema issues in `schema.prisma` instead.
- Do not assign the Branch Manager to Mombasa Branch — this breaks TASK-009 isolation tests.
- Do not use hardcoded UUIDs for seeded entities — let Prisma generate them; tests look up by email and branch code.
- Do not run the seed as the superuser — if it fails with permission errors, fix the grants.
- Do not skip the production guard — the seed performs `deleteMany` and must never run in production.
- Do not write RLS policies yet — that is TASK-008.
- Do not proceed to TASK-008 until every acceptance criterion above is checked.
