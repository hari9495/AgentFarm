# syntax=docker/dockerfile:1.7
# Meeting-agent service — TypeScript control plane for the AgentFarm meeting
# agent. Audio capture and the Pipecat pipeline run in a separate sidecar
# inside the desktop-agent VM; this image owns the HTTP control surface,
# session FSM, and Supertonic TTS bridge.

FROM node:20-bookworm-slim AS builder
WORKDIR /workspace

# Enable pnpm via corepack
RUN corepack enable

# Copy workspace manifests first to maximise layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/tsconfig.json ./packages/shared-types/
COPY packages/queue-contracts/package.json packages/queue-contracts/tsconfig.json ./packages/queue-contracts/
COPY services/meeting-agent/package.json services/meeting-agent/tsconfig.json ./services/meeting-agent/

# Install dependencies for the meeting-agent slice only.
# --ignore-scripts: the builder only runs `tsc`; no native postinstall binaries
# (@prisma/engines, esbuild, etc.) are needed in this stage.
RUN pnpm install --frozen-lockfile --ignore-scripts \
    --filter @agentfarm/meeting-agent... \
    --filter @agentfarm/shared-types \
    --filter @agentfarm/queue-contracts

# Copy source and build.
COPY packages/shared-types/src ./packages/shared-types/src
COPY packages/queue-contracts/src ./packages/queue-contracts/src
COPY services/meeting-agent/src ./services/meeting-agent/src

RUN pnpm --filter @agentfarm/shared-types build \
    && pnpm --filter @agentfarm/queue-contracts build \
    && pnpm --filter @agentfarm/meeting-agent build

# ── Runtime stage ───────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    MEETING_AGENT_AUTOSTART=1 \
    MEETING_AGENT_PORT=7799

WORKDIR /app

RUN corepack enable

COPY --from=builder /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml ./
COPY --from=builder /workspace/packages ./packages
COPY --from=builder /workspace/services/meeting-agent ./services/meeting-agent

# Production install (no devDependencies, no postinstall scripts).
# meeting-agent is pure JS/TS — no native addons needed at runtime.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
    --filter @agentfarm/meeting-agent...

EXPOSE 7799

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD node -e "fetch('http://localhost:'+(process.env.MEETING_AGENT_PORT||7799)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "services/meeting-agent/dist/index.js"]
