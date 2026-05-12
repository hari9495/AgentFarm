# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY services/ ./services/
COPY apps/ ./apps/

RUN pnpm install --frozen-lockfile

# Generate Prisma client types before TypeScript compilation
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DATABASE_URL=$DATABASE_URL
RUN pnpm --filter @agentfarm/db-schema prisma:generate

# Build shared packages, services, then the app
RUN pnpm --filter "./packages/**" run build --if-present
RUN pnpm --filter "./services/**" run build --if-present
RUN pnpm --filter @agentfarm/trigger-service run build

# Patch workspace package.json exports that point to TypeScript source
RUN node -e " \
    const fs = require('fs'); \
    for (const d of ['packages', 'services']) { \
    if (!fs.existsSync(d)) continue; \
    for (const p of fs.readdirSync(d)) { \
    const pj = d + '/' + p + '/package.json'; \
    if (!fs.existsSync(pj)) continue; \
    const di = d + '/' + p + '/dist/index.js'; \
    if (!fs.existsSync(di)) continue; \
    const j = JSON.parse(fs.readFileSync(pj, 'utf8')); \
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

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services ./services

COPY --from=builder /app/apps/trigger-service/dist ./apps/trigger-service/dist
COPY --from=builder /app/apps/trigger-service/package.json ./apps/trigger-service/

EXPOSE 3002
CMD ["node", "apps/trigger-service/dist/main.js"]
