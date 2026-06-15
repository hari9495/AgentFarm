# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

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
RUN pnpm --filter @agentfarm/website run build

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# pnpm needed for the start command
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services ./services
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./

# Website app — built output + config + public assets + local node_modules
COPY --from=builder /app/apps/website/.next ./apps/website/.next
COPY --from=builder /app/apps/website/package.json ./apps/website/
COPY --from=builder /app/apps/website/next.config.ts ./apps/website/
COPY --from=builder /app/apps/website/public ./apps/website/public
COPY --from=builder /app/apps/website/node_modules ./apps/website/node_modules

EXPOSE 3002
CMD ["pnpm", "--filter", "@agentfarm/website", "start"]
