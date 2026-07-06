# syntax=docker/dockerfile:1
#
# Production image for worktide-web (Vite/React SPA → static, served by nginx).
# Built by Coolify. Runs at worktide.wappler.systems.
#
# IMPORTANT: Vite bakes VITE_* into the bundle at BUILD time. Set these in
# Coolify as *Build Variables* so they arrive as --build-arg here:
#   VITE_API_BASE=https://api.worktide.wappler.systems/v1
#   VITE_API_PUBLIC_BASE=https://api.worktide.wappler.systems/v1
#   VITE_MERCURE_HUB_URL=https://worktide-mercure.wappler.systems/.well-known/mercure
#   VITE_REFINE_DEVTOOLS=false

########################
# 1. Build
########################
FROM node:22-alpine AS build
WORKDIR /app

# pnpm via corepack
RUN corepack enable

# Build-time public config (baked into the bundle)
ARG VITE_API_BASE
ARG VITE_API_PUBLIC_BASE
ARG VITE_MERCURE_HUB_URL
ARG VITE_REFINE_DEVTOOLS=false
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_API_PUBLIC_BASE=$VITE_API_PUBLIC_BASE \
    VITE_MERCURE_HUB_URL=$VITE_MERCURE_HUB_URL \
    VITE_REFINE_DEVTOOLS=$VITE_REFINE_DEVTOOLS

# Install deps (cached on lockfile)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
RUN pnpm install --frozen-lockfile

# Build
COPY . .
RUN pnpm build

########################
# 2. Serve
########################
FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
