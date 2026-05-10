# AgentFarm API Reference

> Last updated: May 10, 2026 | AgentFarm monorepo audit

Complete HTTP route reference for all services. Routes are served from **`apps/api-gateway`** (port 3000) unless noted otherwise.

Auth: Most routes require a valid `agentfarm_session` cookie or `Authorization: Bearer <token>` header. Unauthenticated routes are marked with `—` in the Auth column.

---

## Auth Routes

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| POST | `/auth/login` | — | `{email, password}` | `{token, userId, tenantId, workspaceIds, scope, expiresAt}` | HMAC-signed session token |
| POST | `/auth/signup` | — | `{email, password, name, tenantName}` | `{token, userId, tenantId}` | Creates tenant + user |
| POST | `/auth/logout` | required | — | `{ok: true}` | Clears session |
| GET | `/auth/session` | required | — | `SessionPayload` | Verify current session |
| POST | `/auth/internal-login` | — | `{email, password}` | `{token}` | Internal ops login (dashboard) |
| POST | `/auth/change-password` | required | `{currentPassword, newPassword}` | `{ok: true}` | |

---

## Approval Routes (`/v1/approvals`)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| POST | `/v1/approvals` | required | `{workspaceId, botId, taskId, actionId, riskLevel, actionSummary, requestedBy, policyPackVersion, escalationTimeoutSeconds?, llmProvider?, llmModel?}` | `{approvalId, status}` | Create pending approval |
| GET | `/v1/approvals/:approvalId` | required | — | `ApprovalRecord` | Get approval by ID |
| GET | `/v1/approvals` | required | `?workspaceId=&status=&limit=` | `ApprovalRecord[]` | List approvals |
| POST | `/v1/approvals/:approvalId/decide` | required | `{decision, reason, selectedOptionId?}` | `{ok: true}` | Approve or reject |
| GET | `/v1/approvals/escalation-candidates` | required | `?workspaceId=` | `ApprovalRecord[]` | Approvals past SLA |
| POST | `/v1/approvals/:approvalId/escalate` | required | — | `{ok: true}` | Mark as escalated |

---

## Audit Routes (`/v1/audit`)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| GET | `/v1/audit` | required | `?workspaceId=&botId=&eventType=&limit=` | `AuditEvent[]` | Query audit log |
| POST | `/v1/audit` | required | `{workspaceId, botId, eventType, severity, summary, sourceSystem, correlationId}` | `{id}` | Write audit event |

---

## Billing Routes (`/v1/billing`)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| GET | `/v1/billing/plans` | — | — | `Plan[]` | List active plans |
| POST | `/v1/billing/create-order` | required | `{planId, customerEmail, customerCountry?, tenantId}` | `{orderId, providerOrderId, currency, amount, provider}` | Create Stripe or Razorpay order |
| POST | `/v1/billing/stripe/webhook` | — | (Stripe event body) | `{ok: true}` | Stripe HMAC-verified webhook |
| POST | `/v1/billing/razorpay/webhook` | — | `{razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId}` | `{ok: true}` | Razorpay signature-verified webhook |
| GET | `/v1/billing/orders/:orderId` | required | — | `OrderRecord` | Get order |
| GET | `/v1/billing/invoices` | required | `?tenantId=` | `Invoice[]` | List invoices |

---

## Zoho Sign Webhook (`/v1/webhooks`)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| POST | `/v1/webhooks/zoho-sign` | — (token header) | Zoho Sign event | `{ok: true}` | `x-zoho-webhook-token` header verified; marks order signed, triggers ProvisioningJob |

---

## Connector Auth Routes (`/v1/connectors`)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| POST | `/v1/connectors/:connectorId/auth/initiate` | required | `{workspaceId, connectorType, redirectUri}` | `{authUrl, stateNonce}` | Begin OAuth flow |
| GET | `/v1/connectors/auth/callback` | — | `?code=&state=` | redirect | OAuth code exchange callback |
| GET | `/v1/connectors/:connectorId/status` | required | — | `ConnectorStatus` | Get auth status |
| DELETE | `/v1/connectors/:connectorId/auth` | required | — | `{ok: true}` | Revoke connector |
| POST | `/v1/connectors/actions` | required | `{connectorId, actionType, payload}` | `ActionResult` | Execute connector action |
| GET | `/v1/connectors/health` | required | `?workspaceId=` | `ConnectorHealth[]` | Connector health status |

---

