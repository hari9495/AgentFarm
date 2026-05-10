# AgentFarm Deployment Guide

> Last updated: May 10, 2026 | AgentFarm monorepo audit

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | 20+ | Runtime |
| pnpm | 9+ | Package manager |
| PostgreSQL | 16 | Primary database |
| Redis | 7 | Session cache, task queue |
| Docker / Docker Compose | 24+ | Local dev, VoxCPM2 TTS |
| Azure CLI | latest | Azure provisioning (production) |

---

## Environment Variables

Copy `.env.example` to `.env` at the repo root. All services read from environment.

```bash
cp .env.example .env
```

### Complete Environment Variable Reference

| Variable | Service | Required | Default | Description |
|---|---|---|---|---|
| `DATABASE_URL` | all | ✅ | — | PostgreSQL 16 connection string |
| `REDIS_URL` | api-gateway | ✅ | — | Redis 7 connection string |
| `API_SESSION_SECRET` | api-gateway | ✅ | `agentfarm-dev-secret` | HMAC-SHA256 signing secret for session tokens |
| `API_GATEWAY_PORT` | api-gateway | ❌ | `3000` | HTTP port for api-gateway |
| `API_GATEWAY_URL` | agent-runtime, trigger-service | ✅ | — | Base URL for api-gateway (e.g. `http://localhost:3000`) |
| `AGENT_RUNTIME_PORT` | agent-runtime | ❌ | `3003` | HTTP port for agent-runtime |
| `TRIGGER_SERVICE_PORT` | trigger-service | ❌ | — | HTTP port for trigger-service |
| `OPS_MONITORING_TOKEN` | api-gateway | ✅ | — | Secret for `x-ops-token` monitoring header |
| `LLM_PROVIDER` | agent-runtime | ❌ | `auto` | LLM provider: `openai`, `azure_openai`, `anthropic`, `google`, `xai`, `mistral`, `together`, `github_models`, `auto` |
| `OPENAI_API_KEY` | agent-runtime | ❌ | — | OpenAI API key (required if `LLM_PROVIDER=openai` or `auto`) |
| `AZURE_OPENAI_ENDPOINT` | agent-runtime | ❌ | — | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_DEPLOYMENT_NAME` | agent-runtime | ❌ | — | Azure OpenAI deployment name |
| `AZURE_OPENAI_API_KEY` | agent-runtime | ❌ | — | Azure OpenAI API key |
| `ANTHROPIC_API_KEY` | agent-runtime, trigger-service | ❌ | — | Anthropic API key |
| `GOOGLE_API_KEY` | agent-runtime | ❌ | — | Google Gemini API key |
| `XAI_API_KEY` | agent-runtime | ❌ | — | xAI Grok API key |
| `MISTRAL_API_KEY` | agent-runtime | ❌ | — | Mistral API key |
| `TOGETHER_API_KEY` | agent-runtime | ❌ | — | Together AI API key |
| `GITHUB_MODELS_TOKEN` | agent-runtime | ❌ | — | GitHub Models API token |
| `DESKTOP_OPERATOR` | agent-runtime | ❌ | `mock` | Desktop operator: `mock`, `native`, `playwright` |
| `DESKTOP_OPERATOR_SESSION_ID` | agent-runtime | ❌ | — | Optional platform session ID for native operator |
| `DESKTOP_SCREENSHOT_STORAGE` | agent-runtime | ❌ | — | Path or blob URL for screenshot storage |
| `PLAYWRIGHT_HEADLESS` | agent-runtime | ❌ | `true` | Run Playwright in headless mode |
| `PLAYWRIGHT_SLOW_MO` | agent-runtime | ❌ | `0` | Playwright slow-motion delay (ms) |
| `AF_WORKSPACE_BASE` | agent-runtime | ❌ | — | Base directory for local workspace files |
| `GITHUB_REPO` | agent-runtime | ❌ | — | Default GitHub repo for workspace tasks (`owner/repo`) |
| `AF_TEST_AFTER_EDIT` | agent-runtime | ❌ | — | If set, runs tests automatically after every code edit |
| `WEBHOOK_SECRET` | trigger-service | ✅ | — | HMAC-SHA256 secret for `X-Hub-Signature-256` verification |
| `SLACK_SIGNING_SECRET` | trigger-service | ❌ | — | Slack signing secret for `X-Slack-Signature` verification |
| `EMAIL_POLL_INTERVAL_MS` | trigger-service | ❌ | `60000` | IMAP polling interval in milliseconds |
| `IMAP_HOST` | trigger-service | ❌ | — | IMAP server hostname |
| `IMAP_PORT` | trigger-service | ❌ | `993` | IMAP server port |
| `IMAP_USER` | trigger-service | ❌ | — | IMAP account username |
| `IMAP_PASSWORD` | trigger-service | ❌ | — | IMAP account password |
| `STRIPE_SECRET_KEY` | api-gateway | ❌ | — | Stripe secret key (`sk_live_...` or `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | api-gateway | ❌ | — | Stripe webhook signing secret (`whsec_...`) |
| `RAZORPAY_KEY_ID` | api-gateway | ❌ | — | Razorpay key ID (`rzp_live_...` or `rzp_test_...`) |
| `RAZORPAY_KEY_SECRET` | api-gateway | ❌ | — | Razorpay key secret |
| `ZOHO_SIGN_CLIENT_ID` | api-gateway | ❌ | — | ZohoSign OAuth client ID |
| `ZOHO_SIGN_CLIENT_SECRET` | api-gateway | ❌ | — | ZohoSign OAuth client secret |
| `ZOHO_SIGN_WEBHOOK_TOKEN` | api-gateway | ❌ | — | ZohoSign webhook verification token |
| `VOICEBOX_URL` | agent-runtime | ❌ | `http://voicebox:17493` | VoxCPM2 TTS server URL |
| `VOXCPM2_MODEL_ID` | agent-runtime | ❌ | `openbmb/VoxCPM2` | VoxCPM2 model ID |
| `SMTP_HOST` | notification-service | ❌ | — | SMTP server hostname |
| `SMTP_PORT` | notification-service | ❌ | `587` | SMTP server port |
| `SMTP_USER` | notification-service | ❌ | — | SMTP account username |
| `SMTP_PASS` | notification-service | ❌ | — | SMTP account password |
| `OPA_BASE_URL` | policy-engine | ❌ | `http://localhost:8181` | Open Policy Agent base URL |
| `BROWSER_PROFILE_DIR` | agent-runtime | ❌ | `./data/browser-profiles` | Directory for persistent browser profiles |
| `AGENTFARM_COMPANY_EMAILS` | api-gateway, website | ❌ | — | Comma-separated allowed signup emails |
| `AGENTFARM_COMPANY_DOMAINS` | api-gateway, website | ❌ | — | Comma-separated allowed signup domains |
| `AGENTFARM_COMPANY_FALLBACK_DOMAINS` | api-gateway, website | ❌ | `agentfarm.local` | Fallback domain for local dev signups |
| `AGENTFARM_DISABLE_COMPANY_FALLBACK` | api-gateway, website | ❌ | `false` | Disable fallback domain in production |
| `AGENTFARM_ALLOWED_SIGNUP_DOMAINS` | api-gateway, website | ❌ | — | Open signup domain allow-list |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | website | ❌ | — | Stripe publishable key for frontend |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | website | ❌ | — | Razorpay key ID for frontend |

