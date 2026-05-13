-- Migration: add_missing_models
-- 2026-05-14
-- Creates 7 models whose schema definitions were present but had no CREATE TABLE in any prior migration:
--   Plan, Order, Invoice (payment/billing domain)
--   TenantMcpServer (MCP server registry)
--   AgentMessage + enums (agent-to-agent messaging)
--   TenantPortalAccount + TenantPortalSession + enum (portal auth)

-- ============================================================
-- Plan
-- Billing plan definitions. Referenced by Order, TenantSubscription, AgentSubscription.
-- ============================================================
CREATE TABLE "Plan" (
    "id"         TEXT    NOT NULL,
    "name"       TEXT    NOT NULL,
    "priceInr"   INTEGER NOT NULL,
    "priceUsd"   INTEGER NOT NULL,
    "agentSlots" INTEGER NOT NULL,
    "features"   TEXT    NOT NULL,
    "isActive"   BOOLEAN NOT NULL DEFAULT true,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- Order
-- Purchase/payment orders linked to a Plan.
-- ============================================================
CREATE TABLE "Order" (
    "id"                TEXT         NOT NULL,
    "tenantId"          TEXT         NOT NULL,
    "planId"            TEXT         NOT NULL,
    "amountCents"       INTEGER      NOT NULL,
    "currency"          TEXT         NOT NULL,
    "status"            TEXT         NOT NULL DEFAULT 'pending',
    "paymentProvider"   TEXT         NOT NULL,
    "providerOrderId"   TEXT,
    "providerPaymentId" TEXT,
    "providerSignature" TEXT,
    "customerEmail"     TEXT         NOT NULL,
    "customerCountry"   TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    "contractPdfUrl"    TEXT,
    "zohoSignRequestId" TEXT,
    "signatureStatus"   TEXT                  DEFAULT 'pending',
    "signedAt"          TIMESTAMP(3),
    "contractSentAt"    TIMESTAMP(3),

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order" ADD CONSTRAINT "Order_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Invoice
-- Single invoice per Order.
-- ============================================================
CREATE TABLE "Invoice" (
    "id"          TEXT         NOT NULL,
    "orderId"     TEXT         NOT NULL,
    "tenantId"    TEXT         NOT NULL,
    "number"      TEXT         NOT NULL,
    "amountCents" INTEGER      NOT NULL,
    "currency"    TEXT         NOT NULL,
    "pdfUrl"      TEXT,
    "sentAt"      TIMESTAMP(3),
    "paidAt"      TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");
CREATE UNIQUE INDEX "Invoice_number_key"  ON "Invoice"("number");

ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- TenantMcpServer
-- MCP server registry; per-tenant MCP tool endpoint config.
-- Source: apps/api-gateway/src/routes/mcp-servers.ts
-- ============================================================
CREATE TABLE "TenantMcpServer" (
    "id"          TEXT         NOT NULL,
    "tenantId"    TEXT         NOT NULL,
    "workspaceId" TEXT,
    "name"        TEXT         NOT NULL,
    "url"         TEXT         NOT NULL,
    "headers"     JSONB,
    "isActive"    BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantMcpServer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantMcpServer_tenantId_name_key" ON "TenantMcpServer"("tenantId", "name");
CREATE INDEX "TenantMcpServer_tenantId_idx"             ON "TenantMcpServer"("tenantId");
CREATE INDEX "TenantMcpServer_tenantId_isActive_idx"    ON "TenantMcpServer"("tenantId", "isActive");

-- ============================================================
-- AgentMessage enums
-- Required by AgentMessage model.
-- ============================================================
DO $$ BEGIN
    CREATE TYPE "AgentMessageType" AS ENUM (
        'QUESTION', 'ANSWER', 'RESULT', 'STATUS_UPDATE',
        'HANDOFF_REQUEST', 'HANDOFF_ACCEPT', 'HANDOFF_REJECT', 'BROADCAST'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "AgentMessageStatus" AS ENUM (
        'PENDING', 'DELIVERED', 'READ', 'REPLIED', 'EXPIRED'
    );
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- AgentMessage
-- Structured in-platform message passing between bots.
-- Source: Phase 27 — agent-to-agent messaging.
-- ============================================================
CREATE TABLE "AgentMessage" (
    "id"          TEXT                  NOT NULL,
    "fromBotId"   TEXT                  NOT NULL,
    "toBotId"     TEXT                  NOT NULL,
    "threadId"    TEXT,
    "messageType" "AgentMessageType"    NOT NULL,
    "subject"     TEXT,
    "body"        TEXT                  NOT NULL,
    "metadata"    JSONB,
    "status"      "AgentMessageStatus"  NOT NULL DEFAULT 'PENDING',
    "readAt"      TIMESTAMP(3),
    "repliedAt"   TIMESTAMP(3),
    "replyToId"   TEXT,
    "createdAt"   TIMESTAMP(3)          NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"   TIMESTAMP(3),

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentMessage_fromBotId_idx"        ON "AgentMessage"("fromBotId");
CREATE INDEX "AgentMessage_toBotId_idx"          ON "AgentMessage"("toBotId");
CREATE INDEX "AgentMessage_threadId_idx"         ON "AgentMessage"("threadId");
CREATE INDEX "AgentMessage_toBotId_status_idx"   ON "AgentMessage"("toBotId", "status");
CREATE INDEX "AgentMessage_createdAt_idx"        ON "AgentMessage"("createdAt");

ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_replyToId_fkey"  FOREIGN KEY ("replyToId")  REFERENCES "AgentMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_fromBotId_fkey"  FOREIGN KEY ("fromBotId")  REFERENCES "Bot"("id")          ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_toBotId_fkey"    FOREIGN KEY ("toBotId")    REFERENCES "Bot"("id")          ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- TenantPortalRole enum
-- Required by TenantPortalAccount model.
-- ============================================================
DO $$ BEGIN
    CREATE TYPE "TenantPortalRole" AS ENUM ('VIEWER', 'MANAGER', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- TenantPortalAccount
-- Customer-portal login accounts; separate from TenantUser.
-- ============================================================
CREATE TABLE "TenantPortalAccount" (
    "id"           TEXT               NOT NULL,
    "tenantId"     TEXT               NOT NULL,
    "email"        TEXT               NOT NULL,
    "passwordHash" TEXT               NOT NULL,
    "displayName"  TEXT,
    "role"         "TenantPortalRole" NOT NULL DEFAULT 'VIEWER',
    "isActive"     BOOLEAN            NOT NULL DEFAULT true,
    "lastLoginAt"  TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)       NOT NULL,

    CONSTRAINT "TenantPortalAccount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantPortalAccount_tenantId_email_key" ON "TenantPortalAccount"("tenantId", "email");
CREATE INDEX "TenantPortalAccount_tenantId_idx"              ON "TenantPortalAccount"("tenantId");

ALTER TABLE "TenantPortalAccount" ADD CONSTRAINT "TenantPortalAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- TenantPortalSession
-- Session tokens for TenantPortalAccount logins.
-- ============================================================
CREATE TABLE "TenantPortalSession" (
    "id"         TEXT         NOT NULL,
    "accountId"  TEXT         NOT NULL,
    "tenantId"   TEXT         NOT NULL,
    "token"      TEXT         NOT NULL,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPortalSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantPortalSession_token_key" ON "TenantPortalSession"("token");

ALTER TABLE "TenantPortalSession" ADD CONSTRAINT "TenantPortalSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "TenantPortalAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
