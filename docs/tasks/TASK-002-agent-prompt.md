# TASK-002: Initialize repository structure and branch strategy

**Depends on:** TASK-001 (must be marked complete — `/docs/decisions/0001-cloud-provider.md` must exist)

## What you're doing and why
This task lays down the monorepo skeleton that every subsequent task builds on.
Get the structure, tooling, and workspace config right here — changing it later is expensive.
This is a scaffolding task, not a feature task. Prefer minimal, valid, and compiling over clever.

---

## Steps

### 1. Verify the dependency
Before touching any files, confirm TASK-001 is complete:
- `/docs/decisions/0001-cloud-provider.md` exists and names exactly one provider.
- If it doesn't exist, **stop. Do not proceed. Report that TASK-001 is incomplete.**

---

### 2. Create the monorepo workspace structure

The repo uses **pnpm workspaces**. Create the following layout:

```
/
├── apps/
│   ├── api/          ← NestJS backend (TypeScript)
│   └── web/          ← TanStack Start frontend (React 18+, TypeScript)
├── docs/
│   └── decisions/    ← Already exists from TASK-001
├── .github/
│   └── PULL_REQUEST_TEMPLATE.md
├── package.json       ← Root workspace config
├── pnpm-workspace.yaml
├── .gitignore
├── .editorconfig
├── biome.json         ← Workspace-root Biome v2 config
└── README.md
```

---

### 3. Root files

**`pnpm-workspace.yaml`**
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

**Root `package.json`** — workspace root only, no runtime code:
```json
{
  "name": "luxtorque",
  "private": true,
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm -r --parallel dev",
    "lint": "biome check .",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "@biomejs/biome": "^2.0.0",
    "typescript": "^5.5.0"
  }
}
```

**`.gitignore`** — must cover at minimum:
```
node_modules/
dist/
.env
.env.*.local
*.tsbuildinfo
.DS_Store
```

**`.editorconfig`**:
```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

**`biome.json`** — workspace-root config, applied to all packages:
```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  }
}
```

---

### 4. `/apps/api` — NestJS scaffold

Minimal valid entry point only. No feature modules yet.

Required files:
- `package.json` with name `@luxtorque/api`, NestJS core deps, a `dev` and `build` script
- `tsconfig.json` extending a root `tsconfig.base.json` (create that too), with `strict: true`, `experimentalDecorators: true`, `emitDecoratorMetadata: true`
- `src/main.ts` — bootstraps the app, imports `dotenv/config` as the **very first line**, listens on `PORT` env var (default `3000`)
- `src/app.module.ts` — empty root module, no imports yet

**`src/main.ts` must begin exactly like this:**
```typescript
import 'dotenv/config'; // Must be first — loads root .env before anything else
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
```

---

### 5. `/apps/web` — TanStack Start scaffold

Minimal valid entry point only. No pages or features yet.

Required files:
- `package.json` with name `@luxtorque/web`, React 18+ and TanStack Start deps, a `dev` and `build` script
- `tsconfig.json` extending root `tsconfig.base.json`, with `strict: true`
- `src/main.tsx` — minimal TanStack Start entry point that renders without errors
- `src/router.tsx` — empty router instance (one root route returning a placeholder `<div>`)

---

### 6. `/packages/shared` — shared types only

This package contains **TypeScript interfaces and enums only**. No runtime logic, no external dependencies.

Required files:
- `package.json` with name `@luxtorque/shared`, no runtime deps, exports `./src/index.ts`
- `tsconfig.json` extending root `tsconfig.base.json`
- `src/index.ts` — re-exports all types
- `src/types/organisation.ts` — define and export:
  ```typescript
  export interface Organisation {
    id: string;         // UUID v7
    name: string;
    slug: string;
    createdAt: Date;
    updatedAt: Date;
  }
  ```
- `src/types/branch.ts` — define and export:
  ```typescript
  export interface Branch {
    id: string;         // UUID v7
    orgId: string;
    name: string;
    address: string;
    createdAt: Date;
    updatedAt: Date;
  }
  ```

Both `@luxtorque/api` and `@luxtorque/web` must declare `@luxtorque/shared` as a `workspace:*` dependency.

---

### 7. `/docs/CONTRIBUTING.md`

Document the branch strategy. Use this exact structure:

```markdown
# Contributing to LuxTorque v2

## Branch strategy

Trunk-based development:
- `main` is always deployable. Direct commits are blocked; all changes go through PRs.
- Feature branches are short-lived (target < 2 days). Name them `feat/<scope>-<short-description>`.
- Hotfix branches: `fix/<short-description>`, branched from and merged back to `main`.
- No long-lived environment branches (no `develop`, `staging`, etc.).

## Commit messages
Use Conventional Commits: `type(scope): description`
Types: feat, fix, chore, docs, test, refactor

## Running the project locally
[Populate after TASK-003 sets up local dev environment.]
```

---

### 8. `.github/PULL_REQUEST_TEMPLATE.md`

```markdown
## Description
<!-- What does this PR do and why? -->

## Linked requirements
<!-- Reference at least one SRS requirement ID, e.g. FR-AUTH-01, NFR-SEC-05 -->
- Requirement: 

## Checklist
- [ ] All acceptance criteria from the linked task are met
- [ ] New tests added (or existing tests updated) for changed behaviour
- [ ] Full test suite passes locally (`pnpm test`)
- [ ] Linter passes (`pnpm lint`)
- [ ] **Branch-isolation impact considered** — does this change affect how data is scoped to an org or branch? If yes, isolation tests cover it.
- [ ] Decision records created in `/docs/decisions/` for any architectural choices made
```

---

## Verification steps

Run these after completing all steps above. All must pass before marking done.

```bash
# 1. Install from root — must succeed with no errors
pnpm install

# 2. Typecheck all packages
pnpm typecheck

# 3. Lint all packages
pnpm lint

# 4. Build all packages
pnpm build

# 5. Confirm shared types are importable from api and web
# (write a throwaway import in each and typecheck — then remove it)
```

---

## Acceptance criteria (all must be true before marking done)

- [ ] `pnpm install` at repo root completes without errors.
- [ ] `/apps/api`, `/apps/web`, `/packages/shared` all exist with valid TypeScript entry points that compile under `strict: true`.
- [ ] `pnpm typecheck` passes across all packages with zero errors.
- [ ] `pnpm lint` passes with no errors (warnings acceptable, errors are not).
- [ ] `/docs/CONTRIBUTING.md` documents trunk-based branching strategy.
- [ ] `.github/PULL_REQUEST_TEMPLATE.md` exists and includes the branch-isolation impact checklist item verbatim.
- [ ] `biome.json` exists at repo root and `pnpm lint` invokes it across all packages.
- [ ] No file contains a `TODO` or placeholder that blocks compilation.

---

## What not to do

- Do not scaffold any feature modules (auth, RBAC, spare parts, bookings — none of it).
- Do not add a database connection, Prisma, or any env-dependent config in this task.
- Do not use `npm` or `yarn` — this repo uses `pnpm` exclusively.
- Do not use `any` in the shared types package.
- Do not leave `CONTRIBUTING.md` sections as empty stubs — fill in what is known now.
- Do not proceed to TASK-003 until every acceptance criterion above is checked.