---

## Local Development

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start infrastructure (PostgreSQL, Redis)

```bash
docker compose up -d postgres redis
```

Or with VoxCPM2 TTS:

```bash
docker compose up -d
```

### 3. Database setup

```bash
# Apply all migrations
pnpm --filter @agentfarm/db-schema migrate:dev

# Or push schema directly in dev (no migration file created)
pnpm --filter @agentfarm/db-schema db:push
```

### 4. Start services

In separate terminals:

```bash
# API Gateway (port 3000)
pnpm --filter @agentfarm/api-gateway dev

# Website (port 3002)
pnpm --filter @agentfarm/website dev

# Dashboard (port 3001)
pnpm --filter @agentfarm/dashboard dev

# Agent Runtime (port 3003)
pnpm --filter @agentfarm/agent-runtime dev

# Trigger Service (port: TRIGGER_SERVICE_PORT)
pnpm --filter @agentfarm/trigger-service dev
```

Or start everything with the walkthrough script:

```bash
pnpm walkthrough
# or
node walkthrough.mjs
```

---

## Database Management

All Prisma commands run through the `@agentfarm/db-schema` package.

```bash
# Generate Prisma client after schema changes
pnpm --filter @agentfarm/db-schema prisma generate

# Create a new migration (dev)
pnpm --filter @agentfarm/db-schema prisma migrate dev --name add_feature_x

# Apply migrations in production
pnpm --filter @agentfarm/db-schema prisma migrate deploy

# Validate schema
pnpm --filter @agentfarm/db-schema prisma validate

# Seed pricing plans (Starter / Professional / Enterprise)
pnpm --filter @agentfarm/api-gateway seed

# Reset DB (dev only — destructive)
pnpm --filter @agentfarm/db-schema prisma migrate reset

# Open Prisma Studio (GUI)
pnpm --filter @agentfarm/db-schema prisma studio
```

