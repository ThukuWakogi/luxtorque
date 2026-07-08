# LuxTorque Web

TanStack Start on Vite. See root `CLAUDE.md` for workspace-wide conventions
(pnpm, TypeScript, Biome) — this file only covers what's specific to this
package.

## Framework notes
- This is Vite-based TanStack Start, not the older Vinxi-based setup — do not
  suggest Vinxi config, patterns, or troubleshooting steps
- Routes follow TanStack Start's file-based routing conventions; prefer
  loaders over `useEffect` + fetch for route-level data
- UI components: shadcn/ui — check `src/components/ui` before writing a new
  primitive from scratch

## Data & auth
- Talks to the NestJS API in `apps/api`; don't duplicate API business logic
  client-side
- Auth state comes from Better Auth's client SDK, not a hand-rolled context/store

## Local commands (run from repo root)
- Dev server: `pnpm --filter @luxtorque/web dev`
- Build: `pnpm --filter @luxtorque/web build`
- Add a shadcn component: `pnpm --filter @luxtorque/web dlx shadcn@latest add <component>`
