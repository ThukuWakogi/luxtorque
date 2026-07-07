# LuxTorque Ltd — Phase 1 Foundation
## AI Agent Task List

**Source:** LuxTorque Ltd SRS v2.0 + Phase 1 Kickoff Charter (Weeks 1–5)
**Audience:** An AI coding agent (e.g. Claude Code) executing tasks autonomously or semi-autonomously, one at a time, in order.
**Phase objective:** Stand up authentication, RBAC, and a branch-aware data model with organisation/branch scoping enforced at the data-access layer. No other module may be built until this layer is correct.

---

## How to use this list

- Tasks are ordered by dependency. Do not start a task until its `Depends On` task(s) are marked complete.
- Each task has explicit **Acceptance Criteria** — do not mark a task done until every criterion is verifiably true. Where possible, write an automated test that proves it.
- If a task is ambiguous or a required decision (e.g. cloud provider) hasn't been made, stop and ask rather than assuming.
- Tasks tagged `[ISOLATION-CRITICAL]` touch branch/organisation data scoping. Treat these with extra care — a bug here is a data-leak risk, not just a functional bug (per SRS NFR-SEC-05, AC-08).
- After completing a task, run the project's full test suite, not just new tests, before moving to the next task.

---

## Week 1 — Environment & Decisions

### TASK-001: Confirm and document cloud provider decision
**Depends on:** —
**Do:**
1. Check the repo for any existing infra-as-code, `.env.example`, or docs indicating AWS or GCP has already been chosen.
2. If undecided, do not pick one yourself — stop and ask the user which provider to target.
3. Once known, create `/docs/decisions/0001-cloud-provider.md` recording the choice and a one-line rationale.

**Acceptance criteria:**
- [ ] `/docs/decisions/0001-cloud-provider.md` exists and names exactly one provider (AWS or GCP).
- [ ] No infra code references both providers ambiguously.

---

### TASK-002: Initialize repository structure and branch strategy
**Depends on:** TASK-001
**Do:**
1. Create the repo skeleton: `/apps/web` (React 18+/TypeScript frontend), `/apps/api` (Node.js/Express or NestJS backend, TypeScript), `/packages/shared` (shared types, e.g. `Organisation`, `Branch` interfaces).
2. Add root `package.json` with workspaces config, `.gitignore`, `.editorconfig`, `README.md` with setup instructions.
3. Document branch strategy (e.g. trunk-based with `main` + short-lived feature branches) in `/docs/CONTRIBUTING.md`.
4. Set up PR template at `.github/PULL_REQUEST_TEMPLATE.md` requiring: description, linked SRS requirement IDs (e.g. `FR-AUTH-01`), and a checklist item confirming branch-isolation impact has been considered.

**Acceptance criteria:**
- [ ] Repo builds with a single `npm install` at root.
- [ ] `/apps/web`, `/apps/api`, `/packages/shared` all exist with minimal valid TypeScript entry points.
- [ ] PR template includes a branch-isolation impact checklist item.

---

### TASK-003: Stand up CI/CD pipeline skeleton
**Depends on:** TASK-002
**Do:**
1. Add CI config (GitHub Actions or equivalent) that on every PR: installs deps, lints, type-checks, runs unit tests.
2. Add a separate job that runs on merge to `main`: builds Docker images for `/apps/web` and `/apps/api`.
3. Do not implement deployment yet — that depends on TASK-001's infra decision being acted on later. Stub the deploy job with a clear `TODO` and a failing placeholder test so it can't be silently skipped.

**Acceptance criteria:**
- [ ] Opening a PR triggers lint + typecheck + test jobs automatically.
- [ ] A deliberately broken PR (failing test) is blocked from merging.
- [ ] CI config is committed at `.github/workflows/ci.yml` (or equivalent).

---

### TASK-004: Provision PostgreSQL 15+ (local + staging)
**Depends on:** TASK-001
**Do:**
1. Add a `docker-compose.yml` for local PostgreSQL 15+.
2. Document staging DB provisioning steps in `/docs/infra/database.md` (do not provision cloud staging resources yourself unless you have credentials and explicit permission — otherwise document the exact steps for a human to run).
3. Confirm `psql` connectivity locally via a smoke-test script `/scripts/db-smoke-test.sh`.

**Acceptance criteria:**
- [ ] `docker-compose up` brings up a working local Postgres 15+ instance.
- [ ] Smoke-test script connects successfully and exits 0.

---

