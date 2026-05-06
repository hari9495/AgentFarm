# AgentFarm Spec: Connector Auth Flow

## Purpose
Define OAuth and token lifecycle behavior for MVP connectors with secure activation, refresh, revocation, and failure handling.

## Scope
1. Covers Jira, Microsoft Teams, GitHub, and company email connector auth lifecycle.
2. Covers token issuance, secure storage references, validation, refresh, and revoke flows.
3. Covers permission-scope validation and error model.
4. Does not define provider-specific SDK internals.

---

## Connector Credential Format Reference

Credentials are stored in Azure Key Vault (or env vars for local dev) as JSON strings.
The connector `secretRefId` field on `ConnectorMetadata` is the URI used to retrieve them.

### SecretStore URI Schemes

| Scheme | Example | Resolution |
|--------|---------|------------|
| `kv://<vault>/secrets/<name>` | `kv://mykeyvault/secrets/jira-acme` | Azure Key Vault — `DefaultAzureCredential` |
| `https://<vault>.vault.azure.net/secrets/<name>` | `https://mykeyvault.vault.azure.net/secrets/jira-acme` | Azure Key Vault — same client |
| `env://<VAR>` | `env://JIRA_CREDENTIALS` | `process.env[VAR]` (local dev only) |

> `createDefaultSecretStore()` tries Key Vault first, then falls back to env vars.
> `createInMemorySecretStore(map)` is provided for unit tests.

---

### Jira Credentials

```json
{
  "access_token": "<oauth_access_token_or_pat>",
  "base_url": "https://yoursite.atlassian.net"
}
```

**Actions supported:**

| `actionType` | Required payload fields | Notes |
|---|---|---|
| `read_task` | `issue_key` | GET `/rest/api/3/issue/{key}` — returns summary + status |
| `create_comment` | `issue_key`, `body` | POST `/rest/api/3/issue/{key}/comment` — ADF v3 format |
| `update_status` | `issue_key`, `transition_name` | GET transitions then POST matching transition by name |

---

### Microsoft Teams Credentials

```json
{
  "access_token": "<microsoft_graph_bearer_token>"
}
```

**Actions supported:**

| `actionType` | Required payload fields | Notes |
|---|---|---|
| `send_message` | `team_id`, `channel_id`, `text` | POST `https://graph.microsoft.com/v1.0/teams/{teamId}/channels/{channelId}/messages` |

---

### GitHub Credentials

```json
{
  "access_token": "<github_oauth_token_or_pat>"
}
```

**Actions supported:**

| `actionType` | Required payload fields | Optional fields | Notes |
|---|---|---|---|
| `create_pr_comment` | `owner`, `repo`, `pull_number` (integer), `body` | `commit_id`, `path`, `position` | POST GitHub REST v3; sends `X-GitHub-Api-Version: 2022-11-28` |

---

### Email Credentials — SendGrid

```json
{
  "type": "sendgrid",
  "api_key": "SG.<sendgrid_api_key>",
  "from_address": "bot@yourdomain.com"
}
```

### Email Credentials — SMTP

```json
{
  "type": "smtp",
  "smtp_host": "smtp.yourdomain.com",
  "smtp_port": 587,
  "smtp_user": "bot@yourdomain.com",
  "smtp_pass": "<password>",
  "from_address": "bot@yourdomain.com"
}
```

> SMTP requires `nodemailer` as an optional runtime dependency. SendGrid uses `fetch` and has no extra dependency.

**Actions supported (both email types):**

| `actionType` | Required payload fields | Notes |
|---|---|---|
| `send_email` | `to` (string or string[]), `subject`, `body` | `to` is coerced to array |

---

## Provider Health Probe Reference

Each connector has a lightweight authenticated ping endpoint used by the health-check system:

| Connector | Probe endpoint | Success | Auth failure | Rate limit |
|---|---|---|---|---|
| `jira` | `GET {base_url}/rest/api/3/myself` | 200 | 401/403 | 429 |
| `teams` | `GET https://graph.microsoft.com/v1.0/me` | 200 | 401/403 | 429 |
| `github` | `GET https://api.github.com/rate_limit` | 200 | 401/403 | 403 + `x-ratelimit-remaining: 0` |
| `email` (sendgrid) | `GET https://api.sendgrid.com/v3/user/profile` | 200 | 401 | 429 |
| `email` (smtp) | `transporter.verify()` via `nodemailer` | — | auth error | — |

Network throws (e.g. `ECONNREFUSED`, `ETIMEDOUT`) map to `network_timeout` outcome.

### Automated health worker (Task 4.4 implementation)
1. `connector-health-worker` runs inside api-gateway runtime.
2. Poll cadence:
- Active queue: every 15 minutes
- Idle queue: every 6 hours
3. Monthly scope validation policy:
- Any connector not health-checked in the last 30 days is automatically queued for validation.
4. Immediate remediation queueing:
- Connectors in `degraded`, `permission_invalid`, `token_expired`, or `consent_pending` are prioritized for checks.
5. Each run emits `ConnectorAuthEvent` with `eventType=oauth_healthcheck` and result classification.

