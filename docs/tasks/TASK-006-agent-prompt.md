# TASK-006: Design core schema — Organisation, Branch, StaffBranchAssignment, User `[ISOLATION-CRITICAL]`

**Depends on:** TASK-004 (PostgreSQL 18 running locally), TASK-005 (multi-currency scope decision recorded)

## What you're doing and why
This task produces the Prisma schema for the four foundational tables that every other module
in LuxTorque builds on. Getting this wrong propagates into every future migration — treat it
with the same care as a public API contract.

Authentication is handled by **Better Auth**. Rather than manually writing Better Auth's
required tables (`User`, `Session`, `Account`, `Verification`) — which risks field names or
types drifting out of sync with the library — use the **Better Auth CLI** to generate them.
The CLI reads your auth config and outputs the exact Prisma schema additions the installed
version of Better Auth expects.

Your responsibility in this task is:
1. Write a minimal Better Auth config so the CLI can generate the auth tables.
2. Run the CLI to generate those tables into `schema.prisma`.
3. Extend the generated `User` model with LuxTorque domain fields.
4. Manually write the remaining domain tables (`Organisation`, `Branch`, `StaffBranchAssignment`).

Do not write RLS policies in this task. Do not write migrations. Do not write application code.
Schema definition only.

---

## Steps

### 1. Verify dependencies

**TASK-004:** Confirm PostgreSQL 18 is running:
```bash
bash scripts/db-smoke-test.sh
```
If it exits non-zero, stop and resolve TASK-004 before continuing.

**TASK-005:** Read `/docs/decisions/0002-multi-currency-scope.md`.
Note whether the decision is **A** (required), **B** (defer), or **C** (nullable, no logic).
The `Branch` schema differs based on this — do not default to any option.
If the file doesn't exist, stop. TASK-005 is incomplete.

---

### 2. Install Better Auth

```bash
pnpm --filter @luxtorque/api add better-auth
```

Confirm the installed version:
```bash
pnpm --filter @luxtorque/api list better-auth
```
Record the version — it determines what the CLI generates. If the version changes later,
re-run the CLI and re-validate the schema.

---

### 3. Create a minimal Better Auth config for schema generation

Better Auth's CLI reads your auth config to know which tables and fields to generate.
The config created here is intentionally minimal — it is the source of truth for schema
generation only. Full auth configuration (cookies, CORS, guards) is TASK-008.

**Path:** `apps/api/src/lib/auth.ts`

```typescript
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
// PrismaClient is imported for type inference by the CLI only — not instantiated here.
// Full Prisma setup is done in TASK-008.
import { PrismaClient } from '@prisma/client';

export const auth = betterAuth({
  database: prismaAdapter(new PrismaClient(), {
    provider: 'postgresql',
  }),

  // LuxTorque domain fields added to the User model.
  // The CLI will include these in the generated schema so they are
  // co-located with Better Auth fields from the start.
  user: {
    additionalFields: {
      orgId: {
        type: 'string',
        required: false,    // Nullable: orgId is assigned after user creation during onboarding.
        input: false,       // Not accepted from the client directly.
      },
      role: {
        type: 'string',
        required: false,
        defaultValue: 'STAFF',
        input: false,
      },
      phone: {
        type: 'string',
        required: false,
      },
      status: {
        type: 'string',
        required: false,
        defaultValue: 'ACTIVE',
        input: false,
      },
      preferredBranchId: {
        type: 'string',
        required: false,
        input: false,
      },
    },
  },
});
```

> **Note on `orgId` being nullable:** Better Auth creates the `User` row before org assignment
> completes during the registration flow. A user with `orgId IS NULL` is in an invalid state
> and must be rejected by auth middleware — this is enforced in TASK-008, not here.

---

### 4. Initialise the Prisma schema with generator and datasource

