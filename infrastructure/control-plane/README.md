# Control Plane Infrastructure

This folder contains shared control-plane IaC for AgentFarm.

## Status

IaC templates are in place. Production deployment is pending Azure sign-in (Tasks 8.2/8.3). See [operations/runbooks/mvp-launch-ops-runbook.md](../../operations/runbooks/mvp-launch-ops-runbook.md) for execution steps.

Application quality gate: **47/47 PASS** (2026-05-23, Sprint 18). All service code is production-ready pending infrastructure provisioning.

## Planned Resources (MVP)

| Resource | Purpose |
|----------|---------|
| Azure PostgreSQL + pgvector | Primary relational store + vector embeddings for episodic/semantic memory |
| Azure Redis | Session cache and ephemeral queue backing |
| Azure Container Registry | Bot, runtime, and desktop-agent container images |
| Azure Key Vault | Connector OAuth tokens, session secrets — stored as `kv://` references only |
| Azure Monitor Workspace | Structured logging and telemetry for all services |
| Azure OpenAI (embeddings) | text-embedding-3-small for pgvector episodic + semantic memory |

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

<!-- doc-sync: 2026-05-29 sprint-18 -->
> Last synchronized: 2026-05-29 (Sprint 18 — production-ready service code, pgvector added to required resources).
