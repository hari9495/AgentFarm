# Day 1 Dev Setup Commands

1. Install dependencies
   pnpm install

2. Start local dependencies
   docker compose up -d

3. Run API gateway
   pnpm --filter @agentfarm/api-gateway dev

4. Run dashboard
   pnpm --filter @agentfarm/dashboard dev
