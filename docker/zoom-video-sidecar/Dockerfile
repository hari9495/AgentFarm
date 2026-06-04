# syntax=docker/dockerfile:1.7
# Zoom Video Sidecar — Node.js 20 slim
#
# Lightweight orchestration service that manages Zoom meeting sessions by
# delegating browser-join and screen-share operations to the desktop-agent.
# No native dependencies — pure Node.js ESM, no npm packages required.

FROM node:20-slim

WORKDIR /app

COPY server.mjs .

EXPOSE 8091

HEALTHCHECK --interval=15s --timeout=5s --retries=5 --start-period=10s \
    CMD node -e "fetch('http://localhost:8091/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
