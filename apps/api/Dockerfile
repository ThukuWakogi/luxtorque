FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared ./packages/shared
RUN corepack enable && pnpm install --frozen-lockfile --prod=false
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN pnpm build
CMD ["pnpm", "start:prod"]
