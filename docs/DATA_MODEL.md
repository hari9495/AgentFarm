# AgentFarm Data Model

> Last updated: May 10, 2026 | AgentFarm monorepo audit

Full Prisma schema reference for `packages/db-schema/prisma/schema.prisma` — PostgreSQL 16.

---

## Enums

### `TenantStatus`
`pending` | `provisioning` | `ready` | `degraded` | `suspended` | `terminated`

### `WorkspaceStatus`
`pending` | `provisioning` | `ready` | `degraded` | `suspended` | `failed`

### `BotStatus`
`created` | `bootstrapping` | `connector_setup_required` | `active` | `paused` | `failed`

### `ProvisioningJobStatus`
`queued` | `validating` | `creating_resources` | `bootstrapping_vm` | `starting_container` | `registering_runtime` | `healthchecking` | `completed` | `failed` | `cleanup_pending` | `cleaned_up`

### `RuntimeStatus`
`created` | `starting` | `ready` | `active` | `degraded` | `paused` | `stopping` | `stopped` | `failed`

### `CapabilitySnapshotSource`
`runtime_freeze` | `persisted_load` | `manual_override`

### `ApprovalDecision`
`pending` | `approved` | `rejected` | `timeout_rejected`

### `ConnectorAuthStatus`
`not_configured` | `auth_initiated` | `consent_pending` | `token_received` | `validation_in_progress` | `connected` | `degraded` | `token_expired` | `permission_invalid` | `revoked` | `disconnected`

### `ConnectorScopeStatus`
`full` | `partial` | `insufficient`

### `ConnectorErrorClass`
`oauth_state_mismatch` | `oauth_code_exchange_failed` | `token_refresh_failed` | `token_expired` | `insufficient_scope` | `provider_rate_limited` | `provider_unavailable` | `secret_store_unavailable`

### `ConnectorActionType`
`read_task` | `create_comment` | `update_status` | `send_message` | `create_pr_comment` | `send_email`

### `ConnectorActionStatus`
`success` | `failed` | `timeout`

### `ConnectorActionErrorCode`
`rate_limit` | `timeout` | `provider_unavailable` | `permission_denied` | `invalid_format` | `unsupported_action` | `upgrade_required`

### `AuditEventType`
`provisioning_event` | `bot_runtime_event` | `connector_event` | `approval_event` | `security_event` | `audit_event` | `memory_write`

### `AuditSeverity`
`info` | `warn` | `error` | `critical`

### `ActionStatus`
`pending` | `executing` | `completed` | `rejected` | `failed`

### `RiskLevel`
`low` | `medium` | `high`

### `TaskExecutionOutcome`
`success` | `failed` | `approval_queued`

### `BrowserActionType`
`click` | `fill` | `navigate` | `select` | `submit` | `key_press` | `screenshot` | `hover` | `scroll` | `wait`

### `SessionAuditStatus`
`running` | `completed` | `failed` | `error`

### `RetentionPolicyAction`
`never_delete` | `manual_delete` | `auto_delete_after_days`

### `RetentionPolicyScope`
`tenant` | `workspace` | `role`

### `RetentionPolicyStatus`
`active` | `archived` | `superseded`

### `AgentQuestionStatus`
`pending` | `answered` | `timed_out`

### `AgentQuestionChannel`
`slack` | `teams` | `dashboard`

### `AgentQuestionTimeoutPolicy`
`proceed_with_best_guess` | `escalate` | `abandon_task`

---

## Models

### `Tenant`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id @default(cuid()) | |
| `name` | `String` | |
| `status` | `TenantStatus` | Default: `pending` |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |
| `users` | `TenantUser[]` | |
| `workspaces` | `Workspace[]` | |

### `TenantUser`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id @default(cuid()) | |
| `tenantId` | `String` | FK → Tenant |
| `email` | `String` @unique | |
| `name` | `String` | |
| `passwordHash` | `String` | bcrypt hash |
| `role` | `String` | |
| `createdAt` | `DateTime` | |

### `Workspace`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id @default(cuid()) | |
| `tenantId` | `String` | FK → Tenant (cascade delete) |
| `name` | `String` | |
| `status` | `WorkspaceStatus` | Default: `pending` |
| `createdAt` | `DateTime` | |
| `bot` | `Bot?` | One workspace → one bot |

