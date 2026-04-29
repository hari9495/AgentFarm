# Behavior-Driven Development Document (BDD)

## Document Control
- Product: AgentFarm MVP
- Date: 2026-04-28
- Version: 2.0
- Status: Updated from implemented behavior baseline

## Feature 1: Tenant Signup and Session Controls

Scenario: Successful signup initializes tenant and workspace context
Given a new user submits valid signup details
When signup is processed successfully
Then a tenant and initial workspace are created
And an initial bot context is created
And a valid session is returned

Scenario: Protected route blocks missing session
Given a user without a valid session token
When the user requests a protected route
Then access is denied
And a login path is returned or redirect is applied

Scenario: Workspace scope is enforced
Given a valid session for tenant A
When the user requests workspace data for tenant B
Then the request is rejected as unauthorized

## Feature 2: Provisioning Lifecycle and SLA Visibility

Scenario: Provisioning transitions through orchestration states
Given a new provisioning job in queued state
When the worker processes the job
Then the job transitions through validating, creating_resources, bootstrapping_vm, starting_container, registering_runtime, and healthchecking
And ends in completed when runtime health is successful

Scenario: Provisioning failure triggers cleanup workflow
Given provisioning fails at a non-terminal step
When failure handling executes
Then failure reason and remediation hint are persisted
And cleanup_pending is scheduled
And resources are tagged for cleanup

Scenario: SLA breach is visible to operators
Given a provisioning job exceeds configured SLA target
When dashboard timeline is refreshed
Then the job is marked as SLA risk or breach
And operator-facing remediation guidance is displayed

Scenario: Timeout forces terminal failure
Given a provisioning job runs beyond timeout threshold
When timeout policy executes
Then the job transitions to failed
And cleanup handling begins

## Feature 3: Runtime Health, State, and Kill Behavior

Scenario: Runtime exposes live and ready endpoints
Given a runtime container is started
When health endpoints are queried
Then live status is returned
And ready status reflects dependency readiness

Scenario: Runtime state transitions are observable
Given runtime starts and processes tasks
When state history is requested
Then transitions and timestamps are returned

Scenario: Kill switch blocks risky intake quickly
Given kill switch is engaged by control plane
When new medium or high-risk actions arrive
Then runtime blocks those actions within expected control window
And low-risk in-flight work can complete gracefully

Scenario: Runtime resume requires explicit authorization
Given kill switch has been engaged
When operator attempts to resume runtime execution
Then resume only occurs after control-plane authorization

## Feature 4: Connector Auth, Scope, and Token Lifecycle

Scenario: OAuth initiate returns provider authorization URL
Given a supported connector and valid workspace context
When auth initiate is called
Then a provider auth URL and state nonce are returned

Scenario: OAuth callback stores credential reference
Given provider callback contains valid code and state
When callback is processed
Then token exchange succeeds
And secret reference metadata is persisted
And connector status becomes connected

Scenario: Expiring token refreshes automatically
Given connector token is near expiration
When token lifecycle worker runs
Then refresh endpoint is called
And token metadata is updated
And connector remains connected

Scenario: Insufficient scope enters re-consent path
Given provider confirms insufficient scope
When scope validation is evaluated
Then connector status becomes permission_invalid or consent_pending
And operator sees re-consent guidance

Scenario: Disconnect revokes and blocks action execution
Given operator disconnects a connector
When revoke succeeds
Then connector status becomes revoked
And future actions are blocked until re-auth

## Feature 5: Connector Action Execution and Retry Classification

Scenario: Supported normalized action executes successfully
Given connector is connected and action type is supported
When execute is requested with valid payload
Then provider call is executed
And success result is persisted with metadata

Scenario: Retryable error applies bounded backoff
Given provider returns rate_limit, timeout, or provider_unavailable
When retry policy runs
Then retries use bounded exponential backoff
And final status reflects success or terminal failure

Scenario: Non-retryable permission error surfaces remediation
Given provider returns permission_denied
When execution handling classifies the error
Then action is marked failed without retry loop
And remediation indicates re-consent requirement

## Feature 6: Approval Governance and Escalation

Scenario: Medium/high risk action is queued for approval
Given an action is classified as medium or high risk
When policy enforcement runs
Then action is placed in pending approvals
And execution is blocked until decision

Scenario: Approved action continues execution
Given pending approval exists
When approver submits approved decision
Then decision is recorded
And action execution continues through connector gateway

Scenario: Rejected decision cancels action
Given pending approval exists
When approver submits rejected decision
Then action is canceled
And audit event is emitted

Scenario: Escalation timeout auto-rejects
Given an approval request is pending beyond timeout window
When escalation job evaluates request
Then decision is set to timeout_rejected
And action is not executed

Scenario: Approval latency metric is tracked
Given a decision is submitted
When decision is persisted
Then decision latency is recorded for p95 metrics

## Feature 7: Audit, Evidence, and Retention

Scenario: Event ingestion appends immutable records
Given an operational event occurs
When audit ingestion is called
Then event is appended with required fields including correlation identifier

Scenario: Filtered query returns scoped evidence
Given a compliance user selects severity, type, and date filters
When query is executed
Then matching records are returned for the selected workspace scope

Scenario: Evidence export includes required fields
Given export is requested in JSON or CSV
When export job runs
Then output includes event type, severity, source system, summary, and correlation data

Scenario: Retention cleanup is applied by policy
Given retention trigger is invoked
When retention job runs
Then expired records are archived or removed according to policy

## Feature 8: Dashboard Workspace UX and Deep Linking

Scenario: Active tab persists per workspace
Given operator selects a workspace and tab
When operator switches to another workspace and back
Then prior tab for each workspace is restored independently

Scenario: Deep link captures focused context
Given operator is viewing approval or audit details
When deep-link copy action is used
Then copied URL includes workspace and tab parameters
And includes context parameters such as approvalId or correlationId when available

Scenario: Data fallback keeps dashboard usable
Given API calls partially fail
When dashboard refreshes
Then last-known values are displayed where available
And panel-level error states are shown without full-page failure

## Feature 9: Release and Launch Gating

Scenario: Quality gate pass is required before release
Given release candidate commit is ready
When quality gate script is executed
Then required checks pass before deployment proceeds

Scenario: Launch remains blocked without external prerequisites
Given SWA deployment secret or Azure auth context is missing
When launch runbook status is reviewed
Then launch remains in blocked or in-progress state
And unresolved prerequisites are explicitly listed