### TASK-005: Confirm multi-currency / multi-tax-jurisdiction scope for Phase 1
**Depends on:** —
**Do:**
1. This is a scope decision, not a coding task. Surface it to the user/PM explicitly: "SRS §1.4 states an organisation may operate branches in more than one currency or tax jurisdiction — confirm this must be modeled in the Phase 1 schema (TASK-006), or whether it can be deferred."
2. Record the answer in `/docs/decisions/0002-multi-currency-scope.md`.
3. Do not proceed to TASK-006's schema design until this is answered, since it affects whether `Branch.currency_override` / `Branch.tax_rate_override` are required fields in Phase 1 or can be added later.

**Acceptance criteria:**
- [ ] `/docs/decisions/0002-multi-currency-scope.md` exists with an explicit yes/no/deferred answer.

---

## Week 2 — Core Data Model

### TASK-006: Design core schema — Organisation, Branch, Staff Branch Assignment, User `[ISOLATION-CRITICAL]`
**Depends on:** TASK-004, TASK-005
**Do:**
1. Using the SRS data dictionary (§7) as the source of truth, design Prisma schema for:
   - `Organisation` (org_id, name, logo_url, default_currency, default_tax_rate, billing_plan, created_at)
   - `Branch` (branch_id, org_id, name, branch_code, address, latitude, longitude, time_zone, currency_override, tax_rate_override, status, opening_hours JSON, created_at)
   - `StaffBranchAssignment` (assignment_id, user_id, branch_id, role, is_home_branch, cover_start_date, cover_end_date)
   - `User` (user_id, org_id, role, name, email, password_hash, phone, status, preferred_branch_id, created_at)
2. Every operational table must carry both `org_id` and (where applicable) `branch_id` as foreign keys — no exceptions, per SRS §2.1.
3. Write this as a Prisma schema file at `/apps/api/prisma/schema.prisma`.
4. Do not write RLS policies yet — that's TASK-007.

**Acceptance criteria:**
- [ ] Schema compiles with `npx prisma validate`.
- [ ] Every table has `org_id`; every branch-scoped table also has `branch_id`.
- [ ] Schema matches the SRS data dictionary field-for-field (flag and document any deliberate deviation).

---

### TASK-007: Generate and apply initial migration
**Depends on:** TASK-006
**Do:**
1. Run `prisma migrate dev` to generate the initial migration.
2. Apply it to the local DB from TASK-004.
3. Seed a minimal fixture: 1 organisation, 2 branches, 1 Org Owner user, 1 Branch Manager assigned to one branch only. This fixture will be reused by the isolation tests in TASK-009.

**Acceptance criteria:**
- [ ] Migration applies cleanly to a fresh database with no manual intervention.
- [ ] Seed script at `/apps/api/prisma/seed.ts` runs successfully and produces the fixture described above.

---

### TASK-008: Implement row-level security (RLS) policies `[ISOLATION-CRITICAL]`
**Depends on:** TASK-007
**Do:**
1. Write PostgreSQL RLS policies so that `org_id` (and `branch_id` where applicable) filtering happens at the database layer, not solely in application code, per SRS NFR-SEC-05.
2. Policies must ensure: a session/connection scoped to Organisation A can never read or write rows belonging to Organisation B, regardless of application-layer bugs.
3. Document the RLS approach (e.g. session variables set per request, `current_setting('app.org_id')`) in `/docs/infra/row-level-security.md`.
4. This is the single highest-risk task in Phase 1 — do not mark it complete based on manual spot-checks alone. TASK-009 will write automated proof.

**Acceptance criteria:**
- [ ] RLS is enabled on every table carrying `org_id`.
- [ ] A manual `psql` test as a non-superuser, scoped to Org A, attempting to `SELECT` a row belonging to Org B, returns zero rows (not an error — RLS should make the row invisible, not throw).
- [ ] Approach documented in `/docs/infra/row-level-security.md`.

---

### TASK-009: Write the first branch-isolation automated test `[ISOLATION-CRITICAL]`
**Depends on:** TASK-008
**Do:**
1. Using the seed fixture from TASK-007, write an automated integration test that:
   - Authenticates as the Branch Manager scoped to Branch A only.
   - Attempts to read, update, and delete a record belonging to Branch B (the sibling branch), including by direct ID manipulation (not just by listing/filter endpoints).
   - Asserts every attempt is rejected — either invisible (RLS) or explicitly denied (403), never silently succeeding.
2. Place this test where it will run on every CI build (TASK-003), not as a one-off script.
3. This is the seed of the full isolation suite called for in SRS NFR-SEC-08 / AC-08 — do not treat it as throwaway. Build it to be extended in Week 4 (TASK-014).

**Acceptance criteria:**
- [ ] Test exists in the CI-run test suite (e.g. `/apps/api/tests/isolation/branch-scope.test.ts`).
- [ ] Test fails if RLS or scoping is broken (verify by temporarily disabling RLS and confirming the test catches it, then re-enabling).
- [ ] Test passes against the current implementation.

