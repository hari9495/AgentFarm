# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Activate the exact pnpm version declared in package.json
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Copy workspace manifest files first for better layer caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./

# Copy all package sources (needed for workspace linking and build)
COPY packages/ ./packages/
COPY services/ ./services/
COPY apps/ ./apps/

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Generate Prisma client types (required before TypeScript compilation)
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DATABASE_URL=$DATABASE_URL
RUN pnpm --filter @agentfarm/db-schema prisma:generate

# Build shared packages and services, then the app
RUN pnpm --filter "./packages/**" run --if-present build
RUN pnpm --filter "./services/**" run --if-present build
RUN pnpm --filter @agentfarm/api-gateway run build

# Patch workspace package.json exports that still point to TypeScript source
# so that Node.js can resolve them at runtime without a TypeScript loader.
RUN node -e " \
    const fs = require('fs'); \
    for (const d of ['packages', 'services']) { \
    if (!fs.existsSync(d)) continue; \
    for (const p of fs.readdirSync(d)) { \
    const pj = d + '/' + p + '/package.json'; \
    if (!fs.existsSync(pj)) continue; \
    const di = d + '/' + p + '/dist/index.js'; \
    if (!fs.existsSync(di)) continue; \
    const raw = fs.readFileSync(pj, 'utf8').replace(/^\uFEFF/, ''); const j = JSON.parse(raw); \
    let c = false; \
    if (j.main && j.main.endsWith('.ts')) { j.main = './dist/index.js'; c = true; } \
    if (j.exports && j.exports['.'] && j.exports['.'].default && j.exports['.'].default.endsWith('.ts')) { \
    j.exports['.'].default = './dist/index.js'; c = true; \
    } \
    if (c) fs.writeFileSync(pj, JSON.stringify(j, null, 2) + '\n'); \
    } \
    } \
    "

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy node_modules (includes pnpm virtual store + workspace symlinks)
COPY --from=builder /app/node_modules ./node_modules

# Copy workspace packages with patched package.json and compiled dist
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services ./services

# Copy compiled api-gateway output and its node_modules (pnpm links workspace
# packages as symlinks inside the app-level node_modules, not the root)
COPY --from=builder /app/apps/api-gateway/dist ./apps/api-gateway/dist
COPY --from=builder /app/apps/api-gateway/package.json ./apps/api-gateway/
COPY --from=builder /app/apps/api-gateway/node_modules ./apps/api-gateway/node_modules

EXPOSE 3000
CMD ["node", "apps/api-gateway/dist/main.js"]
