# AgentFarm Spec: Azure Provisioning Workflow

## Purpose
Define the end-to-end workflow that provisions the isolated Azure runtime for a workspace bot.

## Scope
1. Covers provisioning from queued job to healthy runtime.
2. Covers Azure resource creation, VM bootstrap, Docker startup, and rollback behavior.
3. Assumes shared control plane already exists.

## Trigger
Provisioning begins when:
1. Signup creates the default workspace bot.
2. A new workspace is created for an existing tenant.
3. A suspended or failed runtime needs reprovisioning.

## Workflow Summary
1. Create provisioning job.
2. Validate plan and runtime entitlement.
3. Create Azure resources.
4. Bootstrap VM.
5. Start Docker runtime.
6. Register runtime with control plane.
7. Run health checks.
8. Mark workspace and bot ready.

## State Machine
### Job states
1. queued
2. validating
3. creating_resources
4. bootstrapping_vm
5. starting_container
6. registering_runtime
7. healthchecking
8. completed
9. failed
10. cleanup_pending
11. cleaned_up

### Workspace runtime states
1. pending
2. provisioning
3. ready
4. degraded
5. failed
6. suspended

## Detailed Provisioning Steps
### Step 1: Create Job
Input:
1. tenant_id
2. workspace_id
3. bot_id
4. plan_tier
5. runtime_tier

Actions:
1. Insert provisioning_jobs record.
2. Lock workspace from duplicate provisioning.
3. Emit provisioning_event.job_created.

### Step 2: Validate Entitlement
Checks:
1. Tenant plan allows requested runtime tier.
2. Workspace does not already have active runtime.
3. Required bot role and policy pack exist.
4. Azure quota and allowed region are valid.

Failure:
1. Mark job failed with reason.
2. Emit provisioning_event.validation_failed.

### Step 3: Create Azure Resources
Resources:
1. Resource group
2. Managed identity
3. Network interface
4. Network security group
5. VM OS disk
6. Azure VM
7. Monitoring agent or extension

Rules:
1. Use managed identity.
2. Deny broad public inbound access.
3. Tag all resources with tenant_id, workspace_id, bot_id, environment, and cleanup policy.

### Step 4: VM Bootstrap
Bootstrap tasks:
1. Install Docker.
2. Configure container runtime policies.
3. Configure logging agent.
4. Configure runtime startup service.
5. Validate managed identity availability.

Output:
1. bootstrap_status = success or failed
2. Emit provisioning_event.bootstrap_completed.

### Step 5: Pull and Start Container
Actions:
1. Authenticate to container registry using managed identity.
2. Pull approved bot runtime image.
3. Inject runtime config and secret references.
4. Start container with restart policy.
5. Store runtime instance metadata.

Constraints:
1. No privileged container mode.
2. No hardcoded secrets in image or compose file.
3. Only approved ports exposed.

### Step 6: Register Runtime
Actions:
1. Bot runtime calls control plane registration endpoint.
2. Control plane stores runtime endpoint, version, heartbeat status, and last_seen_at.
3. Dashboard status switches from provisioning to bootstrapping or ready depending on health.

### Step 7: Health Check
Checks:
1. VM reachable from control plane through allowed path.
2. Container is running.
3. Runtime heartbeat received.
4. Policy service connectivity works.
5. Evidence logging channel works.

Success:
1. Mark job completed.
2. Mark workspace runtime ready.
3. Mark bot active.
4. Emit provisioning_event.completed.

Failure:
1. Mark job failed.
2. Mark workspace degraded or failed.
3. Trigger cleanup policy if configured.

## Cleanup and Rollback
### Partial failure policy
1. Keep resources for investigation when failure is non-destructive and tagged inspect=true.
2. Cleanup resources automatically for known bootstrap failures when safe.
3. Record cleanup result in provisioning_jobs.

### Cleanup steps
1. Stop container if running.
2. Delete VM.
3. Delete NIC and NSG.
4. Delete identity if no longer needed.
5. Delete resource group if workspace has no retained assets.

## Security Controls
1. Control plane uses least-privilege Azure RBAC.
2. Runtime uses managed identity to fetch secrets.
3. Key Vault stores connector secrets and bootstrap tokens.
4. VM inbound access restricted by NSG.
5. Bastion or private management path preferred.
6. Provisioning actions are fully audited.

## Required Logs and Events
1. provisioning_event.job_created
2. provisioning_event.validation_started
3. provisioning_event.validation_failed
4. provisioning_event.resources_created
5. provisioning_event.bootstrap_completed
6. provisioning_event.container_started
7. provisioning_event.runtime_registered
8. provisioning_event.healthcheck_failed
9. provisioning_event.completed
10. provisioning_event.cleanup_completed

## Control Plane Interfaces
1. POST /internal/provisioning/jobs
2. POST /internal/provisioning/jobs/{jobId}/start
3. POST /internal/runtime/register
4. POST /internal/runtime/heartbeat
5. POST /internal/provisioning/jobs/{jobId}/cleanup

## Open Questions Closed by This Spec
1. Runtime provisioning is asynchronous.
2. Runtime registration is required before bot becomes active.
3. Cleanup behavior is explicit and auditable.
4. Azure VM plus Docker remains the v1 secure default for entitled plans.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
