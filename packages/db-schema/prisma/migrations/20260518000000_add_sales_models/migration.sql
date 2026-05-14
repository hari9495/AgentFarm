-- Migration: 20260518000000_add_sales_models
-- Adds SalesAgentConfig (idempotent), Prospect, SalesDeal, SalesActivity

DO $$ BEGIN
    CREATE TYPE "ProspectStatus" AS ENUM (
        'new', 'contacted', 'engaged', 'qualified', 'disqualified', 'converted'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "DealStage" AS ENUM (
        'discovery', 'proposal', 'negotiation', 'closed_won', 'closed_lost'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "SalesActivityType" AS ENUM (
        'email', 'call', 'meeting', 'linkedin_message', 'follow_up', 'demo', 'proposal_sent'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SalesAgentConfig" (
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
    "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesAgentConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalesAgentConfig_botId_key"    ON "SalesAgentConfig"("botId");
CREATE INDEX        IF NOT EXISTS "SalesAgentConfig_tenantId_idx" ON "SalesAgentConfig"("tenantId");
CREATE INDEX        IF NOT EXISTS "SalesAgentConfig_botId_idx"    ON "SalesAgentConfig"("botId");

CREATE TABLE "Prospect" (
    "id"              TEXT             NOT NULL,
    "tenantId"        TEXT             NOT NULL,
    "botId"           TEXT             NOT NULL,
    "firstName"       TEXT             NOT NULL,
    "lastName"        TEXT             NOT NULL,
    "email"           TEXT             NOT NULL,
    "company"         TEXT             NOT NULL,
    "title"           TEXT,
    "industry"        TEXT,
    "companySize"     TEXT,
    "linkedinUrl"     TEXT,
    "website"         TEXT,
    "phone"           TEXT,
    "icpScore"        INTEGER          NOT NULL DEFAULT 0,
    "qualified"       BOOLEAN          NOT NULL DEFAULT false,
    "status"          "ProspectStatus" NOT NULL DEFAULT 'new',
    "notes"           TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "nextFollowUpAt"  TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Prospect_tenantId_email_key" ON "Prospect"("tenantId", "email");
CREATE INDEX "Prospect_tenantId_idx"        ON "Prospect"("tenantId");
CREATE INDEX "Prospect_botId_idx"           ON "Prospect"("botId");
CREATE INDEX "Prospect_tenantId_status_idx" ON "Prospect"("tenantId", "status");

CREATE TABLE "SalesDeal" (
    "id"                TEXT         NOT NULL,
    "tenantId"          TEXT         NOT NULL,
    "botId"             TEXT         NOT NULL,
    "prospectId"        TEXT         NOT NULL,
    "title"             TEXT         NOT NULL,
    "value"             DOUBLE PRECISION,
    "currency"          TEXT         NOT NULL DEFAULT 'USD',
    "stage"             "DealStage"  NOT NULL DEFAULT 'discovery',
    "notes"             TEXT,
    "expectedCloseDate" TIMESTAMP(3),
    "closedAt"          TIMESTAMP(3),
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesDeal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalesDeal_tenantId_idx"       ON "SalesDeal"("tenantId");
CREATE INDEX "SalesDeal_botId_idx"          ON "SalesDeal"("botId");
CREATE INDEX "SalesDeal_prospectId_idx"     ON "SalesDeal"("prospectId");
CREATE INDEX "SalesDeal_tenantId_stage_idx" ON "SalesDeal"("tenantId", "stage");
ALTER TABLE "SalesDeal" ADD CONSTRAINT "SalesDeal_prospectId_fkey"
    FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SalesActivity" (
    "id"           TEXT                NOT NULL,
    "tenantId"     TEXT                NOT NULL,
    "botId"        TEXT                NOT NULL,
    "prospectId"   TEXT                NOT NULL,
    "dealId"       TEXT,
    "activityType" "SalesActivityType" NOT NULL,
    "subject"      TEXT                NOT NULL,
    "body"         TEXT,
    "outcome"      TEXT,
    "scheduledAt"  TIMESTAMP(3),
    "completedAt"  TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalesActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalesActivity_tenantId_idx"   ON "SalesActivity"("tenantId");
CREATE INDEX "SalesActivity_botId_idx"      ON "SalesActivity"("botId");
CREATE INDEX "SalesActivity_prospectId_idx" ON "SalesActivity"("prospectId");
CREATE INDEX "SalesActivity_dealId_idx"     ON "SalesActivity"("dealId");
ALTER TABLE "SalesActivity" ADD CONSTRAINT "SalesActivity_prospectId_fkey"
    FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesActivity" ADD CONSTRAINT "SalesActivity_dealId_fkey"
    FOREIGN KEY ("dealId") REFERENCES "SalesDeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