### `Bot`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id @default(cuid()) | |
| `workspaceId` | `String` @unique | FK → Workspace |
| `role` | `String` | e.g. `developer`, `recruiter` |
| `status` | `BotStatus` | Default: `created` |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `ProvisioningJob`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `botId` | `String` | |
| `planId` | `String` | |
| `runtimeTier` | `String` | e.g. `dedicated_vm` |
| `roleType` | `String` | |
| `correlationId` | `String` | |
| `triggerSource` | `String` | e.g. `zoho_sign_webhook` |
| `status` | `ProvisioningJobStatus` | Default: `queued` |
| `failureReason` | `String?` | |
| `remediationHint` | `String?` | |
| `cleanupResult` | `String?` | |
| `requestedAt` | `DateTime` | |
| `requestedBy` | `String` | |
| `startedAt` | `DateTime?` | |
| `completedAt` | `DateTime?` | |
| `orderId` | `String?` | Link to billing Order |
| `triggeredBy` | `String?` | |
| `metadata` | `String?` | JSON blob |

### `RuntimeInstance`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `botId` | `String` @unique | FK → Bot |
| `workspaceId` | `String` | |
| `tenantId` | `String` | |
| `status` | `RuntimeStatus` | Default: `created` |
| `contractVersion` | `String` | |
| `endpoint` | `String?` | HTTP endpoint of the running runtime |
| `heartbeatAt` | `DateTime?` | |
| `lastSeenAt` | `DateTime?` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `BotCapabilitySnapshot`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `botId` | `String` | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `roleKey` | `String` | |
| `roleVersion` | `String` | |
| `policyPackVersion` | `String` | |
| `allowedConnectorTools` | `String[]` | |
| `allowedActions` | `String[]` | |
| `brainConfig` | `Json` | LLM provider config |
| `supportedLanguages` | `String[]` | Default: `["en-US"]` |
| `defaultLanguage` | `String` | Default: `"en-US"` |
| `languageTier` | `String` | Default: `"base"` |
| `speechProvider` | `String` | Default: `"oss"` |
| `translationProvider` | `String` | Default: `"oss"` |
| `ttsProvider` | `String` | Default: `"oss"` |
| `avatarEnabled` | `Boolean` | Default: `false` |
| `avatarStyle` | `String` | Default: `"audio-only"` |
| `avatarProvider` | `String` | Default: `"none"` |
| `avatarLocale` | `String` | Default: `"en-US"` |
| `snapshotVersion` | `Int` | Default: `1` |
| `snapshotChecksum` | `String?` | |
| `source` | `CapabilitySnapshotSource` | Default: `runtime_freeze` |
| `frozenAt` | `DateTime` | |
| `createdAt` | `DateTime` | |

### `ActionRecord`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `botId` | `String` | |
| `actionType` | `String` | Normalized action type string |
| `riskLevel` | `RiskLevel` | |
| `policyPackVersion` | `String` | |
| `inputSummary` | `String` | |
| `outputSummary` | `String?` | |
| `status` | `ActionStatus` | Default: `pending` |
| `approvalId` | `String?` | FK → Approval |
| `connectorType` | `String?` | |
| `correlationId` | `String` | |
| `createdAt` | `DateTime` | |
| `completedAt` | `DateTime?` | |

### `Approval`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `botId` | `String` | |
| `taskId` | `String` | |
| `actionId` | `String` | |
| `llmProvider` | `String?` | |
| `llmModel` | `String?` | |
| `riskLevel` | `RiskLevel` | |
| `actionSummary` | `String` | Structured packet string |
| `requestedBy` | `String` | |
| `approverId` | `String?` | |
| `decision` | `ApprovalDecision` | Default: `pending` |
| `decisionReason` | `String?` | |
| `decisionLatencySeconds` | `Int?` | For P95 SLA reporting |
| `policyPackVersion` | `String` | |
| `escalationTimeoutSeconds` | `Int` | Default: `3600` |
| `escalatedAt` | `DateTime?` | |
| `createdAt` | `DateTime` | Immutable after creation |
| `decidedAt` | `DateTime?` | Immutable after set |

### `AuditEvent`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `botId` | `String` | |
| `eventType` | `AuditEventType` | |
| `severity` | `AuditSeverity` | Default: `info` |
| `summary` | `String` | |
| `sourceSystem` | `String` | |
| `correlationId` | `String` | |
| `createdAt` | `DateTime` | |

