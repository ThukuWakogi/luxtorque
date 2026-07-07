# LuxTorque

LuxTorque is a monorepo for a multi-tenant product platform with a NestJS API and a React-based web application.

## Repository structure

- apps/api — NestJS backend service with TypeScript and Jest
- apps/web — TanStack Start web app with React, Vite, and Tailwind CSS
- docs — project plans, task prompts, and architecture decisions
- packages — shared workspace packages (to be expanded)

## Tech stack

- Package manager: pnpm
- API: NestJS, TypeScript
- Web: React, TanStack Router, TanStack Query, Vite
- Styling: Tailwind CSS
- Tooling: Biome, ESLint, Vitest

## Getting started

1. Install dependencies from the repository root:
   pnpm install
2. Start the API:
   pnpm --filter @luxtorque/api start:dev
3. Start the web app:
   pnpm --filter web dev

## Notes

The repository is currently in early development and the root README will continue to evolve as the platform grows.
