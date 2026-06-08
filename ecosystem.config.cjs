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
//   pm2 logs [service-name]           ← logs
//   pm2 restart api-gateway           ← restart one
//   pm2 stop all                      ← stop everything
//
// Cloudflare Tunnel (cloudflared):
//   Tunnel ID: 0afd24e9-2fdb-413e-804f-e30b793ec216
//   Routes:  api.agentfarms.in → :3000
//            dashboard.agentfarms.in → :3001
//            runtime.agentfarms.in   → :4000
//
// IMPORTANT: cloudflared.exe path below — update if moved.
// Current: C:\Users\HariSivaSaiKumarMada\AppData\Local\Temp\cloudflared.exe
// To make permanent: copy to C:\Windows\System32\cloudflared.exe

const TSX = 'node_modules/.pnpm/node_modules/.bin/tsx';
// cloudflared.exe location — checked in order, first found wins.
// To install system-wide: copy D:\AgentFarm\cloudflared.exe to C:\Windows\System32\
const CF_EXE = require('fs').existsSync('C:/Windows/System32/cloudflared.exe')
  ? 'C:/Windows/System32/cloudflared.exe'
  : 'cloudflared.exe'; // falls back to project root
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
      error_file: 'logs/cloudflared-error.log',
      out_file: 'logs/cloudflared-out.log',
    },
    {
      name: 'api-gateway',
      cwd: '.',
      script: TSX,
      args: '--env-file=.env apps/api-gateway/src/main.ts',
      interpreter: 'none',
      watch: false,
      max_memory_restart: '1G',
      error_file: 'logs/api-gateway-error.log',
      out_file: 'logs/api-gateway-out.log',
    },
    {
      name: 'agent-runtime',
      cwd: '.',
      script: TSX,
      args: '--env-file=.env apps/agent-runtime/src/main.ts',
      interpreter: 'none',
      watch: false,
      max_memory_restart: '1G',
      error_file: 'logs/agent-runtime-error.log',
      out_file: 'logs/agent-runtime-out.log',
    },
    {
      name: 'trigger-service',
      cwd: '.',
      script: TSX,
      args: '--env-file=.env apps/trigger-service/src/main.ts',
      interpreter: 'none',
      watch: false,
      max_memory_restart: '512M',
      error_file: 'logs/trigger-service-error.log',
      out_file: 'logs/trigger-service-out.log',
    },
    {
      name: 'orchestrator',
      cwd: '.',
      script: TSX,
      args: '--env-file=.env apps/orchestrator/src/main.ts',
      interpreter: 'none',
      watch: false,
      max_memory_restart: '512M',
      error_file: 'logs/orchestrator-error.log',
      out_file: 'logs/orchestrator-out.log',
    },
    {
      name: 'dashboard',
      cwd: 'apps/dashboard',
      script: '../../node_modules/.pnpm/node_modules/.bin/next',
      args: 'start -p 3001',
      interpreter: 'none',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: '3001',
      },
      error_file: '../../logs/dashboard-error.log',
      out_file: '../../logs/dashboard-out.log',
    },
  ],
};
