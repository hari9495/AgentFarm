# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && for i in 1 2 3 4 5; do corepack prepare pnpm@9.12.0 --activate && break || { echo "corepack retry $i/5"; sleep 5; }; done

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/ ./services/
COPY apps/ ./apps/

RUN pnpm install --frozen-lockfile

ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DATABASE_URL=$DATABASE_URL

RUN pnpm --filter @agentfarm/db-schema prisma:generate
RUN pnpm --filter "./packages/**" run --if-present build
RUN pnpm --filter "./services/**" run --if-present build
RUN pnpm --filter @agentfarm/dashboard run build

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# pnpm needed for the start command
RUN corepack enable && for i in 1 2 3 4 5; do corepack prepare pnpm@9.12.0 --activate && break || { echo "corepack retry $i/5"; sleep 5; }; done

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services ./services
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./

# Dashboard app — built output + config + local node_modules (contains next binary)
COPY --from=builder /app/apps/dashboard/.next ./apps/dashboard/.next
COPY --from=builder /app/apps/dashboard/package.json ./apps/dashboard/
COPY --from=builder /app/apps/dashboard/next.config.mjs ./apps/dashboard/
COPY --from=builder /app/apps/dashboard/public ./apps/dashboard/public
COPY --from=builder /app/apps/dashboard/node_modules ./apps/dashboard/node_modules

EXPOSE 3001
CMD ["pnpm", "--filter", "@agentfarm/dashboard", "start"]
