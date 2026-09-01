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

# The site is now server-rendered (Astro's node adapter, standalone mode) so
# that src/pages/api/contact.ts can send real email server-side — a static
# nginx runner can no longer serve it. Only production deps are needed at
# runtime (astro build already bundled the app itself into dist/server).
FROM node:22-bookworm-slim AS runner
WORKDIR /repo/website
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
COPY --from=deps /repo/website/node_modules ./node_modules
COPY --from=builder /repo/website/dist ./dist
COPY website/package.json ./package.json
EXPOSE 4321
CMD ["node", "./dist/server/entry.mjs"]
