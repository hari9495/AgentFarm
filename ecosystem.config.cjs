// PM2 ecosystem config for local/laptop production-test setup.
// Runs all AgentFarm services natively using tsx (no Docker for app layer).
// Infra (postgres, redis, opa) must be running in Docker first.
//
// Start all:   pm2 start ecosystem.config.cjs
// Status:      pm2 list
// Logs:        pm2 logs [service-name]
// Restart one: pm2 restart api-gateway
// Stop all:    pm2 stop all
// Delete all:  pm2 delete all

const TSX = 'node_modules/.pnpm/node_modules/.bin/tsx';

module.exports = {
  apps: [
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