Create `/apps/api/prisma/schema.prisma` with only the generator and datasource blocks.
The Better Auth CLI will append to this file in the next step.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}
```

---

### 5. Run the Better Auth CLI to generate auth tables

```bash
cd apps/api
pnpm dlx auth@latest generate
```

The CLI will append the `User`, `Session`, `Account`, and `Verification` models to
`schema.prisma`, including the `additionalFields` declared in the config (`orgId`, `role`,
`phone`, `status`, `preferredBranchId`).

After the CLI runs:
- Read the generated output in full before proceeding.
- Confirm all five `additionalFields` are present on the `User` model.
- Confirm the four Better Auth models (`User`, `Session`, `Account`, `Verification`) exist.
- Do not edit any Better Auth field names or types — if something looks wrong, check the
  Better Auth docs for the installed version rather than patching it manually.

---

### 6. Add `@@map` directives to Better Auth models

The CLI generates models without `@@map`. Add `@@map` to each Better Auth model to follow
the project's snake_case_plural table naming convention:

```prisma
model User {
  // ... (generated fields — do not touch)
  @@map("users")
}

model Session {
  // ... (generated fields — do not touch)
  @@map("sessions")
}

model Account {
  // ... (generated fields — do not touch)
  @@map("accounts")
}

model Verification {
  // ... (generated fields — do not touch)
  @@map("verifications")
}
```

`@@map` is the only addition permitted on Better Auth models. Do not add, remove, or rename
any other field.

---

### 7. Add relations to the generated User model

The CLI generates the `User` model but cannot know about LuxTorque's domain relations.
Add the following relation fields to the generated `User` model — appended after the
generated fields, before the closing brace:

```prisma
  // ── LuxTorque relations (added after CLI generation) ──────────────────────
  organisation      Organisation?          @relation(fields: [orgId], references: [id])
  preferredBranch   Branch?                @relation("UserPreferredBranch", fields: [preferredBranchId], references: [id])
  branchAssignments StaffBranchAssignment[]
```

These are relation fields only — no new scalar columns. The scalar columns (`orgId`,
`preferredBranchId`) were already generated by the CLI from `additionalFields`.

---

### 8. Append LuxTorque domain tables

After the Better Auth section, append the following to `schema.prisma`.
Separate the two sections with a clear comment divider.

```prisma
// ─────────────────────────────────────────────────────────────────────────────
// LUXTORQUE DOMAIN TABLES
// All tables must carry org_id per SRS §2.1 and NFR-SEC-05 — no exceptions.
// Branch-scoped tables must also carry branch_id.
// ─────────────────────────────────────────────────────────────────────────────

model Organisation {
  id              String      @id @default(uuid(7))
  name            String
  logoUrl         String?
  defaultCurrency String      @default("KES") @db.VarChar(3)  // ISO 4217
  defaultTaxRate  Decimal     @default(0)      @db.Decimal(5, 4)
  billingPlan     BillingPlan @default(FREE)
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  branches        Branch[]
  users           User[]

  @@map("organisations")
}

model Branch {
  id               String       @id @default(uuid(7))
  orgId            String                                        // SRS §2.1 — required on all tables
  name             String
  branchCode       String                                        // Short unique code within org, e.g. "NBI-001"
  address          String
  latitude         Decimal?     @db.Decimal(10, 7)
  longitude        Decimal?     @db.Decimal(10, 7)
  timeZone         String                                        // IANA tz string e.g. "Africa/Nairobi"
  // ── Multi-currency fields — apply TASK-005 decision here (see step 9) ────
  currencyOverride String?      @db.VarChar(3)                  // ISO 4217
  taxRateOverride  Decimal?     @db.Decimal(5, 4)
  // ─────────────────────────────────────────────────────────────────────────
  status           BranchStatus @default(ACTIVE)
  openingHours     Json?
  createdAt        DateTime     @default(now())
  updatedAt        DateTime     @updatedAt

  organisation     Organisation           @relation(fields: [orgId], references: [id])
  staffAssignments StaffBranchAssignment[]
  preferredByUsers User[]                 @relation("UserPreferredBranch")

  @@unique([orgId, branchCode])
  @@map("branches")
}

