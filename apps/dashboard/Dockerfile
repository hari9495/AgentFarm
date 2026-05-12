# ── Stage 1: builder ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/ ./packages/
COPY services/ ./services/
COPY apps/ ./apps/

RUN pnpm install --frozen-lockfile

# Build shared packages, services, then the dashboard
RUN pnpm --filter "./packages/**" run build --if-present
RUN pnpm --filter "./services/**" run build --if-present
RUN pnpm --filter @agentfarm/dashboard run build

# ── Stage 2: runner ───────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Activate pnpm for the start command
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services ./services

# Copy Next.js build output and dashboard config
COPY --from=builder /app/apps/dashboard/.next ./apps/dashboard/.next
COPY --from=builder /app/apps/dashboard/package.json ./apps/dashboard/
COPY --from=builder /app/apps/dashboard/next.config.mjs ./apps/dashboard/
COPY --from=builder /app/apps/dashboard/public ./apps/dashboard/public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./

EXPOSE 3001
CMD ["pnpm", "--filter", "@agentfarm/dashboard", "start"]
