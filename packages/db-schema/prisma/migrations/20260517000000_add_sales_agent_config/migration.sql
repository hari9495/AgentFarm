-- Migration: add_sales_agent_config
-- 2026-05-17
-- Adds SalesAgentConfig model for sales_rep role configuration:
--   productDescription, icp, provider selections, email tone,
--   follow-up schedule, and prospect rate limiting.

CREATE TABLE "SalesAgentConfig" (
    "id"                 TEXT         NOT NULL,
    "tenantId"           TEXT         NOT NULL,
    "botId"              TEXT         NOT NULL,
    "productDescription" TEXT         NOT NULL,
    "icp"                TEXT         NOT NULL,
    "leadSourceProvider" TEXT         NOT NULL,
    "emailProvider"      TEXT         NOT NULL,
    "crmProvider"        TEXT         NOT NULL,
    "calendarProvider"   TEXT         NOT NULL,
    "signatureProvider"  TEXT         NOT NULL,
    "emailTone"          TEXT         NOT NULL DEFAULT 'conversational',
    "followUpDays"       INTEGER[]    NOT NULL DEFAULT ARRAY[3, 7, 14],
    "maxProspectsPerDay" INTEGER      NOT NULL DEFAULT 50,
    "active"             BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesAgentConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesAgentConfig_botId_key" ON "SalesAgentConfig"("botId");
CREATE INDEX "SalesAgentConfig_tenantId_idx"     ON "SalesAgentConfig"("tenantId");
CREATE INDEX "SalesAgentConfig_botId_idx"        ON "SalesAgentConfig"("botId");
