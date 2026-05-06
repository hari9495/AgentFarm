# AgentFarm Spec: Incident and Runbook Pack

## Purpose
Define incident classes, response workflows, and operational runbooks required for MVP reliability and safety.

## Scope
1. Covers MVP incidents for provisioning, runtime, approvals, connectors, and tenant suspension.
2. Covers severity model, ownership model, and escalation SLAs.
3. Covers runbook entry and exit conditions.
4. Does not introduce new product scope.

## MVP Scope Guardrail
1. This pack supports only Developer Agent operations.
2. This pack supports only Jira, Microsoft Teams, GitHub, and company email connectors.
3. Meeting voice and HR interview incidents are post-MVP and out of this runbook pack.

## Incident Severity Model
1. Sev-1
- Core production path unavailable or unsafe behavior risk.
- Example: approvals cannot be enforced and risky actions may execute.

2. Sev-2
- Core path degraded with partial service impact.
- Example: connector operations failing for one provider across tenants.

3. Sev-3
- Limited-impact issue with workaround.
- Example: delayed audit view refresh with no data loss.

4. Sev-4
- Minor issue or documentation discrepancy.
- Example: runbook step wording mismatch with latest dashboard label.

## Ownership and Escalation
1. Incident Commander
- Owns coordination, timeline, status updates.

2. Engineering Lead
- Owns technical triage and remediation execution.

3. Security and Safety Lead
- Owns safety checks and risky-action containment.

4. Customer Success Lead
- Owns customer communication and impact tracking.

### Escalation SLAs
1. Sev-1 acknowledgment <= 5 minutes.
2. Sev-2 acknowledgment <= 15 minutes.
3. Sev-3 acknowledgment <= 60 minutes.
4. Sev-1 mitigation target <= 60 minutes.

## Common Incident Workflow
1. Detect alert or user report.
2. Classify severity and assign Incident Commander.
3. Contain risk path.
4. Execute runbook for incident type.
5. Verify service recovery and safety state.
6. Publish incident summary.
7. Record post-incident actions.

## Runbook 1: Provisioning Failure
### Trigger
1. provisioning job enters failed state.

### Checks
1. Validate Azure API and quota status.
2. Validate managed identity and Key Vault access.
3. Validate VM bootstrap step outputs.

### Immediate Actions
1. Pause duplicate retries for same workspace.
2. Capture failure_class and correlation_id.
3. Apply bounded retry if transient.

### Recovery
1. Re-run provisioning step from last safe checkpoint.
2. If repeated failure, mark workspace as failed and notify admin.
3. Queue cleanup for partial resources.

### Exit Criteria
1. Workspace runtime reaches ready or explicit failed with customer-visible reason.

## Runbook 2: Connector Token Expiry
### Trigger
1. connector state transitions to token_expired.

### Checks
1. Confirm refresh attempt history.
2. Confirm provider-side token revocation vs natural expiry.
3. Validate secure store reference integrity.

### Immediate Actions
1. Disable connector write actions.
2. Notify tenant admin with reauth link.
3. Preserve read-only status when safe.

### Recovery
1. Complete refresh or re-consent flow.
2. Re-run scope validation.
3. Return state to connected or degraded.

### Exit Criteria
1. Connector state is connected or explicitly permission_invalid with remediation guidance.

## Runbook 3: Runtime Crash Recovery
### Trigger
1. Runtime restart threshold exceeded or bot enters failed.

### Checks
1. Inspect runtime.init_failed and restart events.
2. Validate dependency health endpoints.
3. Validate config package and policy pack version.

### Immediate Actions
1. Engage protection mode for risky actions.
2. Block new task intake for affected bot.
3. Start controlled runtime restart.

### Recovery
1. Restore runtime to ready then active.
2. Replay safe queued tasks only.
3. Keep failed tasks in review queue.

### Exit Criteria
1. Bot status returns active with stable health checks for observation window.

## Runbook 4: Approval Service Degradation
### Trigger
1. Approval API latency or availability breaches SLA.

### Checks
1. Check approval queue depth and processing latency.
2. Check policy service connectivity.
3. Validate database and cache health for approval path.

### Immediate Actions
1. Enforce safe mode: no medium/high-risk auto-execution.
2. Surface degraded status in dashboard.
3. Route on-call escalation for approval subsystem.

### Recovery
1. Restore approval API health.
2. Drain queued approvals in timestamp order.
3. Verify no unsafe execution occurred during degraded period.

### Exit Criteria
1. Approval latency and success metrics return within target thresholds.

## Runbook 5: Tenant Suspension and Incident Response
### Trigger
1. Severe policy violation, abuse, or security compromise signal.

### Checks
1. Confirm incident evidence and severity.
2. Confirm authority for suspension action.
3. Confirm tenant and workspace impact map.

### Immediate Actions
1. Set tenant status suspended.
2. Engage runtime kill switch for affected workspaces.
3. Disable connector actions.
4. Notify internal stakeholders and customer admin.

### Recovery
1. Complete incident investigation.
2. Apply remediation actions.
3. Require approved resume authorization.

### Exit Criteria
1. Tenant resumes with explicit approval and verified safe state, or remains suspended with documented rationale.

## Required Incident Data Fields
1. incident_id
2. tenant_id
3. workspace_id
4. bot_id
5. severity
6. incident_type
7. status
8. detected_at
9. acknowledged_at
10. mitigated_at
11. resolved_at
12. incident_commander
13. root_cause_summary
14. corrective_actions
15. correlation_ids

## Communication Templates
1. Internal update template
- severity, impact, current action, next update time.

2. Customer update template
- impacted function, current status, expected next update, support contact.

3. Resolution template
- what happened, impact window, fix applied, prevention actions.

## Post-Incident Review (PIR)
1. Required for Sev-1 and Sev-2 incidents.
2. PIR completed within 3 business days.
3. PIR must include timeline, root cause, prevention actions, owner, due date.
4. PIR actions tracked in architecture risk register when relevant.

## Operational Metrics
1. mttr_by_severity
2. incident_reopen_rate
3. sev1_count_per_month
4. approval_path_safety_violations
5. connector_recovery_time

## Acceptance Criteria
1. All five runbooks are executable by on-call team without ad-hoc assumptions.
2. Sev-1 safe-mode behavior prevents unsafe risky-action execution.
3. Customer communication templates are available and used.
4. PIR workflow is defined and linked to risk management.
5. Incident records are queryable for release gate evidence.

## Related Specs
1. planning/engineering-execution-design.md
2. planning/spec-docker-runtime-contract.md
3. planning/spec-connector-auth-flow.md
4. planning/spec-dashboard-data-model.md

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).

<!-- doc-sync: 2026-05-06 full-pass-2 -->
> Last synchronized: 2026-05-06 (Full workspace sync pass 2 + semantic sprint-6 alignment).