model StaffBranchAssignment {
  id             String    @id @default(uuid(7))
  orgId          String                                          // Denormalised for RLS — must match user.orgId and branch.orgId
  branchId       String
  userId         String
  role           UserRole
  isHomeBranch   Boolean   @default(false)
  coverStartDate DateTime?
  coverEndDate   DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  branch         Branch    @relation(fields: [branchId], references: [id], onDelete: Cascade)

  @@unique([userId, branchId, role])
  @@map("staff_branch_assignments")
}

// ─────────────────────────────────────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────────────────────────────────────

enum UserRole {
  SUPER_ADMIN       // Platform-level — not scoped to an org
  ORG_ADMIN         // Full org access
  BRANCH_MANAGER    // Full access to assigned branches
  STAFF             // Day-to-day operations at assigned branches
  TECHNICIAN        // Workshop / service tasks at assigned branches
  SALES_AGENT       // Parts and vehicle sales at assigned branches
  CUSTOMER          // Self-service portal access
}

enum UserStatus {
  ACTIVE
  INACTIVE
  SUSPENDED
}

enum BranchStatus {
  ACTIVE
  INACTIVE
  TEMPORARILY_CLOSED
}

enum BillingPlan {
  FREE
  STARTER
  PROFESSIONAL
  ENTERPRISE
}
```

---

### 9. Apply the TASK-005 currency decision to Branch

Re-read `/docs/decisions/0002-multi-currency-scope.md` and apply exactly one modification:

**Decision A (include, required):**
Remove `?` from both fields — they become non-nullable required columns.
```prisma
currencyOverride String     @db.VarChar(3)
taxRateOverride  Decimal    @db.Decimal(5, 4)
```

**Decision B (defer):**
Remove both fields entirely and add:
```prisma
// TODO(TASK-005-B): currencyOverride and taxRateOverride deferred to a future phase.
// When adding: update RLS policies and any financial calculation services.
```

**Decision C (nullable, no logic):**
Leave both fields as nullable and add:
```prisma
// TODO(TASK-005-C): currencyOverride and taxRateOverride present but not yet
// validated or enforced. Implement in a future phase.
```

---

### 10. Add the OpeningHours TypeScript interface to shared types

`Branch.openingHours` is untyped JSON in the database. Pin the expected shape in
`/packages/shared/src/types/branch.ts` so every consumer has a contract:

```typescript
export interface OpeningHours {
  [day: string]: {          // 'monday' | 'tuesday' | ... | 'sunday'
    open: string | null;    // ISO 8601 time e.g. "08:00", null if closed
    close: string | null;
  };
}
```

Export it from `/packages/shared/src/index.ts`.

---

### 11. Create `/docs/decisions/0003-better-auth-schema-deviations.md`

```markdown
# 0003 — Schema Deviations from SRS: Better Auth Integration

**Status:** Accepted
**Date:** YYYY-MM-DD

## Context
Authentication is handled by Better Auth (version X.Y.Z). Better Auth's CLI generates the
`users`, `sessions`, `accounts`, and `verifications` tables. Where Better Auth's generated
schema conflicts with the SRS data dictionary (§7), Better Auth wins and the deviation
is recorded here.

## Deviations

### 1. `password_hash` absent from `users`
**SRS field:** `User.password_hash`
**Action:** Field not present — intentionally omitted.
**Reason:** Better Auth stores hashed credentials in `accounts.password` via its credential
provider. A separate `password_hash` on `users` would be an unused, parallel credential
store. Do not add it. Do not read `accounts.password` directly — use Better Auth's API.

### 2. Better Auth adds fields not in the SRS `User` spec
**Added fields:** `emailVerified` (Boolean), `image` (String?), `updatedAt` (DateTime)
**Reason:** Required by the Better Auth Prisma adapter — generated by the CLI.
**Impact:** Additive only. `emailVerified` supports future email verification flows.