**Probe fallback**: When `secretRefId` is `null` or the secret is not found in the store, the probe
falls back to inspecting `ConnectorMetadata.status` directly instead of making a live HTTP call.
This ensures health checks remain non-disruptive for unactivated connectors.

---

## Wiring — Real Executor Injection

The real HTTP executor is activated by passing `secretStore` to `registerConnectorActionRoutes`:

```typescript
// apps/api-gateway/src/main.ts
import { createDefaultSecretStore } from './lib/secret-store.js';

await registerConnectorActionRoutes(app, {
    getSession: (request) => readSession(request),
    secretStore: createDefaultSecretStore(),   // ← real Key Vault / env var store
});
```

When `secretStore` is provided, the route handler dynamically imports
`createRealProviderExecutor` and `createRealConnectorHealthProbe` from
`apps/api-gateway/src/lib/provider-clients.ts`. The simulation stub
(`defaultProviderExecutor`) is only used when no `secretStore` is supplied.

### Error code mapping

| HTTP status | `errorCode` | `transient` |
|---|---|---|
| 401, 403 | `permission_denied` | false |
| 404 | `not_found` | false |
| 409 | `conflict` | false |
| 422 | `invalid_format` | false |
| 429 | `rate_limit` | true |
| 500–599 | `provider_unavailable` | true |
| Network throw | `provider_unavailable` | true |
| Missing / invalid credentials | `upgrade_required` | false |

## Auth Principles
1. Least privilege scopes only.
2. Tokens and secrets are never persisted in plaintext application logs.
3. Connector activation is incomplete until scope validation succeeds.
4. Revocation disables connector actions immediately.

## Connector Auth State Machine
1. not_configured
2. auth_initiated
3. consent_pending
4. token_received
5. validation_in_progress
6. connected
7. degraded
8. token_expired
9. permission_invalid
10. revoked
11. disconnected

## OAuth Lifecycle
### 1. Start activation
1. User selects connector in dashboard.
2. Control plane creates auth session and nonce.
3. Connector status changes to auth_initiated.

### 2. Redirect and consent
1. User redirected to provider consent page.
2. Provider returns auth code with state.
3. Control plane validates state and nonce.
4. Connector status changes to consent_pending then token_received.

### 3. Token exchange
1. Exchange auth code for access token and refresh token when available.
2. Persist token reference in secure store.
3. Persist connector auth metadata without plaintext token.

### 4. Scope validation
1. Validate granted scopes against required capability matrix.
2. If insufficient scopes, set permission_invalid.
3. If valid, set connected.

## Secure Storage Contract
1. Store provider credentials in Key Vault or equivalent secure secret store.
2. Persist only secret reference IDs in connector database records.
3. Rotate secrets or references per policy schedule.
4. Audit every create, rotate, revoke action.

## Token Lifecycle Management
### Refresh behavior
1. Refresh before expiration threshold.
2. Use bounded exponential backoff on transient refresh errors.
3. On repeated refresh failure, move connector to token_expired.

### Automated refresh worker (Task 4.2 implementation)
1. `connector-token-lifecycle-worker` runs in api-gateway process.
2. Poll cadence:
- Active queue: every 60s
- Idle queue: every 5m
3. Candidate selection:
- OAuth connectors with status in `token_received`, `connected`, `degraded`, `token_expired`, or `permission_invalid`
- Token expiry at or inside 5-minute refresh window, or status already `token_expired`, or status `permission_invalid`
4. Refresh execution:
- Loads credential JSON from `secretRefId` via `SecretStore`
- Requires `refresh_token`; if missing and token is expired, marks `token_expired`
- Calls provider token endpoint with `grant_type=refresh_token`
- Writes updated credential JSON back to secure store (reference unchanged)
5. Metadata updates on success:
- `status=connected`
- `tokenExpiresAt` and `lastRefreshAt` updated
- `lastErrorClass=null`
6. Metadata updates on failure:
- `insufficient_scope` => `status=consent_pending`
- `provider_rate_limited` or `provider_unavailable` => `status=degraded`
- non-recoverable refresh failure => `status=token_expired` when expired, else `status=degraded`
7. Every attempt emits `ConnectorAuthEvent` with `eventType=oauth_refresh`.

### Expiration behavior
1. Detect expired token during proactive checks or runtime call failures.
2. Mark connector token_expired.
3. Disable connector actions until refresh or re-consent succeeds.

### Revocation behavior
1. Tenant admin or provider-side revoke triggers revoked state.
2. Immediately disable connector actions.
3. Require full reactivation flow to return to connected.
4. Dashboard "Disconnect" action calls `POST /v1/connectors/oauth/revoke` and clears token references.

