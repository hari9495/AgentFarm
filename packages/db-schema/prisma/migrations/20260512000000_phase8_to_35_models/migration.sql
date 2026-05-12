-- Migration: phase8_to_35_models
-- Frozen 2026-05-12
-- Adds 25 models introduced in Phases 8–35

-- ============================================================
-- TenantLanguageConfig
-- Per-tenant language preference and auto-detection settings.
-- Source: apps/api-gateway/src/routes/language.ts
-- ============================================================
CREATE TABLE "TenantLanguageConfig" (
    "id"              TEXT         NOT NULL,
    "tenantId"        TEXT         NOT NULL,
    "defaultLanguage" TEXT         NOT NULL DEFAULT 'en',
    "ticketLanguage"  TEXT         NOT NULL DEFAULT 'en',
    "autoDetect"      BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantLanguageConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantLanguageConfig_tenantId_key" ON "TenantLanguageConfig"("tenantId");
CREATE INDEX "TenantLanguageConfig_tenantId_idx"        ON "TenantLanguageConfig"("tenantId");

-- ============================================================
-- WorkspaceLanguageConfig
-- Per-workspace language preference overrides.
-- Source: apps/api-gateway/src/routes/language.ts
-- ============================================================
CREATE TABLE "WorkspaceLanguageConfig" (
    "id"                TEXT         NOT NULL,
    "tenantId"          TEXT         NOT NULL,
    "workspaceId"       TEXT         NOT NULL,
    "preferredLanguage" TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceLanguageConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceLanguageConfig_tenantId_workspaceId_key" ON "WorkspaceLanguageConfig"("tenantId", "workspaceId");
CREATE INDEX "WorkspaceLanguageConfig_tenantId_idx"                    ON "WorkspaceLanguageConfig"("tenantId");

-- ============================================================
-- UserLanguageProfile
-- Per-user language detection state and preference.
-- Source: apps/api-gateway/src/routes/language.ts
-- ============================================================
CREATE TABLE "UserLanguageProfile" (
    "id"                TEXT             NOT NULL,
    "tenantId"          TEXT             NOT NULL,
    "userId"            TEXT             NOT NULL,
    "detectedLanguage"  TEXT,
    "preferredLanguage" TEXT,
    "confidence"        DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "lastDetectedAt"    TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "UserLanguageProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserLanguageProfile_tenantId_userId_key" ON "UserLanguageProfile"("tenantId", "userId");
CREATE INDEX "UserLanguageProfile_tenantId_idx"              ON "UserLanguageProfile"("tenantId");
CREATE INDEX "UserLanguageProfile_tenantId_userId_idx"       ON "UserLanguageProfile"("tenantId", "userId");

-- ============================================================
-- MeetingSession
-- Transcription pipeline sessions for Teams / Zoom / Meet / Webex.
-- Source: apps/api-gateway/src/routes/meeting.ts
-- ============================================================
CREATE TABLE "MeetingSession" (
    "id"               TEXT         NOT NULL,
    "tenantId"         TEXT         NOT NULL,
    "workspaceId"      TEXT         NOT NULL,
    "agentId"          TEXT         NOT NULL,
    "meetingUrl"       TEXT         NOT NULL,
    "platform"         TEXT         NOT NULL,
    "status"           TEXT         NOT NULL DEFAULT 'joining',
    "language"         TEXT,
    "transcriptRaw"    TEXT,
    "summaryText"      TEXT,
    "actionItems"      TEXT,
    "agentVoiceId"     TEXT,
    "speakingEnabled"  BOOLEAN      NOT NULL DEFAULT false,
    "resolvedLanguage" TEXT,
    "startedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"          TIMESTAMP(3),
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeetingSession_tenantId_idx"            ON "MeetingSession"("tenantId");
CREATE INDEX "MeetingSession_workspaceId_idx"         ON "MeetingSession"("workspaceId");
CREATE INDEX "MeetingSession_tenantId_workspaceId_idx" ON "MeetingSession"("tenantId", "workspaceId");
CREATE INDEX "MeetingSession_tenantId_status_idx"     ON "MeetingSession"("tenantId", "status");

-- ============================================================
-- TenantSubscription
-- Tenant-level subscription controlling full platform access.
-- Source: apps/api-gateway/src/lib/check-subscription.ts
-- ============================================================
CREATE TABLE "TenantSubscription" (
    "id"              TEXT         NOT NULL,
    "tenantId"        TEXT         NOT NULL,
    "planId"          TEXT         NOT NULL,
    "status"          TEXT         NOT NULL DEFAULT 'active',
    "paymentProvider" TEXT         NOT NULL,
    "startedAt"       TIMESTAMP(3) NOT NULL,
    "expiresAt"       TIMESTAMP(3) NOT NULL,
    "gracePeriodDays" INTEGER      NOT NULL DEFAULT 3,
    "suspendedAt"     TIMESTAMP(3),
    "cancelledAt"     TIMESTAMP(3),
    "reactivatedAt"   TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantSubscription_tenantId_key"         ON "TenantSubscription"("tenantId");
CREATE INDEX "TenantSubscription_tenantId_idx"                ON "TenantSubscription"("tenantId");
CREATE INDEX "TenantSubscription_status_idx"                  ON "TenantSubscription"("status");
CREATE INDEX "TenantSubscription_expiresAt_idx"               ON "TenantSubscription"("expiresAt");
CREATE INDEX "TenantSubscription_tenantId_status_idx"         ON "TenantSubscription"("tenantId", "status");

-- ============================================================
-- AgentSubscription
-- Per-agent subscription add-on; can be standalone or linked to
-- a TenantSubscription.
-- Source: apps/api-gateway/src/lib/check-subscription.ts
-- ============================================================
CREATE TABLE "AgentSubscription" (
    "id"                   TEXT         NOT NULL,
    "tenantId"             TEXT         NOT NULL,
    "agentId"              TEXT         NOT NULL,
    "tenantSubscriptionId" TEXT,
    "planId"               TEXT         NOT NULL,
    "status"               TEXT         NOT NULL DEFAULT 'active',
    "paymentProvider"      TEXT         NOT NULL,
    "startedAt"            TIMESTAMP(3) NOT NULL,
    "expiresAt"            TIMESTAMP(3) NOT NULL,
    "gracePeriodDays"      INTEGER      NOT NULL DEFAULT 3,
    "suspendedAt"          TIMESTAMP(3),
    "cancelledAt"          TIMESTAMP(3),
    "reactivatedAt"        TIMESTAMP(3),
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentSubscription_tenantId_agentId_key" ON "AgentSubscription"("tenantId", "agentId");
CREATE INDEX "AgentSubscription_tenantId_idx"                ON "AgentSubscription"("tenantId");
CREATE INDEX "AgentSubscription_agentId_idx"                 ON "AgentSubscription"("agentId");
CREATE INDEX "AgentSubscription_status_idx"                  ON "AgentSubscription"("status");
CREATE INDEX "AgentSubscription_expiresAt_idx"               ON "AgentSubscription"("expiresAt");
CREATE INDEX "AgentSubscription_tenantId_status_idx"         ON "AgentSubscription"("tenantId", "status");

-- ============================================================
-- SubscriptionEvent
-- Immutable audit trail for all subscription status transitions.
-- Source: apps/api-gateway/src/routes/billing.ts
-- ============================================================
CREATE TABLE "SubscriptionEvent" (
    "id"                   TEXT         NOT NULL,
    "tenantId"             TEXT         NOT NULL,
    "tenantSubscriptionId" TEXT,
    "agentSubscriptionId"  TEXT,
    "fromStatus"           TEXT,
    "toStatus"             TEXT         NOT NULL,
    "actor"                TEXT         NOT NULL,
    "paymentProvider"      TEXT,
    "providerEventId"      TEXT,
    "reason"               TEXT,
    "metadata"             JSONB,
    "occurredAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SubscriptionEvent_tenantId_idx"              ON "SubscriptionEvent"("tenantId");
CREATE INDEX "SubscriptionEvent_tenantSubscriptionId_idx"  ON "SubscriptionEvent"("tenantSubscriptionId");
CREATE INDEX "SubscriptionEvent_agentSubscriptionId_idx"   ON "SubscriptionEvent"("agentSubscriptionId");
CREATE INDEX "SubscriptionEvent_tenantId_occurredAt_idx"   ON "SubscriptionEvent"("tenantId", "occurredAt");

-- ============================================================
-- OutboundWebhook
-- Customer-configured outbound webhooks fired on task events.
-- Source: apps/api-gateway/src/routes/outbound-webhooks.ts
-- ============================================================
CREATE TABLE "OutboundWebhook" (
    "id"           TEXT         NOT NULL,
    "tenantId"     TEXT         NOT NULL,
    "workspaceId"  TEXT,
    "url"          TEXT         NOT NULL,
    "secret"       TEXT         NOT NULL,
    "events"       TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "enabled"      BOOLEAN      NOT NULL DEFAULT true,
    "failureCount" INTEGER      NOT NULL DEFAULT 0,
    "dlqAt"        TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundWebhook_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboundWebhook_tenantId_idx"         ON "OutboundWebhook"("tenantId");
CREATE INDEX "OutboundWebhook_tenantId_enabled_idx" ON "OutboundWebhook"("tenantId", "enabled");

-- ============================================================
-- OutboundWebhookDelivery
-- Delivery log for each outbound webhook fire attempt.
-- Source: apps/api-gateway/src/routes/outbound-webhooks.ts
-- ============================================================
CREATE TABLE "OutboundWebhookDelivery" (
    "id"             TEXT         NOT NULL,
    "webhookId"      TEXT         NOT NULL,
    "tenantId"       TEXT         NOT NULL,
    "eventType"      TEXT         NOT NULL,
    "payload"        JSONB        NOT NULL,
    "responseStatus" INTEGER,
    "responseBody"   TEXT,
    "durationMs"     INTEGER,
    "success"        BOOLEAN      NOT NULL,
    "firedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundWebhookDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OutboundWebhookDelivery_webhookId_idx"         ON "OutboundWebhookDelivery"("webhookId");
CREATE INDEX "OutboundWebhookDelivery_tenantId_idx"          ON "OutboundWebhookDelivery"("tenantId");
CREATE INDEX "OutboundWebhookDelivery_webhookId_firedAt_idx" ON "OutboundWebhookDelivery"("webhookId", "firedAt");

-- ============================================================
-- WebhookDlqEntry
-- Dead-letter queue entries for webhooks that exceeded the
-- failure threshold.
-- Source: apps/api-gateway/src/routes/outbound-webhooks.ts
-- ============================================================
CREATE TABLE "WebhookDlqEntry" (
    "id"            TEXT         NOT NULL,
    "webhookId"     TEXT         NOT NULL,
    "tenantId"      TEXT         NOT NULL,
    "reason"        TEXT         NOT NULL,
    "lastPayload"   JSONB        NOT NULL,
    "lastEventType" TEXT         NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"    TIMESTAMP(3),
    "resolvedBy"    TEXT,

    CONSTRAINT "WebhookDlqEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookDlqEntry_tenantId_idx"  ON "WebhookDlqEntry"("tenantId");
CREATE INDEX "WebhookDlqEntry_webhookId_idx" ON "WebhookDlqEntry"("webhookId");

-- ============================================================
-- AbTest
-- A/B test configuration for comparing two BotConfigVersions.
-- Source: apps/api-gateway/src/routes/ab-tests.ts
-- ============================================================
CREATE TABLE "AbTest" (
    "id"             TEXT             NOT NULL,
    "tenantId"       TEXT             NOT NULL,
    "botId"          TEXT             NOT NULL,
    "name"           TEXT             NOT NULL,
    "versionAId"     TEXT             NOT NULL,
    "versionBId"     TEXT             NOT NULL,
    "trafficSplit"   DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "status"         TEXT             NOT NULL DEFAULT 'active',
    "conclusionNote" TEXT,
    "createdAt"      TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)     NOT NULL,

    CONSTRAINT "AbTest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AbTest_tenantId_idx"        ON "AbTest"("tenantId");
CREATE INDEX "AbTest_tenantId_botId_idx"  ON "AbTest"("tenantId", "botId");
CREATE INDEX "AbTest_tenantId_status_idx" ON "AbTest"("tenantId", "status");

-- ============================================================
-- AbTestAssignment
-- Records which BotConfigVersion variant was assigned per task.
-- Source: apps/api-gateway/src/routes/ab-tests.ts
-- ============================================================
CREATE TABLE "AbTestAssignment" (
    "id"        TEXT         NOT NULL,
    "abTestId"  TEXT         NOT NULL,
    "tenantId"  TEXT         NOT NULL,
    "taskId"    TEXT         NOT NULL,
    "versionId" TEXT         NOT NULL,
    "variant"   TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbTestAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AbTestAssignment_taskId_key" ON "AbTestAssignment"("taskId");
CREATE INDEX "AbTestAssignment_abTestId_idx"      ON "AbTestAssignment"("abTestId");
CREATE INDEX "AbTestAssignment_tenantId_idx"      ON "AbTestAssignment"("tenantId");
CREATE INDEX "AbTestAssignment_taskId_idx"        ON "AbTestAssignment"("taskId");

-- ============================================================
-- AgentRateLimit
-- Per-bot configurable request rate cap; enforced at dispatch.
-- Source: apps/api-gateway/src/routes/runtime-tasks.ts
-- ============================================================
CREATE TABLE "AgentRateLimit" (
    "id"                TEXT         NOT NULL,
    "botId"             TEXT         NOT NULL,
    "tenantId"          TEXT         NOT NULL,
    "requestsPerMinute" INTEGER      NOT NULL DEFAULT 60,
    "burstLimit"        INTEGER      NOT NULL DEFAULT 10,
    "enabled"           BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRateLimit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentRateLimit_botId_key" ON "AgentRateLimit"("botId");
CREATE INDEX "AgentRateLimit_tenantId_idx"     ON "AgentRateLimit"("tenantId");

-- ============================================================
-- CircuitBreakerState
-- Persists circuit state transitions for dashboards and audit.
-- The in-memory state machine is the authoritative source;
-- this table is written asynchronously on state change.
-- Source: apps/api-gateway/src/lib/circuit-breaker.ts
-- ============================================================
CREATE TABLE "CircuitBreakerState" (
    "id"            TEXT         NOT NULL,
    "key"           TEXT         NOT NULL,
    "tenantId"      TEXT         NOT NULL,
    "state"         TEXT         NOT NULL DEFAULT 'closed',
    "failureCount"  INTEGER      NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),
    "openedAt"      TIMESTAMP(3),
    "nextRetryAt"   TIMESTAMP(3),
    "successCount"  INTEGER      NOT NULL DEFAULT 0,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CircuitBreakerState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CircuitBreakerState_key_key"            ON "CircuitBreakerState"("key");
CREATE INDEX "CircuitBreakerState_tenantId_idx"              ON "CircuitBreakerState"("tenantId");
CREATE INDEX "CircuitBreakerState_tenantId_state_idx"        ON "CircuitBreakerState"("tenantId", "state");

-- ============================================================
-- TaskQueueEntry
-- Priority task queue for tenant-scoped task ingestion.
-- Drained by the in-process sweep worker in api-gateway.
-- Source: apps/api-gateway/src/lib/task-queue.ts
-- ============================================================
CREATE TABLE "TaskQueueEntry" (
    "id"           TEXT         NOT NULL,
    "tenantId"     TEXT         NOT NULL,
    "workspaceId"  TEXT         NOT NULL,
    "botId"        TEXT,
    "priority"     TEXT         NOT NULL DEFAULT 'normal',
    "status"       TEXT         NOT NULL DEFAULT 'pending',
    "payload"      JSONB        NOT NULL,
    "errorMessage" TEXT,
    "enqueuedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt"    TIMESTAMP(3),
    "completedAt"  TIMESTAMP(3),
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskQueueEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskQueueEntry_tenantId_idx"                     ON "TaskQueueEntry"("tenantId");
CREATE INDEX "TaskQueueEntry_tenantId_status_idx"              ON "TaskQueueEntry"("tenantId", "status");
CREATE INDEX "TaskQueueEntry_tenantId_priority_enqueuedAt_idx" ON "TaskQueueEntry"("tenantId", "priority", "enqueuedAt");

-- ============================================================
-- ScheduledReport
-- Periodic digest email configuration per workspace.
-- Source: apps/api-gateway/src/routes/scheduled-reports.ts
-- ============================================================
CREATE TABLE "ScheduledReport" (
    "id"             TEXT         NOT NULL,
    "tenantId"       TEXT         NOT NULL,
    "workspaceId"    TEXT         NOT NULL,
    "name"           TEXT         NOT NULL,
    "recipientEmail" TEXT         NOT NULL,
    "frequency"      TEXT         NOT NULL DEFAULT 'weekly',
    "reportTypes"    TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "enabled"        BOOLEAN      NOT NULL DEFAULT true,
    "lastSentAt"     TIMESTAMP(3),
    "nextSendAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduledReport_tenantId_idx"             ON "ScheduledReport"("tenantId");
CREATE INDEX "ScheduledReport_tenantId_enabled_idx"     ON "ScheduledReport"("tenantId", "enabled");
CREATE INDEX "ScheduledReport_nextSendAt_enabled_idx"   ON "ScheduledReport"("nextSendAt", "enabled");

-- ============================================================
-- ApiKey
-- Long-lived programmatic access keys (Bearer af_<key>).
-- Only the keyHash is stored; rawKey is returned once at creation.
-- Source: apps/api-gateway/src/lib/api-key-auth.ts
-- ============================================================
CREATE TABLE "ApiKey" (
    "id"         TEXT         NOT NULL,
    "tenantId"   TEXT         NOT NULL,
    "createdBy"  TEXT         NOT NULL,
    "name"       TEXT         NOT NULL,
    "keyHash"    TEXT         NOT NULL,
    "keyPrefix"  TEXT         NOT NULL,
    "scopes"     TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "role"       TEXT         NOT NULL DEFAULT 'operator',
    "enabled"    BOOLEAN      NOT NULL DEFAULT true,
    "expiresAt"  TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiKey_keyHash_key"         ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_tenantId_idx"               ON "ApiKey"("tenantId");
CREATE INDEX "ApiKey_keyHash_idx"                ON "ApiKey"("keyHash");
CREATE INDEX "ApiKey_tenantId_enabled_idx"       ON "ApiKey"("tenantId", "enabled");

-- ============================================================
-- OrchestrationRun
-- Multi-agent orchestration run record tracking sub-task progress.
-- Source: apps/api-gateway/src/routes/orchestration.ts
-- ============================================================
CREATE TABLE "OrchestrationRun" (
    "id"               TEXT         NOT NULL,
    "tenantId"         TEXT         NOT NULL,
    "workspaceId"      TEXT         NOT NULL,
    "coordinatorBotId" TEXT         NOT NULL,
    "goal"             TEXT         NOT NULL,
    "status"           TEXT         NOT NULL DEFAULT 'running',
    "subTaskCount"     INTEGER      NOT NULL DEFAULT 0,
    "completedCount"   INTEGER      NOT NULL DEFAULT 0,
    "failedCount"      INTEGER      NOT NULL DEFAULT 0,
    "result"           JSONB,
    "errorSummary"     TEXT,
    "startedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"      TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrchestrationRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrchestrationRun_tenantId_idx"        ON "OrchestrationRun"("tenantId");
CREATE INDEX "OrchestrationRun_tenantId_status_idx" ON "OrchestrationRun"("tenantId", "status");

-- ============================================================
-- BotConfigVersion
-- User-facing config snapshots for per-bot rollback.
-- Source: apps/api-gateway/src/routes/bot-versions.ts
-- ============================================================
CREATE TABLE "BotConfigVersion" (
    "id"                TEXT         NOT NULL,
    "botId"             TEXT         NOT NULL,
    "tenantId"          TEXT         NOT NULL,
    "versionNumber"     INTEGER      NOT NULL,
    "role"              TEXT         NOT NULL,
    "status"            TEXT         NOT NULL,
    "roleVersion"       TEXT,
    "policyPackVersion" TEXT,
    "brainConfig"       JSONB,
    "changeNote"        TEXT,
    "createdBy"         TEXT         NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotConfigVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BotConfigVersion_botId_versionNumber_key" ON "BotConfigVersion"("botId", "versionNumber");
CREATE INDEX "BotConfigVersion_botId_idx"                      ON "BotConfigVersion"("botId");
CREATE INDEX "BotConfigVersion_tenantId_idx"                   ON "BotConfigVersion"("tenantId");

-- ============================================================
-- ChatSession
-- Multi-turn conversational session root with message history.
-- Source: apps/api-gateway/src/routes/chat.ts
-- ============================================================
CREATE TABLE "ChatSession" (
    "id"        TEXT         NOT NULL,
    "tenantId"  TEXT         NOT NULL,
    "agentId"   TEXT,
    "title"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatSession_tenantId_idx" ON "ChatSession"("tenantId");

-- ============================================================
-- ChatMessage
-- Individual messages within a ChatSession.
-- Source: apps/api-gateway/src/routes/chat.ts
-- ============================================================
CREATE TABLE "ChatMessage" (
    "id"        TEXT         NOT NULL,
    "sessionId" TEXT         NOT NULL,
    "role"      TEXT         NOT NULL,
    "content"   TEXT         NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- ============================================================
-- MarketplaceListing
-- Durable skill catalog entry for the marketplace.
-- Source: apps/api-gateway/src/routes/marketplace.ts
-- ============================================================
CREATE TABLE "MarketplaceListing" (
    "id"          TEXT         NOT NULL,
    "skillId"     TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "version"     TEXT         NOT NULL,
    "author"      TEXT,
    "permissions" JSONB        NOT NULL DEFAULT '[]',
    "source"      TEXT,
    "tags"        JSONB        NOT NULL DEFAULT '[]',
    "status"      TEXT         NOT NULL DEFAULT 'active',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceListing_skillId_key" ON "MarketplaceListing"("skillId");
CREATE INDEX "MarketplaceListing_status_idx"         ON "MarketplaceListing"("status");

-- ============================================================
-- MarketplaceInstall
-- Per-tenant skill install tracking for the marketplace.
-- Source: apps/api-gateway/src/routes/marketplace.ts
-- ============================================================
CREATE TABLE "MarketplaceInstall" (
    "id"                  TEXT         NOT NULL,
    "tenantId"            TEXT         NOT NULL,
    "skillId"             TEXT         NOT NULL,
    "listingId"           TEXT         NOT NULL,
    "approvedPermissions" JSONB        NOT NULL DEFAULT '[]',
    "pinVersion"          BOOLEAN      NOT NULL DEFAULT false,
    "status"              TEXT         NOT NULL DEFAULT 'installed',
    "installedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uninstalledAt"       TIMESTAMP(3),

    CONSTRAINT "MarketplaceInstall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplaceInstall_tenantId_skillId_key" ON "MarketplaceInstall"("tenantId", "skillId");
CREATE INDEX "MarketplaceInstall_tenantId_idx"                ON "MarketplaceInstall"("tenantId");
CREATE INDEX "MarketplaceInstall_tenantId_status_idx"         ON "MarketplaceInstall"("tenantId", "status");

-- ============================================================
-- ScheduledJob
-- Cron-based automatic task firing per tenant.
-- Source: apps/api-gateway/src/routes/schedule.ts
-- ============================================================
CREATE TABLE "ScheduledJob" (
    "id"        TEXT         NOT NULL,
    "tenantId"  TEXT         NOT NULL,
    "name"      TEXT         NOT NULL,
    "cronExpr"  TEXT         NOT NULL,
    "goal"      TEXT         NOT NULL,
    "agentId"   TEXT,
    "enabled"   BOOLEAN      NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScheduledJob_tenantId_idx"         ON "ScheduledJob"("tenantId");
CREATE INDEX "ScheduledJob_tenantId_enabled_idx" ON "ScheduledJob"("tenantId", "enabled");

-- ============================================================
-- AgentRepoKnowledge
-- Per-repo structural knowledge accumulated by the agent.
-- Source: packages/db-schema/prisma/schema.prisma (Phase 35)
-- ============================================================
CREATE TABLE "AgentRepoKnowledge" (
    "id"          TEXT         NOT NULL,
    "tenantId"    TEXT         NOT NULL,
    "workspaceId" TEXT         NOT NULL,
    "repoName"    TEXT         NOT NULL,
    "role"        TEXT         NOT NULL,
    "key"         TEXT         NOT NULL,
    "value"       JSONB        NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRepoKnowledge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentRepoKnowledge_tenantId_repoName_role_key_key" ON "AgentRepoKnowledge"("tenantId", "repoName", "role", "key");
CREATE INDEX "AgentRepoKnowledge_tenantId_repoName_role_idx"            ON "AgentRepoKnowledge"("tenantId", "repoName", "role");
CREATE INDEX "AgentRepoKnowledge_workspaceId_idx"                       ON "AgentRepoKnowledge"("workspaceId");