### `ConnectorAuthMetadata`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `connectorId` | `String` @unique | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `connectorType` | `String` | e.g. `jira`, `github`, `slack` |
| `authMode` | `String` | e.g. `oauth2`, `api_key` |
| `status` | `ConnectorAuthStatus` | |
| `grantedScopes` | `String[]` | |
| `scopeStatus` | `ConnectorScopeStatus?` | |
| `secretRefId` | `String?` | Reference to secure secret store |
| `tokenExpiresAt` | `DateTime?` | |
| `lastRefreshAt` | `DateTime?` | |
| `lastErrorClass` | `ConnectorErrorClass?` | |
| `lastHealthcheckAt` | `DateTime?` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `ConnectorAuthSession`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `connectorId` | `String` | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `stateNonce` | `String` @unique | CSRF state parameter |
| `status` | `String` | |
| `createdAt` | `DateTime` | |
| `expiresAt` | `DateTime` | |

### `ConnectorAuthEvent`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `connectorId` | `String` | |
| `tenantId` | `String` | |
| `eventType` | `String` | |
| `result` | `String` | |
| `errorClass` | `ConnectorErrorClass?` | |
| `correlationId` | `String` | |
| `actor` | `String` | |
| `createdAt` | `DateTime` | |

### `ConnectorAction`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `actionId` | `String` @unique | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `botId` | `String` | |
| `connectorId` | `String` | |
| `connectorType` | `String` | |
| `actionType` | `ConnectorActionType` | |
| `contractVersion` | `String` | Default: `"v1.0"` |
| `correlationId` | `String` | |
| `requestBody` | `Json` | |
| `resultStatus` | `ConnectorActionStatus` | |
| `providerResponseCode` | `String?` | |
| `resultSummary` | `String` | |
| `errorCode` | `ConnectorActionErrorCode?` | |
| `errorMessage` | `String?` | |
| `remediationHint` | `String?` | |
| `completedAt` | `DateTime` | |
| `createdAt` | `DateTime` | |

### `TaskExecutionRecord`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `botId` | `String` | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `taskId` | `String` | |
| `modelProvider` | `String` | |
| `modelProfile` | `String` | |
| `promptTokens` | `Int?` | |
| `completionTokens` | `Int?` | |
| `totalTokens` | `Int?` | |
| `latencyMs` | `Int` | |
| `outcome` | `TaskExecutionOutcome` | |
| `executedAt` | `DateTime` | |
| `createdAt` | `DateTime` | |

### `WorkspaceSessionState`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `version` | `Int` | |
| `state` | `Json` | Full session state blob |
| `updatedBy` | `String` | |
| `updatedAt` | `DateTime` | |
| `createdAt` | `DateTime` | |

Unique: `(tenantId, workspaceId)`

### `WorkspaceCheckpoint`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `sessionVersion` | `Int` | |
| `label` | `String` | |
| `reason` | `String?` | |
| `stateDigest` | `String?` | SHA-256 of state |
| `actor` | `String` | |
| `createdAt` | `DateTime` | |
| `correlationId` | `String` | |

