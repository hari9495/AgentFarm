-- Migration: add_webhook_trigger_rule
-- 2026-06-23
-- Adds WebhookTriggerRule: maps inbound webhook events to auto-enqueued agent
-- tasks. Matching rules enqueue a task through the normal task queue so risk
-- classification and approval still apply.

CREATE TABLE "WebhookTriggerRule" (
    "id"             TEXT         NOT NULL,
    "tenantId"       TEXT         NOT NULL,
    "workspaceId"    TEXT         NOT NULL,
    "sourceId"       TEXT,
    "name"           TEXT         NOT NULL,
    "enabled"        BOOLEAN      NOT NULL DEFAULT true,
    "matchEventType" TEXT,
    "matchField"     TEXT,
    "matchValue"     TEXT,
    "botId"          TEXT         NOT NULL,
    "promptTemplate" TEXT         NOT NULL,
    "priority"       TEXT         NOT NULL DEFAULT 'normal',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookTriggerRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookTriggerRule_tenantId_idx" ON "WebhookTriggerRule"("tenantId");
CREATE INDEX "WebhookTriggerRule_sourceId_idx" ON "WebhookTriggerRule"("sourceId");
