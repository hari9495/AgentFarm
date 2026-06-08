// PM2 ecosystem config for local/laptop production-test setup.
// Runs all AgentFarm services natively using tsx (no Docker for app layer).
// Infra (postgres, redis, opa) must be running in Docker first.
//
// First-time setup:
//   1. docker compose up -d postgres redis opa
//   2. pm2 start ecosystem.config.cjs
//   3. pm2 save   ← persist across reboots
//
// Daily usage:
//   pm2 start ecosystem.config.cjs   ← start everything (incl. tunnel)
//   pm2 list                          ← status
//   pm2 restart api-gateway           ← restart one
//   pm2 stop all                      ← stop everything
//
// Windows note: tsx .CMD files can't be spawned directly by PM2.
// Instead we use node as the interpreter and pass tsx's .mjs CLI as the script.
// The node_args --env-file flag loads .env before the TypeScript app starts.

// tsx CLI entry point (node-executable, works on all platforms)
const TSX_CLI = 'D:/AgentFarm/node_modules/.pnpm/tsx@4.21.0/node_modules/tsx/dist/cli.mjs';
// --env-file loads .env before the app — Node 20+ built-in flag
const TSX_NODE_ARGS = '--env-file=D:/AgentFarm/.env';

// next CLI for dashboard (use the pnpm hoisted symlink)
const NEXT_CLI = 'D:/AgentFarm/node_modules/.pnpm/node_modules/next/dist/bin/next';

// cloudflared.exe location
const CF_EXE = require('fs').existsSync('C:/Windows/System32/cloudflared.exe')
  ? 'C:/Windows/System32/cloudflared.exe'
  : 'cloudflared.exe';
const CF_CONFIG = 'C:/Users/HariSivaSaiKumarMada/.cloudflared/config.yml';

module.exports = {
  apps: [
    {
      name: 'cloudflared',
      script: CF_EXE,
      args: `tunnel --config "${CF_CONFIG}" run agentfarm`,
      interpreter: 'none',
      watch: false,
      autorestart: true,
    },
    {
      name: 'api-gateway',
      cwd: 'D:/AgentFarm',
      script: TSX_CLI,
      args: 'apps/api-gateway/src/main.ts',
      interpreter: 'node',
      node_args: TSX_NODE_ARGS,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: 'agent-runtime',
      cwd: 'D:/AgentFarm',
      script: TSX_CLI,
      args: 'apps/agent-runtime/src/main.ts',
      interpreter: 'node',
      node_args: TSX_NODE_ARGS,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: 'trigger-service',
      cwd: 'D:/AgentFarm',
      script: TSX_CLI,
      args: 'apps/trigger-service/src/main.ts',
      interpreter: 'node',
      node_args: TSX_NODE_ARGS,
      watch: false,
      max_memory_restart: '512M',
    },
    {
      name: 'orchestrator',
      cwd: 'D:/AgentFarm',
      script: TSX_CLI,
      args: 'apps/orchestrator/src/main.ts',
      interpreter: 'node',
      node_args: TSX_NODE_ARGS,
      watch: false,
      max_memory_restart: '512M',
    },
    {
      name: 'dashboard',
      cwd: 'D:/AgentFarm/apps/dashboard',
      script: NEXT_CLI,
      args: 'start -p 3001',
      interpreter: 'node',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
    },
  ],
};