## Runtime Task Routes (`/v1/tasks`)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| POST | `/v1/tasks/lease` | required | `{workspaceId, botId, taskId, payload, idempotencyKey, correlationId, leaseSeconds?}` | `{claimToken, lease}` | Claim task lease |
| POST | `/v1/tasks/complete` | required | `{claimToken, taskId, result}` | `{ok: true}` | Release lease on completion |
| POST | `/v1/tasks/dispatch` | required (internal) | `{workspaceId, botId, taskId, payload}` | `{dispatched: true}` | Dispatch task to runtime |
| GET | `/v1/tasks/sse/:workspaceId` | required | — | SSE stream | Task progress stream |

---

## Language Routes (`/v1/language`)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| GET | `/v1/language/tenant` | required | — | `TenantLanguageConfig` | Tenant-level language config |
| PATCH | `/v1/language/tenant` | required | `{defaultLanguage?, ticketLanguage?, autoDetect?}` | Updated config | |
| GET | `/v1/language/workspace/:workspaceId` | required | — | `WorkspaceLanguageConfig` | |
| PATCH | `/v1/language/workspace/:workspaceId` | required | `{preferredLanguage?}` | Updated config | |
| GET | `/v1/language/user/:userId` | required | — | `UserLanguageProfile` | |
| POST | `/v1/language/user` | required | `{userId, language, confidence?}` | Updated profile | |

---

## MCP Registry Routes (`/v1/mcp`)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| GET | `/v1/mcp` | required | — | `TenantMcpServer[]` | List active servers |
| POST | `/v1/mcp` | required | `{name, url, workspaceId?, headers?}` | `TenantMcpServer` | Register or reactivate |
| GET | `/v1/mcp/:id` | required | — | `TenantMcpServer` | Get by ID |
| DELETE | `/v1/mcp/:id` | required | — | `{ok: true}` | Deactivate server |

---

## Memory Routes (`/v1/memory`)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| GET | `/v1/memory` | required | `?workspaceId=&maxResults=` | `MemorySummary` | Read working memory |
| POST | `/v1/memory` | required | `{workspaceId, taskId, actionsTaken, approvalOutcomes, connectorsUsed, executionStatus, summary, correlationId, llmProvider?}` | `{ok: true}` | Write task memory |
| GET | `/v1/memory/repo` | required | `?workspaceId=&repoName=&role=` | `RepoKnowledge[]` | Get repo knowledge |
| POST | `/v1/memory/repo` | required | `{workspaceId, repoName, role, key, value}` | `{ok: true}` | Set repo knowledge |

---

## Admin Provisioning Routes (`/v1/admin/provision`)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| POST | `/v1/admin/provision` | required (internal) | `{tenantId, workspaceId, botId, planId, runtimeTier, roleType, orderId?}` | `{jobId}` | Manually trigger provisioning |
| GET | `/v1/admin/provision/:jobId` | required (internal) | — | `ProvisioningJob` | Get job status |

---

## Meetings Routes (`/v1/meetings`)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| POST | `/v1/meetings` | required | `{workspaceId, agentId, meetingUrl, platform, language?, speakingEnabled?}` | `{sessionId}` | Start meeting session |
| GET | `/v1/meetings/:sessionId` | required | — | `MeetingSession` | Get session |
| POST | `/v1/meetings/:sessionId/end` | required | — | `{summary, actionItems}` | End and summarize |
| DELETE | `/v1/meetings/:sessionId` | required | — | `{ok: true}` | Delete session |

---

## Agent Question Routes (`/v1/questions`)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| POST | `/v1/questions` | required | `{workspaceId, botId, taskId, question, context, options?, askedVia, timeoutMs?, onTimeout?}` | `{questionId}` | Agent asks human a question |
| GET | `/v1/questions/:questionId` | required | — | `AgentQuestion` | Poll for answer |
| POST | `/v1/questions/:questionId/answer` | required | `{answer, answeredBy}` | `{ok: true}` | Human answers |

---

## Governance Routes (`/v1/governance`)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| GET | `/v1/governance/workflows` | required | `?workspaceId=` | `GovernanceWorkflow[]` | List workflows |
| POST | `/v1/governance/workflows` | required | `{workspaceId, ...}` | `GovernanceWorkflow` | Create workflow |
| GET | `/v1/governance/kpis` | required | `?workspaceId=` | `GovernanceKPIs` | Approval rate, latency, etc. |

---

## Observability Routes (`/v1/observability`)

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| GET | `/v1/observability/health` | — | — | `{status: "ok"}` | Health check |
| GET | `/v1/observability/metrics` | ops token | — | `MetricsSummary` | Aggregated metrics |
| GET | `/v1/ops/sla-summary` | ops token | — | `OpsSlaSummary` | Provisioning SLA report |

---