### `DesktopProfile`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `profileId` | `String` @unique | |
| `browser` | `String` | e.g. `chromium` |
| `storageRef` | `String?` | Azure Blob reference |
| `tabState` | `Json` | |
| `tokenVersion` | `Int` | Default: `1` |
| `lastRotatedAt` | `DateTime?` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `IdeState`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `openFiles` | `Json` | Default: `[]` |
| `activeFile` | `String?` | |
| `breakpoints` | `Json` | Default: `[]` |
| `status` | `String` | Default: `"active"` |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `TerminalSession`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `shell` | `String` | Default: `"bash"` |
| `cwd` | `String` | Default: `"/"` |
| `lastCommand` | `String?` | |
| `history` | `Json` | Default: `[]` |
| `status` | `String` | Default: `"active"` |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `ActivityEvent`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `category` | `String` | |
| `title` | `String` | |
| `body` | `String?` | |
| `payload` | `Json?` | |
| `status` | `String` | Default: `"unread"` |
| `sequence` | `Int` | Ordered stream position |
| `ackedAt` | `DateTime?` | |
| `ackedBy` | `String?` | |
| `correlationId` | `String` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `EnvProfile`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `toolchain` | `Json` | Default: `[]` — list of required tools |
| `reconcileStatus` | `String` | Default: `"clean"` |
| `lastReconcileAt` | `DateTime?` | |
| `driftReport` | `Json?` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `DesktopAction`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `actionType` | `String` | |
| `target` | `String?` | |
| `inputPayload` | `Json?` | |
| `result` | `String` | Default: `"success"` |
| `riskLevel` | `String` | Default: `"low"` |
| `retryClass` | `String` | Default: `"retryable"` |
| `retryCount` | `Int` | Default: `0` |
| `screenshotRef` | `String?` | Azure Blob reference |
| `approvalId` | `String?` | |
| `errorMessage` | `String?` | |
| `completedAt` | `DateTime?` | |
| `correlationId` | `String` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `PrDraft`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `branch` | `String` | |
| `targetBranch` | `String?` | |
| `changeSummary` | `String` | |
| `linkedIssueIds` | `Json` | Default: `[]` |
| `title` | `String` | |
| `body` | `String` | Markdown body |
| `checklist` | `Json` | Default: `[]` |
| `reviewersSuggested` | `Json` | Default: `[]` |
| `status` | `String` | Default: `"draft"` |
| `prId` | `String?` | Provider PR ID after creation |
| `provider` | `String?` | e.g. `github`, `gitlab`, `azure_devops` |
| `labels` | `Json` | Default: `[]` |
| `correlationId` | `String` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `CiTriageReport`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `provider` | `String` | e.g. `github_actions`, `azure_devops` |
| `runId` | `String` | |
| `repo` | `String` | |
| `branch` | `String` | |
| `failedJobs` | `Json` | Default: `[]` |
| `logRefs` | `Json` | Default: `[]` |
| `status` | `String` | Default: `"queued"` |
| `rootCauseHypothesis` | `String?` | |
| `reproSteps` | `Json?` | |
| `patchProposal` | `String?` | Proposed fix diff |
| `confidence` | `Float?` | |
| `blastRadius` | `String?` | e.g. `"low"`, `"high"` |
| `correlationId` | `String` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

Unique: `(tenantId, workspaceId, runId)`

### `WorkMemory`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `memoryVersion` | `Int` | Default: `1` |
| `entries` | `Json` | Default: `[]` |
| `summary` | `String?` | |
| `correlationId` | `String` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

Unique: `(tenantId, workspaceId)`

### `RunResume`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `runId` | `String` | |
| `strategy` | `String` | |
| `resumedFrom` | `String?` | |
| `status` | `String` | Default: `"queued"` |
| `failureReason` | `String?` | |
| `correlationId` | `String` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `ReproPack`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `runId` | `String` | |
| `status` | `String` | Default: `"generating"` |
| `manifest` | `Json` | |
| `downloadRef` | `String?` | Azure Blob signed URL |
| `expiresAt` | `DateTime` | |
| `exportAuditEventId` | `String?` | |
| `correlationId` | `String` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `AgentShortTermMemory`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `workspaceId` | `String` | |
| `tenantId` | `String` | |
| `taskId` | `String` | |
| `actionsTaken` | `Json` | `string[]` of action types |
| `approvalOutcomes` | `Json` | `{action, decision, reason?}[]` |
| `connectorsUsed` | `Json` | `string[]` of connector types |
| `llmProvider` | `String?` | |
| `executionStatus` | `String` | `"success"` | `"approval_required"` | `"failed"` |
| `summary` | `String` | Brief text for prompt injection |
| `correlationId` | `String` | |
| `repoName` | `String?` | For per-repo memory isolation |
| `createdAt` | `DateTime` | |
| `expiresAt` | `DateTime?` | createdAt + 7 days; null = permanent |

### `AgentLongTermMemory`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `pattern` | `String` | |
| `repoName` | `String?` | |
| `confidence` | `Float` | |
| `observedCount` | `Int` | Default: `1` |
| `lastSeen` | `DateTime` | |
| `createdAt` | `DateTime` | |

Unique: `(tenantId, pattern)`

### `AgentRepoKnowledge`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `repoName` | `String` | |
| `role` | `String` | |
| `key` | `String` | |
| `value` | `Json` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

Unique: `(tenantId, repoName, role, key)`

### `AgentSession`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | Format: `ses_agt_<agent-short>_<timestamp>_<random>` |
| `tenantId` | `String` | |
| `agentInstanceId` | `String` | Format: `agt_<tenant-short>_<role>_<random>` |
| `taskId` | `String` | Link to TaskRecord |
| `role` | `String` | |
| `recordingId` | `String` | Format: `rec_ses_<session-short>` |
| `recordingUrl` | `String` | Signed URL to `.mp4` |
| `startedAt` | `DateTime` | |
| `endedAt` | `DateTime?` | |
| `actionCount` | `Int` | Default: `0` |
| `status` | `SessionAuditStatus` | Default: `running` |
| `failureReason` | `String?` | |
| `retentionExpiresAt` | `DateTime?` | null = never auto-delete |
| `retentionPolicyId` | `String?` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |
| `actions` | `BrowserActionEvent[]` | |

