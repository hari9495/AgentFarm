# Runtime Plane Infrastructure

This folder contains per-tenant runtime IaC templates for AgentFarm.

## Status

IaC templates are planned. The provisioning state machine is fully implemented in `services/provisioning-service/src/`. Production deployment is blocked pending Azure sign-in (Tasks 8.2/8.3).

Application quality gate: **PASS** (EXIT_CODE=0, 2026-05-04). Provisioning service has 15 tests passing. All service code is production-ready pending infrastructure provisioning.

## Planned Resources Per Tenant

| Resource | Purpose |
|----------|---------|
| Resource Group | Isolated tenant resource boundary |
| Virtual Machine | Bot runtime host (Docker container) |
| NIC + NSG | Network interface with security group rules |
| Managed Disk | Persistent storage for bot workspace |
| Managed Identity | Least-privilege identity for Key Vault and Azure API access |
| Monitoring Agent | Telemetry forwarding to control-plane monitoring workspace |

## Provisioning Flow

The VM bootstrap sequence is orchestrated by `services/provisioning-service`:

1. `queued` → `validating` → `creating_resource_group`
2. `creating_vm` → `bootstrapping_docker`
3. Docker cloud-init: installs Docker, pulls bot image, injects env vars via Key Vault references
4. `registering_runtime` → `health_checking` → `completed`
5. On failure: rollback, cleanup, audit log, dashboard alert with remediation hint

## SLA Targets

- Provisioning target: < 10 minutes end-to-end
- Timeout: 24 hours (auto-remediation triggered)
- Stuck-state alert: after 1 hour in any non-terminal state

## Notes

- Inline secrets are rejected at the VM bootstrap stage — only Key Vault references are injected
- Auto-restart policy configured on Docker containers
- Health probes enabled on the runtime container

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
