# ─── builder stage ───────────────────────────────────────────────────────────
# Installs all deps (including devDependencies — needed for `next build`,
# prisma generate, type-check), produces .next/ + Prisma client, then prunes
# dev deps so only production node_modules survive into the runner stage.
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl

# Cacheable dep layer — only re-runs when package*.json changes.
COPY package*.json ./
RUN npm ci

# Generate the Prisma client first so it's part of the same layer as deps.
COPY prisma ./prisma/
RUN npx prisma generate

# Now the rest of the source.
COPY . .

# Build-time env.
#
# SKIP_ENV_VALIDATION=1 short-circuits lib/env.ts — no checked secrets are
# inlined into the bundle (no NEXT_PUBLIC_*), so the build doesn't need real
# values. The runtime container still validates them at startup via env_file.
#
# DATABASE_URL is a placeholder because lib/prisma.ts reads it at module top
# and throws otherwise. Prisma doesn't open a connection during `next build`;
# real DATABASE_URL is injected at container start.
#
# NODE_OPTIONS gives Node 4 GB of heap (default ~1.4 GB on 64-bit Linux),
# which `next build` exceeds once Recharts + the rest are in the bundle.
RUN SKIP_ENV_VALIDATION=1 \
    DATABASE_URL=postgres://buildtime:buildtime@127.0.0.1:5432/buildtime \
    NODE_OPTIONS=--max-old-space-size=3072 \
    npm run build

# Drop devDependencies + npm cache. This cuts node_modules roughly in half
# and is the single biggest source of layer-size savings vs. the old
# single-stage build.
#
# tsx was moved to dependencies in package.json so the worker (`npm run
# worker` → `tsx server/workers/index.ts`) still resolves it after pruning.
RUN npm prune --omit=dev && \
    npm cache clean --force && \
    rm -rf /root/.npm

# ─── runner stage ────────────────────────────────────────────────────────────
# Fresh image, only the artifacts needed at runtime.
FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown nodejs:nodejs /app
USER nodejs

# Copy everything from the (already-pruned) builder. The whole tree comes
# across in a single layer — keeps things simple and means the runner image
# has the source files the worker's tsx needs to transpile at runtime.
#
# What's NOT in this image (vs. the old single-stage):
#   - dev-only deps (playwright, eslint, vitest, @types/*, prisma CLI, …)
#   - npm cache (~500 MB)
#   - build-time tmp files
COPY --from=builder --chown=nodejs:nodejs /app ./

EXPOSE 3000
CMD ["npm", "start"]
