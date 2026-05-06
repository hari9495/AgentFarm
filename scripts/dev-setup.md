# AgentFarm — Local Development Setup

## Prerequisites

- Node.js v20+ or v24 (v24.13.1 confirmed working)
- pnpm (install: `npm install -g pnpm`)
- Optional: Docker (for DB runtime snapshot smoke lane and `docker-compose.yml` services)
- Optional: Azure CLI (`az`) for production deployment and Key Vault integration

---

## 1. Install All Dependencies

```bash
pnpm install
```

---

## 2. Configure Environment

```bash
cp .env.example .env
```

Minimum variables for local development:

```env
AGENTFARM_ALLOWED_SIGNUP_DOMAINS=agentfarm.local
SESSION_SECRET=your-local-dev-secret-at-least-32-chars
WEBSITE_AUTH_DB_PATH=.auth.sqlite
```

For connector OAuth flows, also set:
```env
CONNECTOR_GITHUB_CLIENT_ID=...
CONNECTOR_GITHUB_CLIENT_SECRET=...
CONNECTOR_JIRA_CLIENT_ID=...
CONNECTOR_JIRA_CLIENT_SECRET=...
CONNECTOR_TEAMS_CLIENT_ID=...
CONNECTOR_TEAMS_CLIENT_SECRET=...
```

---

## 3. Start Local Services (Optional)

Docker services (PostgreSQL, Redis) are optional for most local workflows. The website uses SQLite by default.

```bash
docker compose up -d
```

---

## 4. Run Applications

```bash
# Website (product surface, onboarding, connector dashboard, approvals, evidence)
pnpm --filter @agentfarm/website dev
# → http://localhost:3002

# API Gateway (control-plane API)
pnpm --filter @agentfarm/api-gateway dev
# → http://localhost:3001

# Operator Dashboard
pnpm --filter @agentfarm/dashboard dev
# → http://localhost:3000
```

---

## 5. Run Tests

```bash
# API Gateway — 351 tests
pnpm --filter @agentfarm/api-gateway test

# Agent Runtime — 239 tests
pnpm --filter @agentfarm/agent-runtime test

# Dashboard — 69 tests
pnpm --filter @agentfarm/dashboard test

# Notification service — 31 tests
pnpm --filter @agentfarm/notification-service test

# Provisioning service — 15 tests
pnpm --filter @agentfarm/provisioning-service test

# Website tests (individual suites)
pnpm --filter @agentfarm/website test:signup
pnpm --filter @agentfarm/website test:session-auth
pnpm --filter @agentfarm/website test:permissions
pnpm --filter @agentfarm/website test:provisioning
pnpm --filter @agentfarm/website test:provisioning-ui
pnpm --filter @agentfarm/website test:approvals        # Task 5.2/5.3 approval flow
pnpm --filter @agentfarm/website test:evidence         # Task 6.1/6.2 evidence compliance
pnpm --filter @agentfarm/website test:deployments
pnpm --filter @agentfarm/website test:deployments:ui

# Full quality gate (47 checks — 46 pass, 1 skipped: DB smoke)
pnpm quality:gate

# E2E smoke lane
pnpm smoke:e2e
```

---

## 6. Typechecks

```bash
# Check individual packages
pnpm --filter @agentfarm/website typecheck
pnpm --filter @agentfarm/api-gateway typecheck
pnpm --filter @agentfarm/agent-runtime typecheck
pnpm --filter @agentfarm/dashboard typecheck

# Check all packages
pnpm typecheck
```

---

## 7. Manual Walkthrough

A manual walkthrough script is available at the repo root:

```bash
# PowerShell
.\walkthrough.ps1

# Node.js
node walkthrough.mjs
```

This validates: signup, login, provisioning status, connector API, approval API, and audit API.

---

## Common Workflows

| Task | Command |
|------|---------|
| Start website only | `pnpm --filter @agentfarm/website dev` |
| Run all website tests | `pnpm --filter @agentfarm/website test:approvals` (etc.) |
| Run quality gate | `pnpm quality:gate` || View dependency graph | `node scripts/graphify.mjs` |
| View graph as DOT | `node scripts/graphify.mjs --dot` |
| View graph as JSON | `node scripts/graphify.mjs --json` || Typecheck website | `pnpm --filter @agentfarm/website typecheck` |
| Build for production | `pnpm --filter @agentfarm/website build` |

---

## Troubleshooting

- **Signup returns 403**: Set `AGENTFARM_ALLOWED_SIGNUP_DOMAINS=agentfarm.local` in `.env`
- **SQLite experimental warning**: Expected on Node.js v24 — not an error
- **DB runtime snapshot SKIP**: Requires Docker running — safe to skip for local dev
- **Azure extension not signed in**: Non-blocking for local development; required only for Tasks 7.1/8.2/8.3

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).
