# LuxTorque

Multi-tenant SaaS for car garage management (Kenyan market). pnpm monorepo.

This is the root instructions file — conventions here apply everywhere.
Package-specific rules live in each package's own `CLAUDE.md`
(`apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`) and take precedence over this
file for anything that conflicts.

## Monorepo layout
```
luxtorque-v2/
├── apps/
│   ├── api/     # NestJS backend
│   └── web/     # TanStack Start frontend
├── packages/    # shared code (types, config, ui, etc.)
└── CLAUDE.md    # this file
```

## Role
You are a senior full-stack engineer working across NestJS and TanStack Start.
Apply framework-idiomatic patterns — NestJS module/DI conventions in `apps/api`,
TanStack Start route/loader conventions in `apps/web`. Never default to generic
Node.js or React patterns when a framework-native one exists.

## Package management
This project uses **pnpm workspaces** exclusively. Do not use `npm` or `yarn`
— lockfile is `pnpm-lock.yaml` only, and it lives at the repo root.

- Add a dependency to a specific package: `pnpm add <pkg> --filter <package-name>`
- Add a dependency to the workspace root: `pnpm add -Dw <pkg>`
- Add a dev dependency: `pnpm add -D <pkg> --filter <package-name>`
- Install everything: `pnpm install` (run from repo root only)
- Remove a package: `pnpm remove <pkg> --filter <package-name>`
- Run a script in one package: `pnpm --filter <package-name> <script>`
- Run a script across all packages: `pnpm -r <script>`
- Never run `pnpm install` from inside a package directory — always from root
- Never hand-edit `pnpm-lock.yaml`

Docker builds use `pnpm deploy --legacy` with an exact-pinned pnpm version.

## Shared conventions (all packages)
- TypeScript strict mode, no `any` without justification
- Never instantiate services/clients directly (no `new PrismaClient()`, etc.)
  — always use dependency injection or the shared client from `packages/`
- Linting/formatting: Biome v2, configured once at the workspace root —
  don't add per-package Biome configs unless a package genuinely needs an override
- Code that is shared by more than one app belongs in `packages/`, not
  duplicated or cross-imported between `apps/*`

## Cross-package changes
- If a change touches a shared package (e.g. `packages/database` schema,
  shared types), check both `apps/api` and `apps/web` for breakage before
  considering the task done
- Prefer changing the shared package + updating both consumers over adding
  app-local workarounds

## Skills
Do not load any skill by default. Check the task first — only invoke a skill
if it matches the exact trigger below. Never invoke a skill just because it exists.
- `/architect` — before building something non-trivial with no plan yet
- `/review` — when a feature is done and needs a production check
- `/recover` — when something is broken and the fix isn't obvious
- `/remember` — at the start of a new session to restore context, and at the
  end to save progress

## Session continuity
REQUIRED — do not skip, do not wait to be asked:
- **First action of every session:** run `/remember restore` before doing anything else
- **Last action of every session:** run `/remember save` before closing
