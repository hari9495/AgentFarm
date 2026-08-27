# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:26-alpine AS builder
WORKDIR /app

RUN corepack enable && for i in 1 2 3 4 5; do corepack prepare pnpm@9.12.0 --activate && break || { echo "corepack retry $i/5"; sleep 5; }; done

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/ ./services/
COPY apps/ ./apps/

RUN pnpm install --frozen-lockfile

# Generate Prisma client types before TypeScript compilation
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DATABASE_URL=$DATABASE_URL
RUN pnpm --filter @agentfarm/db-schema prisma:generate

# Build shared packages, services, then the app
RUN pnpm --filter "./packages/**" run --if-present build
RUN pnpm --filter "./services/**" run --if-present build
RUN pnpm --filter @agentfarm/agent-runtime run build

# Recursively patch all packages/services: ./src/X.ts -> ./dist/X.js
# Handles any export shape without relying on dist/index.js existence
RUN node -e " \
    const fs = require('fs'); \
    function patch(v) { \
    if (typeof v === 'string' && v.startsWith('./src/') && v.endsWith('.ts')) \
    return './dist/' + v.slice('./src/'.length).replace(/\\.ts\$/, '.js'); \
    if (typeof v === 'object' && v !== null) \
    Object.keys(v).forEach(function(k) { v[k] = patch(v[k]); }); \
    return v; \
    } \
    for (const d of ['packages', 'services']) { \
    if (!fs.existsSync(d)) continue; \
    for (const p of fs.readdirSync(d)) { \
    const pj = d + '/' + p + '/package.json'; \
    if (!fs.existsSync(pj)) continue; \
    const raw = fs.readFileSync(pj, 'utf8').replace(/^﻿/, ''); \
    const j = JSON.parse(raw); \
    const before = JSON.stringify(j); \
    if (j.main) j.main = patch(j.main); \
    if (j.types) j.types = patch(j.types); \
    if (j.exports) j.exports = patch(j.exports); \
    if (JSON.stringify(j) !== before) fs.writeFileSync(pj, JSON.stringify(j, null, 2) + '\n'); \
    } \
    } \
    "

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# git is required by the developer agent's workspace actions (git_clone,
# git_branch, git_commit, git_push) and the autonomous PR loop. openssh-client
# provides ssh for any git-over-ssh remotes. Without these the loop hangs/fails
# on clone.
RUN apk add --no-cache git openssh-client

# Copy node_modules (includes pnpm virtual store + workspace symlinks)
COPY --from=builder /app/node_modules ./node_modules

# Copy workspace packages with patched package.json and compiled dist
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services ./services

# Copy compiled agent-runtime output and its app-level node_modules
COPY --from=builder /app/apps/agent-runtime/dist ./apps/agent-runtime/dist
COPY --from=builder /app/apps/agent-runtime/package.json ./apps/agent-runtime/
COPY --from=builder /app/apps/agent-runtime/node_modules ./apps/agent-runtime/node_modules

EXPOSE 4000
CMD ["node", "apps/agent-runtime/dist/main.js"]
