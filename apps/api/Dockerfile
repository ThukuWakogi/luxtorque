FROM node:22-alpine AS builder

WORKDIR /repo

RUN apk add --no-cache git python3 make g++ libc6-compat

RUN npm install -g pnpm@11.8.0

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile

RUN pnpm --filter @luxtorque/api... run build

# Produce a self-contained deployment folder (flat node_modules, no symlinks)
RUN pnpm --filter @luxtorque/api deploy --prod --legacy /deploy/api

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy the clean deploy output — dist built separately above
COPY --from=builder /deploy/api/node_modules ./node_modules
COPY --from=builder /deploy/api/package.json ./package.json
COPY --from=builder /repo/apps/api/dist ./dist

EXPOSE 3000

CMD ["node", "dist/main.js"]