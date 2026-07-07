# TASK-003: Stand up CI/CD pipeline skeleton


## What you're doing and why
This task wires up automated quality gates so that no future task can land broken code on `main` silently.
The pipeline is intentionally incomplete — deployment is **not** implemented here because the infra target
(cloud provider) hasn't been acted on yet. The deploy job must exist as a visible, failing stub so it
cannot be accidentally skipped or forgotten.

This is a configuration task. Do not touch application code. Do not implement deployment.

---

## Steps

### 1. Verify the dependency

Before creating any files, confirm TASK-002 is complete:
- `pnpm install` succeeds at repo root.
- `/apps/api` and `/apps/web` all exist with valid TypeScript entry points.
- `pnpm typecheck` and `pnpm lint` pass with zero errors.

If any of the above fail, **stop. Report what is broken. Do not proceed.**

---

### 2. Understand the two-pipeline model

You are creating **two distinct workflows**, not one:

| Workflow | File | Trigger | Purpose |
|---|---|---|---|
| CI | `.github/workflows/ci.yml` | Every PR (and push to `main`) | Lint, typecheck, test |
| Build | `.github/workflows/build.yml` | Merge to `main` only | Build Docker images |

Keep them in separate files. Do not collapse them into one workflow with conditionals — that makes
the intent harder to read and the failure surface harder to diagnose.

---

### 3. Create `.github/workflows/ci.yml`

This workflow runs on every pull request and on every push to `main`.

**Required jobs (in this order):**

#### Job: `lint`
- Runs on: `ubuntu-latest`
- Steps:
  1. Checkout repo (`actions/checkout@v4`)
  2. Set up Node 22 (`actions/setup-node@v4`, `node-version: '22'`)
  3. Install pnpm (`uses: pnpm/action-setup@v4`, `version: 9`)
  4. Cache pnpm store (`actions/cache@v4`, key on `pnpm-lock.yaml` hash)
  5. `pnpm install --frozen-lockfile`
  6. `pnpm lint` — must exit non-zero on any Biome error

#### Job: `typecheck`
- Runs on: `ubuntu-latest`
- Depends on: `lint` (use `needs: lint`)
- Steps:
  1. Checkout, setup Node 22, setup pnpm, restore cache (same as above)
  2. `pnpm install --frozen-lockfile`
  3. `pnpm typecheck`

#### Job: `test`
- Runs on: `ubuntu-latest`
- Depends on: `typecheck` (use `needs: typecheck`)
- Steps:
  1. Checkout, setup Node 22, setup pnpm, restore cache
  2. `pnpm install --frozen-lockfile`
  3. `pnpm test` — must exit non-zero on any test failure

**Full `.github/workflows/ci.yml`:**
```yaml
name: CI

on:
  pull_request:
  push:
    branches:
      - main

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

  typecheck:
    name: Typecheck
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Typecheck
        run: pnpm typecheck

  test:
    name: Test
    runs-on: ubuntu-latest
    needs: typecheck
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Test
        run: pnpm test
```

---

### 4. Create `.github/workflows/build.yml`

This workflow runs **only on push to `main`** (i.e. after a PR is merged).
It builds Docker images for both apps. It does **not** push or deploy them — that is blocked until
the infra decision is acted on.

**Required jobs:**

#### Job: `build-api`
- Runs on: `ubuntu-latest`
- Steps:
  1. Checkout repo
  2. Set up Docker Buildx (`docker/setup-buildx-action@v3`)
  3. Build (do not push) the API image:
     ```bash
     docker build -f apps/api/Dockerfile -t luxtorque-api:${{ github.sha }} .
     ```

#### Job: `build-web`
- Runs on: `ubuntu-latest`
- Steps:
  1. Checkout repo
  2. Set up Docker Buildx
  3. Build (do not push) the web image:
     ```bash
     docker build -f apps/web/Dockerfile -t luxtorque-web:${{ github.sha }} .
     ```

#### Job: `deploy` — STUB, intentionally failing
This job must exist, must be visible, and must **fail with a clear message** so it cannot be
silently skipped. Do not use `exit 0`. Do not use `continue-on-error: true`.

```yaml
  deploy:
    name: Deploy (TODO — not implemented)
    runs-on: ubuntu-latest
    needs: [build-api, build-web]
    steps:
      - name: Deployment not yet implemented
        run: |
          echo "TODO: Deployment target not configured."
          echo "Complete TASK-007 (infra provisioning) before implementing this job."
          echo "See /docs/decisions/0001-cloud-provider.md for the chosen provider."
          exit 1
```

