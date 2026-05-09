# Deployment Guide

> AgentFarm production deployment reference.
> Last updated: 2026-05-10

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

### Core

```env
DATABASE_URL=postgresql://agentfarm:agentfarm@localhost:5432/agentfarm
REDIS_URL=redis://localhost:6379
OPA_BASE_URL=http://localhost:8181
API_GATEWAY_PORT=3000
```

### Voice / TTS

```env
VOICEBOX_URL=http://voicebox:17493
VOXCPM2_MODEL_ID=openbmb/VoxCPM2
```

### Auth / Signup Control

```env
AGENTFARM_COMPANY_EMAILS=           # comma-separated allowed emails
AGENTFARM_COMPANY_DOMAINS=          # comma-separated allowed domains
AGENTFARM_COMPANY_FALLBACK_DOMAINS=agentfarm.local
AGENTFARM_DISABLE_COMPANY_FALLBACK=false
```

Enable open signup in local dev:
```env
AGENTFARM_ALLOWED_SIGNUP_DOMAINS=agentfarm.local
```

### Email (SMTP)

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=user@example.com
SMTP_PASS=your-smtp-password
```

### Desktop Operator

```env
DESKTOP_OPERATOR=native            # native | mock
DESKTOP_OPERATOR_SESSION_ID=       # optional platform session ID
BROWSER_PROFILE_DIR=./data/browser-profiles
```

Set `DESKTOP_OPERATOR=mock` to route all Tier 11/12 desktop actions through the `MockDesktopOperator` without executing real platform automation (safe for dev/CI).

### Payments

```env
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
RAZORPAY_KEY_ID=rzp_test_placeholder
RAZORPAY_KEY_SECRET=rzp_secret_placeholder
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_test_placeholder
```

### Zoho Sign (E-signature)

```env
ZOHO_CLIENT_ID=zoho_client_id_placeholder
ZOHO_CLIENT_SECRET=zoho_client_secret_placeholder
ZOHO_SIGN_WEBHOOK_TOKEN=zoho_webhook_token_placeholder
```

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

# Trigger Service (port 3003)
pnpm --filter @agentfarm/trigger-service dev

# Agent Runtime
pnpm --filter @agentfarm/agent-runtime dev
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
pnpm --filter @agentfarm/db-schema generate

# Create a new migration
pnpm --filter @agentfarm/db-schema migrate:dev -- --name add_feature_x

# Apply migrations in production
pnpm --filter @agentfarm/db-schema migrate:deploy

# Reset DB (dev only — destructive)
pnpm --filter @agentfarm/db-schema db:reset

# Open Prisma Studio (GUI)
pnpm --filter @agentfarm/db-schema studio
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
