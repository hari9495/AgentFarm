# Control Plane Infrastructure

This folder contains shared control-plane IaC for AgentFarm.

## Status

IaC templates are planned. Production deployment is blocked pending Azure sign-in (Tasks 8.2/8.3). See [operations/runbooks/mvp-launch-ops-runbook.md](../../operations/runbooks/mvp-launch-ops-runbook.md) for execution steps.

Application quality gate: **PASS** (EXIT_CODE=0, 2026-05-04). All service code is production-ready pending infrastructure provisioning.

## Planned Resources (MVP)

| Resource | Purpose |
|----------|---------|
| Azure PostgreSQL | Primary relational store for tenant, workspace, bot, approval, and audit records |
| Azure Redis | Session cache and ephemeral queue backing |
| Azure Container Registry | Bot and runtime container images |
| Azure Key Vault | Connector OAuth tokens, session secrets — stored as `kv://` references only |
| Azure Monitor Workspace | Structured logging and telemetry for all services |

## Deployment Approach

Preferred tooling: `azd` (Azure Developer CLI) with Bicep templates.

```bash
# Validate before provisioning
azd provision --preview

# Provision and deploy
azd up
```

## Notes

- No secrets are ever stored in IaC templates or source code
- All connector credentials must be injected via Key Vault references at runtime
- Least-privilege managed identities for all service-to-service access
