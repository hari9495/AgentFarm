# AgentFarm Connector System

> Last updated: May 10, 2026 | AgentFarm monorepo audit

Full reference for the connector gateway in `services/connector-gateway`.

---

## Overview

The connector gateway manages OAuth flows, token storage, health monitoring, and action execution for all third-party integrations. It sits between the API gateway and external services, providing a unified interface for all 9+ connectors.

**Key Design Principles:**
- OAuth state nonce stored in `ConnectorAuthSession` — expires in 10 minutes
- Access/refresh tokens never stored in plaintext — referenced via `secretRefId` (Azure Key Vault or AWS Secrets Manager)
- All connector actions produce a `ConnectorAction` audit record
- Health worker polls each connector every 5 minutes

---

## Connectors

| Connector | Type | Auth Mode | Status |
|---|---|---|---|
| GitHub | Code hosting | PAT or OAuth App | ✅ Production |
| Slack | Messaging | OAuth 2.0 | ✅ Production |
| Linear | Issue tracker | OAuth 2.0 | ✅ Production |
| Jira/Confluence | Project mgmt / Wiki | OAuth 2.0 | ✅ Production |
| Azure DevOps | Code + CI/CD | OAuth 2.0 | ✅ Production |
| Email | Email | SMTP/IMAP credentials | ✅ Production |
| PagerDuty | Incident management | OAuth 2.0 | ✅ Production |
| Sentry | Error tracking | OAuth 2.0 | ✅ Production |
| Notion | Notes / Wiki | OAuth 2.0 | ✅ Production |
| Salesforce | CRM | OAuth 2.0 (stub) | ⚠️ Stub |
| SAP | ERP | OAuth 2.0 (stub) | ⚠️ Stub |

---

## GitHub Connector

**File:** `services/connector-gateway/src/connectors/github-connector.ts`

### Config
```typescript
type GitHubConnectorConfig = {
  token: string;       // Classic PAT or fine-grained token
  owner: string;       // GitHub org or user
  repo: string;        // Repository name
  baseUrl?: string;    // Default: https://api.github.com
  rateLimitPerHour?: number;
}
```

### Key Operations
| Method | Description |
|---|---|
| `getIssue(number)` | Fetch issue details |
| `createIssue(input)` | Create a new issue |
| `updateIssue(number, input)` | Update issue (title, body, state, labels) |
| `addIssueComment(number, body)` | Comment on an issue |
| `getPR(number)` | Fetch PR details |
| `createPR(input)` | Open a new PR |
| `mergePR(number, method)` | Merge PR (squash/merge/rebase) |
| `addPRComment(number, body)` | Comment on a PR |
| `getCommit(sha)` | Fetch commit details |
| `listCommits(branch, limit?)` | List recent commits |
| `listWorkflowRuns(branch?)` | List CI workflow runs |
| `getWorkflowRun(id)` | Fetch single workflow run |
| `submitReview(pr, event, body)` | Approve/request changes on PR |
| `registerWebhook(url, events, secret)` | Register repository webhook |

### Types
- `GitHubIssue` — issue details including labels, assignees, state, URL
- `GitHubPR` — PR with additions/deletions/changed_files, merge status
- `GitHubCommit` — sha, message, author, date
- `GitHubWorkflowRun` — status, conclusion, branch, html_url
- `GitHubReview` — review event, state, submitted_at
- `GitHubWebhook` — id, url, active, events

---

## Slack Connector

**File:** `services/connector-gateway/src/connectors/slack-connector.ts`

### Operations
| Method | Description |
|---|---|
| `sendMessage(channel, text, blocks?)` | Post message (supports Block Kit) |
| `sendThreadReply(channel, ts, text)` | Reply to thread |
| `updateMessage(channel, ts, text)` | Edit existing message |
| `getChannelInfo(channelId)` | Channel name and membership |
| `listChannels(limit?)` | List workspace channels |
| `getUserInfo(userId)` | User details |

---

## Linear Connector

**File:** `services/connector-gateway/src/connectors/linear-connector.ts`