## Permission Scope Model
### Required fields
1. connector_type
2. required_scopes
3. optional_scopes
4. granted_scopes
5. effective_scope_status

### Validation outcomes
1. full
2. partial
3. insufficient

### Rules
1. full maps to connected if health is good.
2. partial maps to degraded with feature gating.
3. insufficient maps to permission_invalid.

## Error Model
### Standard error classes
1. oauth_state_mismatch
2. oauth_code_exchange_failed
3. token_refresh_failed
4. token_expired
5. insufficient_scope
6. provider_rate_limited
7. provider_unavailable
8. secret_store_unavailable

### Error handling rules
1. `auth_failure` probe outcome => `status=permission_invalid`, `scopeStatus=insufficient`, remediation `re_auth`.
2. `rate_limited` probe outcome => `status=degraded`, `lastErrorClass=provider_rate_limited`, remediation `backoff`.
3. `network_timeout` probe outcome => `status=degraded`, `lastErrorClass=provider_unavailable`, remediation `backoff`.
4. `scopeStatus=insufficient` at check time forces `status=consent_pending` and remediation `reconsent`.
5. Dashboard supports manual trigger via `POST /v1/connectors/health/check` for immediate surfacing.

## Normalized Action Execution (Task 4.3)

### Action execution endpoint
1. `POST /v1/connectors/actions/execute` executes normalized connector actions.
2. Payload contract requires:
- `connector_type`
- `workspace_id`
- `bot_id`
- `role_key`
- `action_type`
- `payload`
3. Response includes:
- `status`
- `action_id`
- `connector_id`
- `connector_type`
- `action_type`
- `attempts`
- `contract_version`

### Supported action mapping by connector
1. Jira:
- `read_task`
- `create_comment`
- `update_status`
2. Teams:
- `send_message`
3. GitHub:
- `create_pr_comment`
4. Email:
- `send_email`
5. custom_api:
- accepts all normalized actions in `ConnectorActionType`
- forwards to configured custom endpoint path/body

### Retry and logging behavior
1. Transient provider errors are retried up to 3 attempts.
2. Backoff schedule is exponential: 50ms, 100ms.
3. Every execution writes a `ConnectorAction` record with:
- `resultStatus` (`success`, `failed`, `timeout`)
- `providerResponseCode`
- `errorCode` and remediation hints when applicable
4. Permission-denied execution failures move connector metadata to:
- `status=permission_invalid`
- `scopeStatus=insufficient`
- `lastErrorClass=insufficient_scope`
1. Every auth error writes connector_event with error_class and correlation_id.
2. Retry only transient classes.
3. Non-transient classes require user or admin remediation.

## Health and Monitoring
1. connector_auth_success_rate
2. token_refresh_success_rate
3. token_expiry_incidents
4. permission_validation_failures
5. mean_time_to_recover_connector

## APIs
1. POST /bots/{botId}/connectors/{connectorType}/activate
- Start OAuth activation.

2. POST /connectors/auth/callback/{connectorType}
- Process provider callback and token exchange.

3. POST /bots/{botId}/connectors/{connectorType}/validate
- Validate effective scopes and connection health.

4. POST /bots/{botId}/connectors/{connectorType}/refresh
- Trigger refresh flow.

5. POST /bots/{botId}/connectors/{connectorType}/revoke
- Revoke connector and disable actions.

6. GET /bots/{botId}/connectors
- Return connector state and last auth health status.

## Data Model Additions
### connector_auth_sessions
1. auth_session_id
2. connector_id
3. tenant_id
4. workspace_id
5. state_nonce
6. status
7. created_at
8. expires_at

### connector_auth_metadata
1. connector_id
2. auth_mode
3. granted_scopes
4. scope_status
5. secret_ref_id
6. token_expires_at
7. last_refresh_at
8. last_error_class
9. updated_at

### connector_auth_events
1. auth_event_id
2. connector_id
3. event_type
4. result
5. error_class
6. correlation_id
7. actor
8. created_at

## Runtime Behavior Contract
1. Runtime executes connector actions only when connector state is connected or approved degraded mode.
2. Runtime blocks connector operations in token_expired, permission_invalid, revoked, or disconnected states.
3. Runtime includes connector state in action failure evidence.

## Acceptance Criteria
1. OAuth activation succeeds with valid state and nonce checks.
2. Token references are securely persisted without plaintext leakage.
3. Scope validation gates connector functionality correctly.
4. Refresh and revoke flows transition states correctly.
5. Error classes and remediation hints appear in dashboard and evidence logs.

## Related Specs
1. planning/engineering-execution-design.md
2. planning/spec-product-structure-model-architecture.md
3. planning/spec-dashboard-data-model.md

<!-- doc-sync: 2026-05-06 sprint-6 -->
> Last synchronized: 2026-05-06 (Sprint 6 hardening and quality gate pass).