---

## Quality Gate

Run the full quality gate before any release:

```bash
pnpm quality:gate
```

This executes 47 checks including:
- TypeScript compilation across all packages
- `pnpm test` across all packages
- `pnpm lint` across all packages
- Coverage enforcement (≥ 80% line coverage on critical modules)
- DB smoke lane (skipped if PostgreSQL not available)

Individual commands:

```bash
pnpm typecheck       # TypeScript across all packages
pnpm test            # All tests
pnpm lint            # ESLint across all packages
pnpm build           # Full production build
```

---

## Docker Compose Services

`docker-compose.yml` defines:

| Service | Image | Port | Purpose |
|---|---|---|---|
| `postgres` | `postgres:16` | 5432 | Primary PostgreSQL database |
| `redis` | `redis:7` | 6379 | Session cache and task queue |
| `voxcpm2` | `docker/voxcpm2/` | 17493 | VoxCPM2 TTS voice synthesis |

### Application Port Map

| Service | Default Port | Env Override |
|---|---|---|
| `api-gateway` | 3000 | `API_GATEWAY_PORT` |
| `dashboard` | 3001 | — |
| `website` | 3002 | — |
| `agent-runtime` | 3003 | `AGENT_RUNTIME_PORT` |
| `trigger-service` | — | `TRIGGER_SERVICE_PORT` |
| `postgres` | 5432 | (in DATABASE_URL) |
| `redis` | 6379 | (in REDIS_URL) |
| `voxcpm2` | 17493 | (in VOICEBOX_URL) |

---

## Azure Production Deployment

> **Status:** Deployment requires Azure sign-in (tracked in ops runbook). SWA deployment blocked on `AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE` GitHub secret.

### Control Plane Resources

Infrastructure definitions in `infrastructure/control-plane/`:
- Azure App Service for API Gateway
- Azure PostgreSQL Flexible Server
- Azure Redis Cache
- Azure Container Registry
- Azure Key Vault (connector OAuth tokens, secrets)
- Azure Blob Storage (evidence screenshots, compliance exports)

Deploy with:
```bash
cd infrastructure/control-plane
az deployment group create \
  --resource-group agentfarm-prod \
  --template-file main.bicep \
  --parameters @params.json
```

### Runtime Plane Resources

Infrastructure definitions in `infrastructure/runtime-plane/`:
- Azure VM (per-tenant agent runtime)
- Network interface, disk, boot diagnostics
- cloud-init bootstrap script (installs Docker, pulls agent image)

VMs are provisioned dynamically by the `ProvisioningWorker` in api-gateway. The IaC in `runtime-plane/` defines the template; the worker creates instances on demand.

### Website (Azure Static Web Apps)