---

### TASK-010: QA review of schema and isolation approach
**Depends on:** TASK-008, TASK-009
**Do:**
1. This is a review checkpoint, not a coding task. Summarize the schema, RLS approach, and isolation test coverage for QA Lead review.
2. Surface any known gaps explicitly rather than presenting the work as complete if it isn't.
3. Do not proceed to Week 3 until this checkpoint is acknowledged (by the user, standing in for QA Lead, if no separate review process exists).

**Acceptance criteria:**
- [ ] A written summary exists (can be a PR description or `/docs/reviews/week2-schema-review.md`).
- [ ] Explicit sign-off or list of required follow-ups is recorded before Week 3 tasks begin.

---

## Week 3 — Authentication

### TASK-011: Customer registration (email/password + OAuth scaffolding)
**Depends on:** TASK-007
**Do:**
1. Implement `FR-AUTH-01`: customer registration via email+password, creating one `User` record at the organisation level (no `branch_id` on the user itself — branch association is via `preferred_branch_id` only, per the schema).
2. Implement password complexity rules per `FR-AUTH-03` (min 8 chars, upper, lower, digit, symbol) — validate server-side, not just client-side.
3. Scaffold OAuth (Google, Facebook) provider config and callback routes per `FR-AUTH-01`. Full OAuth credential setup may require user-provided API keys — stop and ask if these aren't available rather than hardcoding placeholders that look real.
4. Implement email verification (`FR-AUTH-02`): tokenised link, account inactive until verified.

**Acceptance criteria:**
- [ ] A new customer can register with email+password and cannot log in until email is verified.
- [ ] Weak passwords are rejected server-side with a clear error.
- [ ] OAuth routes exist and are documented as scaffolded/pending-credentials if not fully wired.

---

### TASK-012: Staff authentication (password + 2FA)
**Depends on:** TASK-007
**Do:**
1. Implement `FR-AUTH-07`: staff accounts can only be created by Org Owner, Super Admin, or delegated Branch Manager — no self-registration endpoint exists for staff.
2. Every staff account must be created with at least one `StaffBranchAssignment` at creation time — enforce this as a database/application constraint, not just a UI nudge.
3. Implement `FR-AUTH-08`: email + password + optional TOTP 2FA for staff login.
4. Implement session expiry per `FR-AUTH-09`: 8 hours inactivity for staff, 30 days with refresh for customers.

**Acceptance criteria:**
- [ ] Attempting to create a staff account with zero branch assignments fails with a clear error.
- [ ] Staff session expires after 8 hours of inactivity (test with a mocked clock, not a real 8-hour wait).
- [ ] 2FA can be enabled and enforced on login when configured.

---

### TASK-013: Login rate limiting and password reset
**Depends on:** TASK-011, TASK-012
**Do:**
1. Implement `FR-AUTH-04`: 5 failed login attempts → 15-minute lockout, applied per-account.
2. Implement `FR-AUTH-05`: "Forgot Password" flow sends a time-limited OTP to the registered email.
3. Implement `NFR-SEC-02`: passwords hashed with bcrypt (cost ≥ 12) or Argon2id — never plaintext, never reversible encryption.

**Acceptance criteria:**
- [ ] 6th consecutive failed login attempt within the lockout window is rejected even with the correct password.
- [ ] OTP for password reset expires after a defined window and cannot be reused.
- [ ] Inspecting the database directly shows only hashed passwords, never plaintext.

---

## Week 4 — RBAC & Branch Scoping

### TASK-014: RBAC middleware (role-based) `[ISOLATION-CRITICAL]`
**Depends on:** TASK-012
**Do:**
1. Implement role-based gating on every API endpoint per the roles defined in SRS §2.2 (Org Owner/Super Admin, Branch Manager, Admin Branch-Scoped, Service Technician, Sales Agent, Customer, Guest).
2. Gate UI elements correspondingly on the frontend (hide/disable actions the current role cannot perform) — but treat this as a UX nicety, not a security boundary. The API-layer check is the real control.

**Acceptance criteria:**
- [ ] Every API endpoint has an explicit role check; there is no endpoint reachable by an unauthenticated or under-permissioned role by omission.
- [ ] A test exists asserting that each role can/cannot hit a representative sample of endpoints as expected.

---