**Full `.github/workflows/build.yml`:**
```yaml
name: Build

on:
  push:
    branches:
      - main

jobs:
  build-api:
    name: Build API image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Build API Docker image
        run: docker build -f apps/api/Dockerfile -t luxtorque-api:${{ github.sha }} .

  build-web:
    name: Build Web image
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - name: Build Web Docker image
        run: docker build -f apps/web/Dockerfile -t luxtorque-web:${{ github.sha }} .

  deploy:
    name: Deploy (TODO — not implemented)
    runs-on: ubuntu-latest
    needs: [build-api, build-web]
    steps:
      - name: Deployment not yet implemented
        run: |
          echo "TODO: Deployment target not configured."
          echo "Complete TASK-007 (infra provisioning) before implementing this job."
          echo "See /docs/decisions/0001-cloud-provider.md for the chosen provider."
          exit 1
```

---

### 5. Create minimal Dockerfiles

The build jobs reference Dockerfiles that do not exist yet. Create minimal valid ones now.
These will be hardened in a later infra task — keep them simple.

---

### 6. Add a minimal test to each app

The `pnpm test` script must exist and must be runnable. If no test runner is configured yet,
add a minimal setup now so CI doesn't fail on a missing script.

For each of `/apps/api` and `/apps/web`:
- Add `vitest` as a dev dependency.
- Add `"test": "vitest run"` to the package's `scripts` in `package.json`.
- Create one placeholder test file that passes:

Add `"test": "pnpm -r test"` to the root `package.json` scripts if not already present.

---

### 7. Verify the stub deploy job fails correctly

This is not optional. Confirm the `deploy` job will fail as intended:
- The step runs `exit 1`.
- `continue-on-error` is **not** set.
- The job is **not** marked as optional or skipped in any way.
- The error message clearly references `TASK-007` and the decisions doc.

---

## Verification steps

Run these locally before marking done:

```bash
# 1. Full install still works
pnpm install --frozen-lockfile

# 2. Lint passes
pnpm lint

# 3. Typecheck passes
pnpm typecheck

# 4. Tests pass
pnpm test

# 5. Docker builds succeed (requires Docker running locally)
docker build -f apps/api/Dockerfile -t luxtorque-api:local .
docker build -f apps/web/Dockerfile -t luxtorque-web:local .

# 6. Confirm workflow files are valid YAML (no syntax errors)
# Install actionlint if available: https://github.com/rhysd/actionlint
actionlint .github/workflows/ci.yml
actionlint .github/workflows/build.yml
```

---

## Acceptance criteria (all must be true before marking done)

- [ ] `.github/workflows/ci.yml` exists and defines `lint`, `typecheck`, and `test` jobs in that dependency order.
- [ ] `.github/workflows/build.yml` exists and defines `build-api`, `build-web`, and `deploy` jobs.
- [ ] The `deploy` job exits with code `1` and includes a message referencing `TASK-007` and the cloud provider decision doc.
- [ ] `deploy` does **not** use `continue-on-error: true` or any mechanism that suppresses the failure.
- [ ] `apps/api/Dockerfile` and `apps/web/Dockerfile` exist and `docker build` succeeds for both.
- [ ] `pnpm test` runs successfully at repo root and invokes tests in all packages.
- [ ] At least one passing placeholder test exists in each of `apps/api` and `apps/web`.
- [ ] `pnpm install --frozen-lockfile` succeeds (lockfile must be committed and up to date).
- [ ] All CI workflow YAML is valid (no syntax errors — verify with `actionlint` or GitHub's own validator).
- [ ] No application logic was added or modified in this task.

---

## What not to do

- Do not implement deployment, image pushing, or registry configuration — that is out of scope for this task.
- Do not set `continue-on-error: true` on the `deploy` job under any circumstances.
- Do not use `npm` or `yarn` in the workflow files — use `pnpm` exclusively.
- Do not hardcode secrets or tokens in workflow files — use `${{ secrets.* }}` references if needed later.
- Do not skip creating the Dockerfiles — the build jobs will fail without them.
- Do not write real feature tests here — placeholder tests only. Real tests belong to the tasks that implement the features.
- Do not proceed to TASK-004 until every acceptance criterion above is checked.