### `BrowserActionEvent`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | Format: `act_ses_<session-short>_<sequence>` |
| `sessionId` | `String` | FK → AgentSession |
| `tenantId` | `String` | |
| `agentInstanceId` | `String` | |
| `sequence` | `Int` | 0, 1, 2, ... within session |
| `actionType` | `BrowserActionType` | |
| `targetSelector` | `String` | CSS selector |
| `targetText` | `String` | |
| `inputValue` | `String?` | |
| `pageUrl` | `String` | |
| `screenshotBeforeId` | `String` | Format: `scr_<action-id>_before` |
| `screenshotAfterId` | `String` | Format: `scr_<action-id>_after` |
| `screenshotBeforeUrl` | `String` | Signed URL |
| `screenshotAfterUrl` | `String` | Signed URL |
| `domSnapshotHashBefore` | `String?` | |
| `domSnapshotHashAfter` | `String?` | |
| `networkLog` | `Json` | Default: `[]` — `NetworkEntry[]` |
| `durationMs` | `Int` | |
| `success` | `Boolean` | |
| `errorMessage` | `String?` | |
| `failureClass` | `String?` | |
| `timestamp` | `DateTime` | |
| `correctnessAssertion` | `Json?` | `{screenshotDiffPercentage, domChangesDetected, ...}` |
| `createdAt` | `DateTime` | |

### `RetentionPolicy`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String?` | |
| `roleKey` | `String?` | Optional role-scoped policy |
| `name` | `String` | |
| `description` | `String?` | |
| `scope` | `RetentionPolicyScope` | Default: `tenant` |
| `action` | `RetentionPolicyAction` | Default: `never_delete` |
| `retentionDays` | `Int?` | null if not auto_delete |
| `deletionTrigger` | `String?` | `"user_initiated"` | `"scheduled"` | `"api_triggered"` |
| `deletionSchedule` | `String?` | cron expression |
| `effectiveFrom` | `DateTime` | |
| `expiredAt` | `DateTime?` | |
| `status` | `RetentionPolicyStatus` | Default: `active` |
| `createdBy` | `String` | |
| `updatedBy` | `String` | |
| `correlationId` | `String` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `AgentQuestion`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `contractVersion` | `String` | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `taskId` | `String` | |
| `botId` | `String` | |
| `question` | `String` | |
| `context` | `String` | |
| `options` | `String[]` | Default: `[]` |
| `askedVia` | `AgentQuestionChannel` | |
| `status` | `AgentQuestionStatus` | Default: `pending` |
| `timeoutMs` | `Int` | Default: `14400000` (4 hours) |
| `onTimeout` | `AgentQuestionTimeoutPolicy` | Default: `escalate` |
| `answer` | `String?` | |
| `answeredBy` | `String?` | |
| `answeredAt` | `DateTime?` | |
| `expiresAt` | `DateTime` | |
| `correlationId` | `String` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `TenantMcpServer`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String?` | |
| `name` | `String` | |
| `url` | `String` | |
| `headers` | `Json?` | Auth headers |
| `isActive` | `Boolean` | Default: `true` |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

Unique: `(tenantId, name)`

### `TenantLanguageConfig`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` @unique | |
| `defaultLanguage` | `String` | Default: `"en"` |
| `ticketLanguage` | `String` | Default: `"en"` |
| `autoDetect` | `Boolean` | Default: `true` |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `WorkspaceLanguageConfig`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `preferredLanguage` | `String?` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

Unique: `(tenantId, workspaceId)`

### `UserLanguageProfile`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `userId` | `String` | |
| `detectedLanguage` | `String?` | |
| `preferredLanguage` | `String?` | |
| `confidence` | `Float` | Default: `0.0` |
| `lastDetectedAt` | `DateTime?` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |

Unique: `(tenantId, userId)`

