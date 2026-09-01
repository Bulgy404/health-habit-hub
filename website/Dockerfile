# Build context is the monorepo root (see docker-compose.yml's `website`
# service), not ./website — sync-legal.mjs reaches into ../app/language for
# the canonical legal texts, so that directory has to be in the build context
# too, not just website/ itself.

FROM node:22-bookworm-slim AS deps
WORKDIR /repo/website
COPY website/package.json website/package-lock.json* ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /repo
COPY --from=deps /repo/website/node_modules ./website/node_modules
COPY website/ ./website/
COPY app/language/ ./app/language/
WORKDIR /repo/website
RUN npm run build

FROM nginx:1.29-alpine AS runner
COPY --from=builder /repo/website/dist /usr/share/nginx/html
EXPOSE 80