### Operations
- Create, update, and comment on issues
- Transition issues to a different state
- Link related issues
- List open issues by team

---

## Confluence Connector

**File:** `services/connector-gateway/src/connectors/confluence-connector.ts`

### Operations
- Create, read, update Confluence pages
- Add inline comments
- Search content by CQL query

---

## Azure DevOps Connector

**File:** `services/connector-gateway/src/connectors/azure-devops-connector.ts`

### Operations
- Create, update, and comment on work items
- Create and merge PRs
- Trigger pipeline runs
- Fetch build status and logs

---

## Email Connector

**File:** `services/connector-gateway/src/connectors/email-connector.ts`

### Operations
- `sendEmail({to, subject, body, attachments?})` — SMTP send
- `readInbox(filter?)` — IMAP inbox read
- Template-based emails for closeout and escalation notifications

---

## PagerDuty Connector

**File:** `services/connector-gateway/src/connectors/pagerduty-connector.ts`

### Operations
- Create, acknowledge, and resolve incidents
- List on-call schedules
- Add notes to incidents

---

## Sentry Connector

**File:** `services/connector-gateway/src/connectors/sentry-connector.ts`

### Operations
- Fetch latest issues and errors by project
- Assign and comment on Sentry issues
- Retrieve stack traces and breadcrumbs

---

## Notion Connector

**File:** `services/connector-gateway/src/connectors/notion-connector.ts`

### Operations
- Create, read, update Notion pages and database entries
- Search by query across the workspace

---

## OAuth Flow

### Initiation
1. Client calls `POST /v1/connectors/:connectorId/auth/initiate`
2. Gateway creates `ConnectorAuthSession` with a random `stateNonce` (expires 10 min)
3. Returns `{authUrl, stateNonce}` — client redirects user to `authUrl`

### Callback
1. OAuth provider redirects to `GET /v1/connectors/auth/callback?code=&state=`
2. Gateway matches `state` → `stateNonce` in `ConnectorAuthSession`
3. Exchanges `code` for access + refresh tokens
4. Stores token reference (`secretRefId`) in `ConnectorAuthMetadata`
5. Updates `status = 'connected'`
6. Records `ConnectorAuthEvent` with `eventType = 'auth_completed'`

### Token Lifecycle
- **connectorTokenLifecycleWorker** runs on a schedule to refresh expiring tokens
- Token expiry tracked in `ConnectorAuthMetadata.tokenExpiresAt`
- Failed refreshes record `lastErrorClass` and set `status = 'token_expired'`

### Health Monitoring
- **connectorHealthWorker** polls each connected connector every 5 minutes
- Updates `lastHealthcheckAt`, `status`, and `scopeStatus`
- Scope validation ensures all required OAuth scopes are still granted

---

## Connector Action Contract

Every connector action produces a `ConnectorAction` audit record.

### `ConnectorActionType` Values
| Type | Description |
|---|---|
| `read_task` | Read a task/issue/ticket |
| `create_comment` | Post a comment |
| `update_status` | Change status or state |
| `send_message` | Send a Slack/Email message |
| `create_pr_comment` | Comment on a PR |
| `send_email` | Send an email |

### `ConnectorActionStatus` Values
`success` | `failed` | `timeout`

### Error Codes
| Code | Meaning |
|---|---|
| `rate_limit` | Provider rate limit reached |
| `timeout` | Request timed out |
| `provider_unavailable` | Provider API is down |
| `permission_denied` | Insufficient OAuth scope |
| `invalid_format` | Malformed request payload |
| `unsupported_action` | Action not supported by this connector |
| `upgrade_required` | Provider plan too low |

---

## Database Models

| Model | Purpose |
|---|---|
| `ConnectorAuthMetadata` | Stores status, scope, token reference per connector |
| `ConnectorAuthSession` | Transient OAuth state during auth flow |
| `ConnectorAuthEvent` | Audit log of all auth events |
| `ConnectorAction` | Audit log of every connector action executed |

See [DATA_MODEL.md](./DATA_MODEL.md) for full field specs.
