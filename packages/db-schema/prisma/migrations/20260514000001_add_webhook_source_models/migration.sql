-- Migration: add_webhook_source_models
-- 2026-05-14
-- Creates WebhookSource and InboundWebhookEvent tables for durable
-- inbound webhook processing (replaces the in-memory Map in webhooks.ts).

-- ============================================================
-- WebhookSource
-- Registry of inbound webhook sources; secret stored per-source
-- for HMAC signature verification.
-- ============================================================
CREATE TABLE "WebhookSource" (
    "id"          TEXT         NOT NULL,
    "tenantId"    TEXT         NOT NULL,
    "name"        TEXT         NOT NULL,
    "description" TEXT,
    "secret"      TEXT         NOT NULL,
    "active"      BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookSource_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebhookSource_tenantId_idx" ON "WebhookSource"("tenantId");

-- ============================================================
-- InboundWebhookEvent
-- Immutable log of every inbound event received from a WebhookSource.
-- ============================================================
CREATE TABLE "InboundWebhookEvent" (
    "id"         TEXT         NOT NULL,
    "sourceId"   TEXT         NOT NULL,
    "tenantId"   TEXT         NOT NULL,
    "eventType"  TEXT         NOT NULL,
    "payload"    JSONB        NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed"  BOOLEAN      NOT NULL DEFAULT false,

    CONSTRAINT "InboundWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InboundWebhookEvent_sourceId_idx"           ON "InboundWebhookEvent"("sourceId");
CREATE INDEX "InboundWebhookEvent_tenantId_idx"           ON "InboundWebhookEvent"("tenantId");
CREATE INDEX "InboundWebhookEvent_sourceId_processed_idx" ON "InboundWebhookEvent"("sourceId", "processed");

ALTER TABLE "InboundWebhookEvent"
    ADD CONSTRAINT "InboundWebhookEvent_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "WebhookSource"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
