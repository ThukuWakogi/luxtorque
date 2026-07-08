# LuxTorque API

NestJS 11, Express adapter, SWC compiler. See root `CLAUDE.md` for
workspace-wide conventions (pnpm, TypeScript, Biome) — this file only covers
what's specific to this package.

## Structure
- Infrastructure integrations get their own module + service:
  `src/lib/<name>/<name>.module.ts` + `<name>.service.ts`
  (e.g. `lib/database`, `lib/mail`)
- Infrastructure modules are `@Global()`, imported once in `AppModule`
- Feature modules live in `src/module/<name>/`
- Shared guards, interceptors, decorators live in `src/common/`
- Use Nest CLI for scaffolding: `nest g module / service / controller`
  (run from `apps/api`, or with `pnpm --filter @luxtorque/api exec nest g ...` from root)

## API conventions
- REST endpoints follow resource conventions, not verb conventions
  (`/auth/sessions`, not `/auth/login`)
- Errors follow RFC 7807 Problem Details shape; use the existing
  `ValidationException` / `flattenValidationErrors` pipeline for validation errors
- Time-dependent logic goes through `ClockService`, never `new Date()` directly

## Database (Prisma + Better Auth)
- All tables: snake_case, plural, via `@map` / `@@map` — Prisma model names
  stay PascalCase singular in schema, mapped to snake_case plural at the DB level
- Primary keys: UUID v7
- Two-layer tenancy on every domain table: `org_id` + `branch_id`
- RLS: `SET LOCAL "app.org_id"`, scoped per transaction via `RlsContextInterceptor`.
  Every `USING` clause MUST include the empty-string guard:
  `current_setting('app.org_id', true) <> ''`
- Two DB roles: superuser for migrations, `luxtorque_app` for runtime queries
- Better Auth uses its own prefixed tables (`auth_*`) to avoid ID-type conflicts
  with the existing `BigInt`-keyed `User` model
- Prisma schema/migrations live in `packages/database` if shared with other
  apps — check there before assuming this package owns the schema

## Security
- Arcjet is the source of truth for rate limiting / bot protection — don't
  hand-roll middleware that duplicates it

## Local commands (run from repo root)
- Dev server: `pnpm --filter @luxtorque/api dev`
- Build: `pnpm --filter @luxtorque/api build`
- Test: `pnpm --filter @luxtorque/api test`
- Prisma generate: `pnpm --filter @luxtorque/api exec prisma generate` (or from
  `packages/database` if the schema lives there)
