FROM node:22-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/shared ./packages/shared
RUN corepack enable && pnpm install --frozen-lockfile --prod=false
COPY apps/web ./apps/web
WORKDIR /app/apps/web
RUN pnpm build
CMD ["pnpm", "preview", "--host", "0.0.0.0", "--port", "3000"]
