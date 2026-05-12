-- Migration: data_durability_baseline
-- 2026-05-13
-- Implements Sprint 7 data durability requirements:
--   02 · Soft deletes (deletedAt) on all user-facing tables
--   05 · createdAt on every table; updatedAt on mutable tables; createdBy on user-owned tables

-- ============================================================
-- SOFT DELETES — deletedAt on user-facing entities
-- ============================================================
ALTER TABLE "Tenant"                 ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "TenantUser"             ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Workspace"              ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Bot"                    ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ConnectorAuthMetadata"  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ApiKey"                 ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ScheduledJob"           ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "OutboundWebhook"        ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "AbTest"                 ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "MarketplaceInstall"     ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- ============================================================
-- ACTOR COLUMNS — createdBy on user-owned tables
-- ============================================================
ALTER TABLE "Tenant"                 ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "TenantUser"             ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "Workspace"              ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "Bot"                    ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "ConnectorAuthMetadata"  ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "ScheduledJob"           ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "OutboundWebhook"        ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "AbTest"                 ADD COLUMN IF NOT EXISTS "createdBy" TEXT;
ALTER TABLE "MarketplaceInstall"     ADD COLUMN IF NOT EXISTS "createdBy" TEXT;

-- ============================================================
-- MISSING createdAt — tables that had a semantic timestamp
--   but lacked the standard createdAt column
-- Note: DEFAULT CURRENT_TIMESTAMP backfills existing rows.
-- ============================================================
ALTER TABLE "MeetingSession"           ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ExternalPluginLoad"       ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PluginKillSwitch"         ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PluginAllowlist"          ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "NotificationLog"          ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "QualitySignalLog"         ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SubscriptionEvent"        ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "OutboundWebhookDelivery"  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "MarketplaceInstall"       ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CircuitBreakerState"      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "TaskQueueEntry"           ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ============================================================
-- MISSING updatedAt — mutable tables that lacked it
-- Note: DEFAULT CURRENT_TIMESTAMP backfills existing rows.
--   Prisma @updatedAt will manage this column going forward.
-- ============================================================
ALTER TABLE "TenantUser"          ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Workspace"           ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "StoredEvidenceBundle" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AgentDispatchRecord" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AgentLongTermMemory" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Plan"                ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Invoice"             ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PluginAllowlist"     ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "WebhookDlqEntry"     ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "MarketplaceInstall"  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ============================================================
-- INDEXES — for efficient soft-delete filtering
--   (WHERE "deletedAt" IS NULL is the standard query pattern)
-- ============================================================
CREATE INDEX IF NOT EXISTS "Tenant_deletedAt_idx"                ON "Tenant"("deletedAt");
CREATE INDEX IF NOT EXISTS "TenantUser_deletedAt_idx"            ON "TenantUser"("deletedAt");
CREATE INDEX IF NOT EXISTS "Workspace_deletedAt_idx"             ON "Workspace"("deletedAt");
CREATE INDEX IF NOT EXISTS "Bot_deletedAt_idx"                   ON "Bot"("deletedAt");
CREATE INDEX IF NOT EXISTS "ConnectorAuthMetadata_deletedAt_idx" ON "ConnectorAuthMetadata"("deletedAt");
CREATE INDEX IF NOT EXISTS "ApiKey_deletedAt_idx"                ON "ApiKey"("deletedAt");
CREATE INDEX IF NOT EXISTS "ScheduledJob_deletedAt_idx"          ON "ScheduledJob"("deletedAt");
CREATE INDEX IF NOT EXISTS "OutboundWebhook_deletedAt_idx"       ON "OutboundWebhook"("deletedAt");
CREATE INDEX IF NOT EXISTS "AbTest_deletedAt_idx"                ON "AbTest"("deletedAt");
CREATE INDEX IF NOT EXISTS "MarketplaceInstall_deletedAt_idx"    ON "MarketplaceInstall"("deletedAt");