### 3. Three new tables not in the SRS
**Tables:** `sessions`, `accounts`, `verifications`
**Reason:** Required by Better Auth for session management, provider linking, and token
verification. These tables are managed exclusively by Better Auth. Do not write
application code that reads or writes to them directly.

### 4. `users.org_id` is nullable
**SRS field:** `User.org_id` (implied non-null)
**Action:** `orgId` is nullable.
**Reason:** Better Auth creates the user row before org assignment completes during
registration. A user with `orgId IS NULL` is invalid and must be rejected by auth
middleware — enforced in TASK-008.

### 5. Schema generated by CLI, not hand-written
**Reason:** Using the Better Auth CLI ensures the schema stays in sync with the installed
library version. If Better Auth is upgraded, re-run `npx @better-auth/cli generate` and
re-validate. Do not manually patch Better Auth table fields between versions.
```

---

### 12. Validate the complete schema

```bash
cd apps/api

# Validate schema structure
npx prisma validate

# Generate Prisma client (confirms no generation errors)
npx prisma generate
```

Resolve every error before marking done. Do not run `prisma migrate` — that is TASK-007.

---

### 13. Cross-check against SRS §7

For every field in the SRS data dictionary for `Organisation`, `Branch`,
`StaffBranchAssignment`, and `User`, confirm exactly one of:

- **Present** — field exists in the schema with an equivalent name and compatible type.
- **Renamed** — field exists under a different name (camelCase); a comment on the field notes the SRS name.
- **Deviated** — field is absent or changed; a decision record exists explaining why.

Any field simply missing without a decision record is a bug. Resolve it before marking done.

---

## Acceptance criteria (all must be true before marking done)

- [ ] `better-auth` is installed in `@luxtorque/api`.
- [ ] `apps/api/src/lib/auth.ts` exists with the minimal Better Auth config and all five `additionalFields`.
- [ ] The Better Auth CLI was used to generate auth tables — they were not hand-written.
- [ ] `npx prisma validate` exits 0 with no errors.
- [ ] `npx prisma generate` completes without errors.
- [ ] All five `additionalFields` (`orgId`, `role`, `phone`, `status`, `preferredBranchId`) are present on the generated `User` model.
- [ ] `@@map` directives are added to all four Better Auth models (`users`, `sessions`, `accounts`, `verifications`).
- [ ] No Better Auth field was renamed, removed, or had its type changed beyond adding `@@map`.
- [ ] `Organisation`, `Branch`, and `StaffBranchAssignment` are defined in the domain section.
- [ ] Every LuxTorque domain table carries `orgId` as a non-nullable foreign key to `Organisation`.
- [ ] `StaffBranchAssignment` carries both `orgId` and `branchId`.
- [ ] `password_hash` does not appear anywhere in the schema.
- [ ] `Branch` multi-currency fields reflect the exact TASK-005 decision (A, B, or C).
- [ ] `/docs/decisions/0003-better-auth-schema-deviations.md` exists with all five deviations documented.
- [ ] `OpeningHours` TypeScript interface is exported from `@luxtorque/shared`.
- [ ] All SRS §7 fields are accounted for — present, renamed, or explicitly deviated.
- [ ] `pnpm typecheck` passes across all packages.
- [ ] No RLS policies, migrations, or application code were written.

---

## What not to do

- Do not hand-write the Better Auth tables (`User`, `Session`, `Account`, `Verification`) — use the CLI.
- Do not rename, remove, or change the type of any Better Auth generated field (only `@@map` is permitted).
- Do not add `password_hash` to the `User` model.
- Do not run `prisma migrate` — schema definition only in this task.
- Do not write RLS policies — that is TASK-007.
- Do not write NestJS modules, services, or auth handlers — that is TASK-008.
- Do not guess the TASK-005 currency decision — read the decision file.
- Do not query or write to `sessions`, `accounts`, or `verifications` in application code.
- Do not proceed to TASK-007 until every acceptance criterion above is checked.