### `MeetingSession`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `workspaceId` | `String` | |
| `agentId` | `String` | |
| `meetingUrl` | `String` | |
| `platform` | `String` | `"teams"` | `"zoom"` | `"google_meet"` | `"webex"` |
| `status` | `String` | `joining` | `recording` | `transcribing` | `summarizing` | `done` | `error` | `deleted` |
| `language` | `String?` | |
| `transcriptRaw` | `String?` @db.Text | |
| `summaryText` | `String?` @db.Text | |
| `actionItems` | `String?` @db.Text | JSON array string |
| `agentVoiceId` | `String?` | VoxCPM2 cloned voice ID |
| `speakingEnabled` | `Boolean` | Default: `false` |
| `resolvedLanguage` | `String?` | e.g. `"en"`, `"ja"` |
| `startedAt` | `DateTime` | |
| `endedAt` | `DateTime?` | |
| `updatedAt` | `DateTime` @updatedAt | |

### `Plan`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `name` | `String` | |
| `priceInr` | `Int` | Price in Indian Rupees (paise) |
| `priceUsd` | `Int` | Price in USD (cents) |
| `agentSlots` | `Int` | |
| `features` | `String` | Pipe-separated features string |
| `isActive` | `Boolean` | Default: `true` |
| `createdAt` | `DateTime` | |
| `orders` | `Order[]` | |

### `Order`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `tenantId` | `String` | |
| `planId` | `String` | FK → Plan |
| `plan` | `Plan` | |
| `amountCents` | `Int` | Amount in smallest currency unit |
| `currency` | `String` | e.g. `"INR"`, `"USD"` |
| `status` | `String` | Default: `"pending"` |
| `paymentProvider` | `String` | `"stripe"` | `"razorpay"` |
| `providerOrderId` | `String?` | |
| `providerPaymentId` | `String?` | |
| `providerSignature` | `String?` | |
| `customerEmail` | `String` | |
| `customerCountry` | `String?` | |
| `createdAt` | `DateTime` | |
| `updatedAt` | `DateTime` @updatedAt | |
| `invoice` | `Invoice?` | |
| `contractPdfUrl` | `String?` | Zoho Sign uploaded PDF |
| `zohoSignRequestId` | `String?` | Zoho Sign document request ID |
| `signatureStatus` | `String?` | Default: `"pending"` |
| `signedAt` | `DateTime?` | |
| `contractSentAt` | `DateTime?` | |

### `Invoice`
| Field | Type | Notes |
|---|---|---|
| `id` | `String` @id | |
| `orderId` | `String` @unique | FK → Order |
| `order` | `Order` | |
| `tenantId` | `String` | |
| `number` | `String` @unique | e.g. `INV-2026-00001` |
| `amountCents` | `Int` | |
| `currency` | `String` | |
| `pdfUrl` | `String?` | |
| `sentAt` | `DateTime?` | |
| `paidAt` | `DateTime?` | |
| `createdAt` | `DateTime` | |

---

## Entity Relationship Summary

```
Tenant
  ├── TenantUser (1:N)
  ├── Workspace (1:N)
  │     └── Bot (1:1)
  │           ├── RuntimeInstance (1:1)
  │           ├── BotCapabilitySnapshot (1:N)
  │           ├── ActionRecord (1:N)
  │           └── Approval (1:N)
  ├── TenantLanguageConfig (1:1)
  ├── TenantMcpServer (1:N)
  ├── RetentionPolicy (1:N)
  ├── Order (1:N)
  └── Plan ─── Order ─── Invoice (1:1:1)

Workspace
  ├── WorkspaceSessionState (1:1)
  ├── WorkspaceCheckpoint (1:N)
  ├── DesktopProfile (1:1)
  ├── IdeState (1:1)
  ├── TerminalSession (1:N)
  ├── ActivityEvent (1:N)
  ├── EnvProfile (1:1)
  ├── ConnectorAuthMetadata (1:N)
  ├── AgentShortTermMemory (1:N)
  ├── AgentLongTermMemory (1:N)
  ├── AgentRepoKnowledge (1:N)
  └── WorkspaceLanguageConfig (1:1)

AgentSession
  └── BrowserActionEvent (1:N)
```

---

## Package Ownership

| Package | Models Owned |
|---|---|
| `packages/db-schema` | ALL — single Prisma schema |
| `apps/api-gateway` | Reads/writes all models via Prisma client |
| `apps/agent-runtime` | Reads/writes: AgentShortTermMemory, AgentLongTermMemory, AgentRepoKnowledge, AgentSession, BrowserActionEvent, TaskExecutionRecord, Approval, AuditEvent |
| `services/provisioning-service` | ProvisioningJob, RuntimeInstance |
| `services/approval-service` | Approval, AuditEvent |
| `services/memory-service` | AgentShortTermMemory, AgentLongTermMemory |
| `services/meeting-agent` | MeetingSession |
