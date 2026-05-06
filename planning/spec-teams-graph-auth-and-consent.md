# AgentFarm Spec: Teams Graph Auth and Consent

## Purpose
Define authentication, authorization, tenant consent, and permission governance for Teams meeting participation and chat actions in AgentFarm.

## Scope
1. Covers Microsoft Entra app registration model.
2. Covers OAuth flows for control plane and background services.
3. Covers Microsoft Graph permission strategy and admin consent.
4. Covers token handling, rotation, revocation, and audit.
5. Does not define non-Microsoft connector auth in this spec.

## Design Principles
1. Least privilege by default.
2. Explicit admin consent before any tenant-level meeting participation.
3. Clear separation of user-delegated and application permissions.
4. No hardcoded secrets; secure credential storage only.
5. Full traceability for consent and permission changes.

## Identity Architecture
### Entra Application Components
1. AgentFarm Control Plane App Registration
- Confidential client for web APIs and orchestration.
2. AgentFarm Dashboard Client App Registration
- Public client for user sign-in and tenant admin setup.
3. Optional Worker Identity
- Managed identity for Azure-hosted background services where supported.

### Tenant Model
1. Multi-tenant onboarding is supported.
2. Each customer tenant must complete explicit consent flow.
3. Consent is tracked per tenant_id and workspace_id policy profile.

## OAuth Flow Design
### 1. Admin onboarding flow
1. Tenant admin signs in through Entra.
2. Admin is guided to consent required Graph scopes.
3. Control plane receives consent grant result and tenant metadata.
4. Tenant status updates to consented or consent_failed.

### 2. User delegated flow
Use for:
1. Dashboard actions performed as signed-in user.
2. Interactive setup and connector verification.

Requirements:
1. Authorization code flow with PKCE for dashboard client.
2. Short-lived access token and refresh token handling.
3. Conditional access and MFA follow tenant policy.

### 3. Service-to-service flow
Use for:
1. Meeting worker orchestration and webhook processing.
2. Scheduled meeting operations and summaries.

Requirements:
1. Client credentials flow for confidential service.
2. Certificate-based credentials preferred over client secrets.
3. Key rotation policy enforced.

## Graph Permission Strategy
### Baseline permissions for Phase 2
1. Sign-in and profile
- User.Read (delegated)

2. Teams and meeting participation
- Required permissions are reviewed and approved per feature.
- Start with read and join capabilities before write-heavy scopes.

3. Chat and response delivery
- Limit send/write scopes to required channels only.

4. Calendar and meeting metadata
- Request only meeting metadata scopes needed for join lifecycle.

### Permission governance rules
1. New Graph scope requires architecture review and ADR update.
2. Every scope maps to one or more product capabilities.
3. Unused scopes are removed in the next release cycle.
4. High-impact scopes require Security and Safety Lead signoff.

## Consent Experience and States
### Consent states
1. not_started
2. pending_admin_action
3. consented
4. partially_consented
5. revoked
6. failed

### Consent workflow
1. Trigger: admin selects Teams meeting feature enablement.
2. Show scope summary with plain-language explanation.
3. Collect admin consent.
4. Validate effective permissions.
5. Persist consent grant metadata.
6. Run post-consent health check.
7. Mark connector state connected or degraded.

## Token and Credential Management
1. Store secrets and certificates in Key Vault.
2. Prefer certificates over shared client secrets for production.
3. Access tokens are never persisted in plaintext logs.
4. Refresh and retry logic uses bounded backoff.
5. Token cache is encrypted at rest.
6. Revocation events force cache invalidation.

## Revocation and Re-Consent
### Revocation triggers
1. Admin revokes enterprise app permissions.
2. Scope set changes and tenant re-consent is required.
3. Security incident or credential compromise.

### Revocation behavior
1. Mark consent_state as revoked.
2. Disable Teams meeting actions for affected workspace.
3. Create incident and admin notification.
4. Require re-consent before reactivation.

## API Surface (Auth and Consent)
1. POST /tenants/{tenantId}/teams/consent/start
- Start admin consent flow.

2. GET /tenants/{tenantId}/teams/consent/status
- Return current consent state and last validation result.

3. POST /tenants/{tenantId}/teams/consent/validate
- Validate granted scopes against required feature matrix.

4. POST /tenants/{tenantId}/teams/consent/revoke
- Mark local state revoked and disable Teams actions.

5. GET /tenants/{tenantId}/teams/permissions
- Return effective permission matrix and feature eligibility.

## Data Model
### 1. tenant_consent_records
1. consent_record_id
2. tenant_id
3. provider
4. consent_state
5. granted_scopes
6. granted_by_user_id
7. granted_at
8. expires_at
9. validation_status
10. last_checked_at

### 2. app_permission_catalog
1. permission_id
2. permission_name
3. permission_type
4. capability_tag
5. risk_level
6. required_phase
7. active_flag

### 3. tenant_permission_effective
1. tenant_id
2. permission_id
3. effective_state
4. source
5. updated_at

### 4. auth_events
1. auth_event_id
2. tenant_id
3. workspace_id
4. event_type
5. result
6. reason
7. actor
8. correlation_id
9. created_at

## Audit and Compliance Requirements
1. Every consent action logs actor, scopes, timestamp, and outcome.
2. Permission validation logs include missing scope detail.
3. Revocation handling logs include automated shutdown actions.
4. Authentication failures include correlation IDs for investigation.
5. Consent evidence is retained under tenant compliance policy.

## Security Controls
1. Enforce HTTPS and secure redirect URIs.
2. Validate tokens for issuer, audience, and expiration.
3. Apply CSRF protection in interactive OAuth flows.
4. Restrict callback endpoints with strict allowlist.
5. Use managed identity where supported to reduce secret surface.
6. Block feature activation if consent state is not consented.

## Operational Metrics
1. Consent completion rate.
2. Time to consent completion.
3. Permission validation failure rate.
4. Token refresh failure rate.
5. Revocation detection latency.

## Rollout by Phase
### Phase 2
1. Admin consent onboarding.
2. Baseline scopes for Teams meeting participation and standup mode.
3. Consent status visibility in dashboard.

### Phase 3
1. Expanded scopes for interactive Q and A and richer response delivery.
2. Policy-gated capability enablement by effective permissions.

### Phase 4
1. Interview mode permission extensions.
2. Additional governance controls and stricter review checks.

## Definition of Done
1. Tenant admin can complete consent flow successfully.
2. Effective permission matrix is visible and auditable.
3. Teams features are automatically gated by consent state.
4. Revocation disables meeting actions safely within SLA.
5. Auth and consent events are queryable in evidence APIs.

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
