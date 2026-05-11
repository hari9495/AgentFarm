-- Migration: Phase 5–7 models — AgentDispatch, Evidence, Plugin management, Notifications, Quality signals
-- Frozen 2026-05-11

-- ============================================================
-- AgentDispatchRecord
-- Persists cross-process agent dispatch events for audit and status tracking.
-- Source: apps/api-gateway/src/routes/agent-dispatch.ts
-- ============================================================
CREATE TABLE "AgentDispatchRecord" (
    "id"              TEXT         NOT NULL,
    "fromAgentId"     TEXT         NOT NULL,
    "toAgentId"       TEXT         NOT NULL,
    "workspaceId"     TEXT         NOT NULL,
    "tenantId"        TEXT         NOT NULL,
    "taskDescription" TEXT         NOT NULL,
    "status"          TEXT         NOT NULL DEFAULT 'queued',
    "wakeSource"      TEXT         NOT NULL DEFAULT 'agent_handoff',
    "queuedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentDispatchRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentDispatchRecord_tenantId_workspaceId_idx" ON "AgentDispatchRecord"("tenantId", "workspaceId");
CREATE INDEX "AgentDispatchRecord_tenantId_queuedAt_idx"    ON "AgentDispatchRecord"("tenantId", "queuedAt");

-- ============================================================
-- StoredEvidenceBundle
-- Per-task evidence bundles with optional blob-signed screenshots and audit signing.
-- Source: planning/engineering-execution-design.md (evidence-service)
-- ============================================================
CREATE TABLE "StoredEvidenceBundle" (
    "id"            TEXT         NOT NULL,
    "taskId"        TEXT         NOT NULL,
    "tenantId"      TEXT         NOT NULL,
    "workspaceId"   TEXT         NOT NULL,
    "botId"         TEXT         NOT NULL,
    "actionType"    TEXT         NOT NULL,
    "riskLevel"     TEXT         NOT NULL,
    "routeDecision" TEXT         NOT NULL,
    "llmProvider"   TEXT         NOT NULL,
    "inputTokens"   INTEGER      NOT NULL,
    "outputTokens"  INTEGER      NOT NULL,
    "screenshots"   TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "approvalId"    TEXT,
    "signature"     TEXT,
    "finalised"     BOOLEAN      NOT NULL DEFAULT FALSE,
    "finalisedAt"   TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredEvidenceBundle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StoredEvidenceBundle_tenantId_idx"            ON "StoredEvidenceBundle"("tenantId");
CREATE INDEX "StoredEvidenceBundle_workspaceId_idx"         ON "StoredEvidenceBundle"("workspaceId");
CREATE INDEX "StoredEvidenceBundle_taskId_idx"              ON "StoredEvidenceBundle"("taskId");
CREATE INDEX "StoredEvidenceBundle_tenantId_workspaceId_idx" ON "StoredEvidenceBundle"("tenantId", "workspaceId");

-- ============================================================
-- ExternalPluginLoad
-- Audit record for each external plugin load attempt and outcome.
-- ============================================================
CREATE TABLE "ExternalPluginLoad" (
    "id"              TEXT         NOT NULL,
    "tenantId"        TEXT         NOT NULL,
    "pluginKey"       TEXT         NOT NULL,
    "version"         TEXT         NOT NULL,
    "status"          TEXT         NOT NULL,
    "trustLevel"      TEXT         NOT NULL,
    "rejectionReason" TEXT,
    "loadedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalPluginLoad_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExternalPluginLoad_tenantId_idx"           ON "ExternalPluginLoad"("tenantId");
CREATE INDEX "ExternalPluginLoad_tenantId_pluginKey_idx" ON "ExternalPluginLoad"("tenantId", "pluginKey");

-- ============================================================
-- PluginKillSwitch
-- Persists per-tenant plugin kill-switch activations.
-- ============================================================
CREATE TABLE "PluginKillSwitch" (
    "id"        TEXT         NOT NULL,
    "tenantId"  TEXT         NOT NULL,
    "pluginKey" TEXT         NOT NULL,
    "reason"    TEXT,
    "killedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "killedBy"  TEXT,

    CONSTRAINT "PluginKillSwitch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PluginKillSwitch_tenantId_pluginKey_key" ON "PluginKillSwitch"("tenantId", "pluginKey");

-- ============================================================
-- PluginAllowlist
-- Per-tenant plugin capability grants.
-- ============================================================
CREATE TABLE "PluginAllowlist" (
    "id"           TEXT         NOT NULL,
    "tenantId"     TEXT         NOT NULL,
    "pluginKey"    TEXT         NOT NULL,
    "capabilities" TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "grantedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PluginAllowlist_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PluginAllowlist_tenantId_pluginKey_key" ON "PluginAllowlist"("tenantId", "pluginKey");

-- ============================================================
-- NotificationLog
-- Delivery audit log for outbound notifications across channels.
-- ============================================================
CREATE TABLE "NotificationLog" (
    "id"           TEXT         NOT NULL,
    "tenantId"     TEXT         NOT NULL,
    "workspaceId"  TEXT,
    "channel"      TEXT         NOT NULL,
    "eventTrigger" TEXT         NOT NULL,
    "status"       TEXT         NOT NULL,
    "payload"      JSONB,
    "error"        TEXT,
    "sentAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationLog_tenantId_idx"        ON "NotificationLog"("tenantId");
CREATE INDEX "NotificationLog_tenantId_sentAt_idx" ON "NotificationLog"("tenantId", "sentAt");

-- ============================================================
-- QualitySignalLog
-- Records quality signal observations per task / workspace.
-- ============================================================
CREATE TABLE "QualitySignalLog" (
    "id"          TEXT             NOT NULL,
    "tenantId"    TEXT             NOT NULL,
    "workspaceId" TEXT             NOT NULL,
    "taskId"      TEXT,
    "signalType"  TEXT,
    "source"      TEXT,
    "score"       DOUBLE PRECISION,
    "metadata"    JSONB,
    "recordedAt"  TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualitySignalLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QualitySignalLog_tenantId_idx"           ON "QualitySignalLog"("tenantId");
CREATE INDEX "QualitySignalLog_workspaceId_taskId_idx" ON "QualitySignalLog"("workspaceId", "taskId");

-- ============================================================
-- TaskExecutionRecord — add estimatedCostUsd and modelTier
-- Both are nullable so no backfill is required.
-- ============================================================
ALTER TABLE "TaskExecutionRecord"
    ADD COLUMN "estimatedCostUsd" DOUBLE PRECISION,
    ADD COLUMN "modelTier"        TEXT;
