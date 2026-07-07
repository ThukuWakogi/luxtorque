# Multi-stage Dockerfile for building the Vite React app in a pnpm workspace
FROM node:22-alpine AS builder

WORKDIR /repo

# Install basic build deps
RUN apk add --no-cache git python3 make g++ libc6-compat

# Copy workspace manifests first for efficient caching
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./

# Copy only the app sources we need
COPY apps/web ./apps/web

# Install pnpm and install dependencies
RUN npm install -g pnpm@latest && pnpm install --frozen-lockfile

# Build the web app
RUN pnpm --filter @luxtorque/web... run build

# Production image serving static files with nginx
FROM nginx:stable-alpine AS runner

# Remove default config and replace with SPA-friendly config
RUN rm /etc/nginx/conf.d/default.conf
RUN printf '%s\n' \
  'server {' \
  '  listen 80;' \
  '  root /usr/share/nginx/html;' \
  '  index index.html;' \
  '  location / {' \
  '    try_files $uri $uri/ /index.html;' \
  '  }' \
  '}' > /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /repo/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
