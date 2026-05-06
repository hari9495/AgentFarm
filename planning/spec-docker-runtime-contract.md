# AgentFarm Spec: Docker Runtime Contract

## Purpose
Define the runtime container contract for MVP bots, including startup, health, restart, and failure behavior.

## Scope
1. Covers container lifecycle on isolated Azure VM runtime hosts.
2. Covers required runtime inputs, startup sequence, health checks, and restart policy.
3. Covers kill switch behavior and failure-state transitions.
4. Does not define image build pipeline details.

## Runtime Contract Principles
1. Bot process runs only inside Docker container.
2. Container must run unprivileged.
3. Secrets are provided at runtime via secure references.
4. Runtime must emit structured events for all lifecycle transitions.

## Runtime Inputs
1. tenant_id
2. workspace_id
3. bot_id
4. role_profile
5. policy_pack_version
6. connector_config_refs
7. approval_service_endpoint
8. evidence_api_endpoint
9. observability_endpoints
10. runtime_contract_version

## Required Environment Variables
1. AF_TENANT_ID
2. AF_WORKSPACE_ID
3. AF_BOT_ID
4. AF_ROLE_PROFILE
5. AF_POLICY_PACK_VERSION
6. AF_APPROVAL_API_URL
7. AF_EVIDENCE_API_URL
8. AF_HEALTH_PORT
9. AF_LOG_LEVEL
10. AF_RUNTIME_CONTRACT_VERSION

## Startup Contract
### Pre-start checks
1. Required environment variables are present.
2. Managed identity token retrieval succeeds.
3. Connector secret references are reachable.
4. Policy pack is fetchable.

### Startup sequence
1. runtime.init_started
2. runtime.config_loaded
3. runtime.policy_loaded
4. runtime.connector_bindings_loaded
5. runtime.worker_loops_started
6. runtime.ready

### Startup failure behavior
1. Emit runtime.init_failed with failure reason.
2. Exit non-zero for orchestrated restart.
3. After retry threshold, mark bot status failed and trigger incident tag.

## Runtime State Machine
1. created
2. starting
3. ready
4. active
5. degraded
6. paused
7. stopping
8. stopped
9. failed

## Health Contract
### Liveness endpoint
1. Path: /health/live
2. Expectation: process loop is alive.
3. Failure action: restart container.

### Readiness endpoint
1. Path: /health/ready
2. Expectation: policy, approval API, and evidence API dependencies are reachable.
3. Failure action: mark degraded and stop new task intake.

### Dependency health checks
1. Approval API reachability
2. Evidence API reachability
3. Connector health aggregation
4. Policy service reachability

## Restart Contract
### Restart policy
1. Use always restart policy for runtime process crashes.
2. Bounded backoff between restart attempts.
3. Escalate to failed state after max consecutive restart failures.

### Restart thresholds
1. max_restart_attempts_window: 5
2. restart_window_minutes: 15
3. escalation_on_threshold: true

### Restart events
1. runtime.restart_scheduled
2. runtime.restart_started
3. runtime.restart_succeeded
4. runtime.restart_failed

## Kill Switch Contract
1. Kill switch source of truth is control plane.
2. Runtime polls or receives signed kill-switch event.
3. On trigger:
- stop action execution loops
- reject new high and medium-risk actions
- emit runtime.killswitch_engaged
4. Resume requires authorized control-plane signal.

## Failure Classification
1. config_error
2. dependency_unreachable
3. auth_failure
4. connector_binding_failure
5. runtime_exception
6. policy_unavailable

## Failure-State Handling
### degraded
1. Existing non-risky operations may continue if safe.
2. New risky actions require strict pause or escalation.
3. Dashboard must show degraded reason.

### failed
1. Stop task intake.
2. Trigger incident workflow.
3. Require explicit recovery action.

## Logging and Event Requirements
1. Every state transition must emit event with tenant_id, workspace_id, bot_id, and correlation_id.
2. Startup and restart failures must include failure_class and remediation_hint.
3. Kill switch events must include actor and reason.

## Security Contract
1. No root container execution for bot process.
2. Filesystem write scope is minimal and documented.
3. No plaintext secret output in logs.
4. Image provenance and digest must be pinned at deployment.

## Performance Targets
1. startup_time_p95 <= 90 seconds
2. readiness_time_p95 <= 120 seconds
3. restart_recovery_p95 <= 60 seconds
4. health_probe_success_rate >= 99.5 percent

## Acceptance Criteria
1. Runtime starts successfully with complete config package.
2. Runtime fails safely with clear failure classification on missing dependencies.
3. Health endpoints accurately reflect live and ready states.
4. Restart behavior follows threshold rules and escalates correctly.
5. Kill switch halts risky execution immediately and logs evidence.

## Related Specs
1. planning/engineering-execution-design.md
2. planning/spec-product-structure-model-architecture.md
3. planning/spec-azure-provisioning-workflow.md

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).