### TASK-015: Branch-scope enforcement on top of RBAC `[ISOLATION-CRITICAL]`
**Depends on:** TASK-014, TASK-009
**Do:**
1. Implement `FR-AUTH-10`: every request is evaluated against role AND branch scope. A request for a resource outside the user's assigned branch(es) is rejected with 403, independent of whether the role would otherwise permit the action.
2. Implement branch context resolution per SRS §2.1: every request carries an active branch context (from session/home branch for staff, from selection for customers).
3. Extend the isolation test suite from TASK-009 to cover this middleware specifically — including the ID-enumeration case (a branch-scoped admin guessing another branch's resource ID).

**Acceptance criteria:**
- [ ] A Branch-A-scoped Admin hitting any Branch-B resource by ID receives 403, even when their role would normally permit that action type.
- [ ] Isolation test suite (TASK-009) is extended to assert this for every applicable endpoint, not just a single example.

---

### TASK-016: Branch switcher and "All Branches" context for multi-branch staff
**Depends on:** TASK-015
**Do:**
1. Implement `FR-AUTH-11`: staff assigned to multiple branches get a branch switcher; active branch persists for the session and scopes subsequent reads/writes.
2. Implement `FR-AUTH-12`: Org Owners/Super Admins get an "All Branches" context for consolidated views. Any write action attempted in "All Branches" context that is inherently branch-scoped (e.g. creating a booking) must require an explicit branch selection before submission — it cannot silently default to a branch.

**Acceptance criteria:**
- [ ] Switching branch context changes subsequent API responses (e.g. inventory list) without requiring re-login.
- [ ] Attempting a branch-scoped write while in "All Branches" context without an explicit branch selection is blocked with a clear error, not silently assigned.

---

## Week 5 — Admin User Management & Phase Close-Out

### TASK-017: Admin user management UI (Org Owner + Branch Manager)
**Depends on:** TASK-016
**Do:**
1. Build the minimal admin UI for `FR-ADM-13`: create, edit roles, assign/change branch access, reset passwords, deactivate staff accounts.
2. Scope visible/actionable users by the acting admin's own branch scope — a Branch Manager should not be able to manage staff at a branch they're not assigned to.

**Acceptance criteria:**
- [ ] Org Owner can create a staff account, assign role + branch(es), and deactivate it.
- [ ] A Branch Manager attempting to manage a staff member at a branch outside their assignment is blocked.

---

### TASK-018: Branch configuration audit log
**Depends on:** TASK-017
**Do:**
1. Implement `FR-BR-06` / `FR-ADM-14`: record who, what, when, and before/after values for branch configuration and staff assignment changes.
2. Store as the `BranchAuditLog` entity per the SRS data dictionary.

**Acceptance criteria:**
- [ ] Changing a staff member's branch assignment produces an audit log entry with before/after values.
- [ ] Audit log entries are immutable (no update/delete endpoint exposed for them).

---

### TASK-019: Run full branch-isolation test suite and remediate findings `[ISOLATION-CRITICAL]`
**Depends on:** TASK-015, TASK-017, TASK-018
**Do:**
1. Run the complete isolation suite built incrementally across TASK-009 → TASK-015 against the full Week 1–5 surface area (auth, RBAC, branch scoping, admin user management, audit log).
2. Fix every finding before proceeding. Do not defer isolation findings to a later phase — this is the explicit point of building the suite early (see kickoff charter risk register).
3. Produce a short findings-and-fixes summary at `/docs/reviews/week5-isolation-results.md`.

**Acceptance criteria:**
- [ ] Full isolation suite passes with zero known failures.
- [ ] Findings summary is committed, even if the answer is "no findings."

---

### TASK-020: Phase 1 demo and go/no-go checkpoint
**Depends on:** TASK-019
**Do:**
1. Prepare a walkthrough (script or recorded demo) showing each Phase 1 success criterion from the kickoff charter being met:
   - CI/CD live and gating merges
   - Staff and customer registration/login working, correctly org/branch-scoped
   - Schema + RLS in place
   - Isolation test passing
   - RBAC rejecting out-of-scope requests with 403
   - Admin user management functional for Org Owner and Branch Manager
2. Do not declare Phase 1 complete yourself — present the evidence and explicitly ask the user/PM for the go/no-go decision before starting Phase 2 (branch onboarding wizard).

**Acceptance criteria:**
- [ ] Each Phase 1 success criterion has a corresponding piece of evidence (passing test, working demo step, or document).
- [ ] Explicit go/no-go confirmation is obtained before any Phase 2 task is started.

---

## Quick-reference: dependency chain

```
TASK-001 → TASK-002 → TASK-003
TASK-001 → TASK-004
TASK-005 (independent, blocks TASK-006)
TASK-004 + TASK-005 → TASK-006 → TASK-007 → TASK-008 → TASK-009 → TASK-010
TASK-007 → TASK-011, TASK-012
TASK-011 + TASK-012 → TASK-013
TASK-012 → TASK-014 → TASK-015 (also needs TASK-009) → TASK-016
TASK-016 → TASK-017 → TASK-018
TASK-015 + TASK-017 + TASK-018 → TASK-019 → TASK-020
```