## Workspace State Routes

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| GET | `/v1/workspace-session/:workspaceId` | required | — | `WorkspaceSessionState` | Get session state |
| PUT | `/v1/workspace-session/:workspaceId` | required | `{state, updatedBy}` | Updated state | |
| POST | `/v1/workspace-session/:workspaceId/checkpoint` | required | `{label, reason?, actor}` | `{checkpointId}` | Checkpoint state |
| GET | `/v1/desktop-profile/:workspaceId` | required | — | `DesktopProfile` | |
| PUT | `/v1/desktop-profile/:workspaceId` | required | `{browser, tabState, ...}` | Updated profile | |
| GET | `/v1/ide-state/:workspaceId` | required | — | `IdeState` | |
| PUT | `/v1/ide-state/:workspaceId` | required | `{openFiles, activeFile, breakpoints}` | Updated state | |

---

## PR and CI Routes

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| POST | `/v1/pull-requests` | required | `{workspaceId, branch, targetBranch?, changeSummary, title, body, ...}` | `{draftId}` | Create PR draft |
| GET | `/v1/pull-requests/:draftId` | required | — | `PrDraft` | |
| POST | `/v1/pull-requests/:draftId/submit` | required | — | `{prId, url}` | Submit to provider |
| POST | `/v1/ci-failures` | required | `{workspaceId, provider, runId, repo, branch, failedJobs, logRefs}` | `{reportId}` | Create triage report |
| GET | `/v1/ci-failures/:reportId` | required | — | `CiTriageReport` | |

---

## Roles and Snapshots

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| GET | `/v1/roles` | required | — | `RoleDefinition[]` | All available agent roles |
| GET | `/v1/snapshots/:botId` | required | — | `BotCapabilitySnapshot` | Latest capability snapshot |
| POST | `/v1/snapshots/:botId` | required | `{roleVersion, policyPackVersion, allowedActions, brainConfig, ...}` | `{snapshotId}` | Freeze snapshot |

---

## Activity and Environment Routes

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| GET | `/v1/activity/:workspaceId` | required | `?limit=&status=` | `ActivityEvent[]` | Activity feed |
| POST | `/v1/activity/:workspaceId/ack` | required | `{eventIds[]}` | `{ok: true}` | Acknowledge events |
| GET | `/v1/env-reconciler/:workspaceId` | required | — | `EnvProfile` | Environment profile |
| POST | `/v1/env-reconciler/:workspaceId/reconcile` | required | — | `{driftReport}` | Trigger reconciliation |

---

## Skill Routes

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| GET | `/v1/skill-pipelines` | required | `?workspaceId=` | `SkillPipeline[]` | List skill pipelines |
| POST | `/v1/skill-pipelines/execute` | required | `{workspaceId, pipelineId, inputs}` | `{result}` | Execute pipeline |
| GET | `/v1/skill-scheduler` | required | — | `ScheduledSkill[]` | List scheduled skills |
| POST | `/v1/skill-scheduler` | required | `{workspaceId, skillId, cron, payload}` | `{scheduledId}` | Schedule skill run |

---

## Plugin Routes

| Method | Path | Auth | Request Body | Response | Notes |
|---|---|---|---|---|---|
| GET | `/v1/plugins` | required | — | `Plugin[]` | List loaded plugins |
| POST | `/v1/plugins/load` | required (internal) | `{pluginId, manifestUrl}` | `{ok: true}` | Load plugin |

---

## Website Proxy Routes (`apps/website/app/api`)

These are Next.js App Router API routes in `apps/website`. They proxy to `api-gateway`.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/login` | Auth bridge — stores both gateway + internal session cookie |
| POST | `/api/auth/signup` | Dual-write to SQLite and api-gateway |
| GET | `/api/auth/session` | Current user session |
| POST | `/api/auth/logout` | Clear both cookies |
| POST | `/api/auth/forgot-password` | Password reset |
| GET | `/api/billing/*` | Proxy to api-gateway billing routes |
| POST | `/api/billing/*` | Proxy to api-gateway billing routes |
| GET | `/api/admin/*` | Admin API (internal scope required) |
| GET | `/api/approvals` | Proxy to api-gateway approvals |
| GET | `/api/evidence/*` | Evidence bundle retrieval |
| GET | `/api/marketplace` | AI agent marketplace listing |
| POST | `/api/onboarding` | Onboarding flow state |
| GET | `/api/activity` | Activity feed |
| GET | `/api/connectors/*` | Connector auth proxy |
| POST | `/api/deployments/*` | Deployment management |
| GET | `/api/audit/*` | Audit log proxy |
| GET | `/api/webhooks/*` | Webhook management UI |
| GET | `/api/provisioning/*` | Provisioning status |
| GET | `/api/superadmin/*` | Super-admin endpoints |