```bash
# GitHub Actions workflow: .github/workflows/website-swa.yml
# Requires: AZURE_STATIC_WEB_APPS_API_TOKEN_WEBSITE (GitHub secret)
```

The website auto-deploys on push to `main` via GitHub Actions once the SWA token secret is configured.

### CI/CD Pipeline

```
Push to main
     │
     ▼
GitHub Actions CI (.github/workflows/)
     ├─ typecheck all packages
     ├─ test all packages
     ├─ lint all packages
     ├─ build website → Azure SWA deploy
     └─ build api-gateway → Azure App Service deploy
```

---

## Webhook Configuration

### Stripe Webhooks

1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://your-domain.com/v1/billing/webhook/stripe`
3. Select event: `payment_intent.succeeded`
4. Copy signing secret → `STRIPE_WEBHOOK_SECRET` env var

### Razorpay Webhooks

1. Go to Razorpay Dashboard → Account & Settings → Webhooks
2. Add endpoint: `https://your-domain.com/v1/billing/webhook/razorpay`
3. Select event: `payment.captured`
4. Copy webhook secret → `RAZORPAY_KEY_SECRET` is used for HMAC verification

### Zoho Sign Webhooks

1. Go to Zoho Sign → Settings → Webhooks
2. Add endpoint: `https://your-domain.com/v1/webhooks/zoho-sign`
3. Set a secret token → `ZOHO_SIGN_WEBHOOK_TOKEN` env var
4. Select trigger: `Document Completed`

Website proxy route: `https://your-domain.com/api/webhooks/zoho-sign` — this proxies to the API gateway internally.

---

## Agent Runtime VM Configuration

Each provisioned VM runs:

```
Docker container: agentfarm-agent-runtime:latest
  Port: 3100 (internal)
  Env:
    AGENT_TENANT_ID=<tenant_id>
    WORKSPACE_ID=<workspace_id>
    BOT_ID=<bot_id>
    API_GATEWAY_URL=https://api.agentfarm.ai
    VOICEBOX_URL=http://voicebox:17493
    DESKTOP_OPERATOR=native
    DATABASE_URL=<injected from Key Vault>
```

The VM bootstrap script (`cloud-init`) performs:
1. Update system packages
2. Install Docker CE
3. Docker login to Azure Container Registry
4. Pull `agentfarm-agent-runtime:latest`
5. Write environment variables from secure Key Vault references
6. Start container with `--restart=always`
7. Register health probe with API gateway

---

## Monitoring and Alerts

- **Provisioning SLA**: 10-minute target, stuck-state alert after 1 hour, hard timeout 24 hours
- **Runtime health probe**: per-bot `/health` checked by provisioning worker post-deploy
- **Evidence freshness score**: measured in evidence-service; SLA breach alerts fire when score < threshold
- **Kill-switch**: activated by admin via `/v1/governance/kill-switch`; all medium/high agent actions blocked within 30 seconds
- **Budget enforcement**: per-workspace daily/monthly cost caps; hard stop blocks execution when exceeded

---

## Security Checklist (Pre-Production)

- [ ] All secrets in environment variables — no hardcoded values
- [ ] `STRIPE_WEBHOOK_SECRET` configured and Stripe webhook registered
- [ ] `RAZORPAY_KEY_SECRET` configured and Razorpay webhook registered
- [ ] `ZOHO_SIGN_WEBHOOK_TOKEN` configured and Zoho Sign webhook registered
- [ ] `ZOHO_CLIENT_ID` and `ZOHO_CLIENT_SECRET` configured with Zoho OAuth credentials
- [ ] Database behind VNet or firewall (no public endpoint)
- [ ] Redis requires auth (`requirepass` in redis.conf)
- [ ] Key Vault access policies configured for API gateway managed identity
- [ ] HTTPS enforced on all public endpoints (no HTTP redirect)
- [ ] OPA policies deployed and `OPA_BASE_URL` configured
- [ ] `DESKTOP_OPERATOR=native` in production (not `mock`)
- [ ] Rate limiting configured and tested
- [ ] Audit log retention policy set (365-day active / 730-day archive)
