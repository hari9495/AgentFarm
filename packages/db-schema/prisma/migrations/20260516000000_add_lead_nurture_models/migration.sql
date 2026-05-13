-- Migration: add_lead_nurture_models
-- 2026-05-16
-- Creates LeadStatus enum, Lead, and NurtureSequenceEntry tables
-- for the nurture/backlog lead queue feature (Step 8 of NexStaff sales flow).

-- ============================================================
-- LeadStatus enum
-- ============================================================
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'NURTURE', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED');

-- ============================================================
-- Lead
-- Persists every inbound lead from the website contact form.
-- Tracks nurture sequence state and Salesforce sync id.
-- ============================================================
CREATE TABLE "Lead" (
    "id"             TEXT         NOT NULL,
    "tenantId"       TEXT,
    "firstName"      TEXT         NOT NULL,
    "lastName"       TEXT         NOT NULL,
    "email"          TEXT         NOT NULL,
    "company"        TEXT         NOT NULL,
    "message"        TEXT,
    "leadSource"     TEXT         NOT NULL DEFAULT 'Web',
    "status"         "LeadStatus" NOT NULL DEFAULT 'NEW',
    "nurtureStep"    INTEGER      NOT NULL DEFAULT 0,
    "lastContactAt"  TIMESTAMP(3),
    "nextContactAt"  TIMESTAMP(3),
    "qualifiedAt"    TIMESTAMP(3),
    "disqualifiedAt" TIMESTAMP(3),
    "convertedAt"    TIMESTAMP(3),
    "sfLeadId"       TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Lead_status_idx"               ON "Lead"("status");
CREATE INDEX "Lead_tenantId_idx"             ON "Lead"("tenantId");
CREATE INDEX "Lead_status_nextContactAt_idx" ON "Lead"("status", "nextContactAt");

-- ============================================================
-- NurtureSequenceEntry
-- Immutable record of each nurture email sent to a lead.
-- ============================================================
CREATE TABLE "NurtureSequenceEntry" (
    "id"      TEXT         NOT NULL,
    "leadId"  TEXT         NOT NULL,
    "step"    INTEGER      NOT NULL,
    "sentAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "channel" TEXT         NOT NULL DEFAULT 'email',
    "subject" TEXT         NOT NULL,
    "body"    TEXT         NOT NULL,
    "opened"  BOOLEAN      NOT NULL DEFAULT false,
    "clicked" BOOLEAN      NOT NULL DEFAULT false,
    "bounced" BOOLEAN      NOT NULL DEFAULT false,

    CONSTRAINT "NurtureSequenceEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NurtureSequenceEntry_leadId_idx" ON "NurtureSequenceEntry"("leadId");

ALTER TABLE "NurtureSequenceEntry"
    ADD CONSTRAINT "NurtureSequenceEntry_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
