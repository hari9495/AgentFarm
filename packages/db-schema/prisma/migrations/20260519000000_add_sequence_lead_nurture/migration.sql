-- ============================================================================
-- Migration: 20260519000000_add_sequence_lead_nurture
-- Adds:
--   * New ProspectStatus enum values
--   * New SalesActivityType enum values
--   * sequenceStep column on Prospect
--   * Lead model
--   * NurtureSequenceEntry model
--   * SalesSequenceEntry model
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend ProspectStatus enum
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'nurture'
                   AND enumtypid = 'public."ProspectStatus"'::regtype) THEN
        ALTER TYPE "ProspectStatus" ADD VALUE 'nurture';
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'replied'
                   AND enumtypid = 'public."ProspectStatus"'::regtype) THEN
        ALTER TYPE "ProspectStatus" ADD VALUE 'replied';
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'meeting_booked'
                   AND enumtypid = 'public."ProspectStatus"'::regtype) THEN
        ALTER TYPE "ProspectStatus" ADD VALUE 'meeting_booked';
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'proposal_sent'
                   AND enumtypid = 'public."ProspectStatus"'::regtype) THEN
        ALTER TYPE "ProspectStatus" ADD VALUE 'proposal_sent';
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'closed_won'
                   AND enumtypid = 'public."ProspectStatus"'::regtype) THEN
        ALTER TYPE "ProspectStatus" ADD VALUE 'closed_won';
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'closed_lost'
                   AND enumtypid = 'public."ProspectStatus"'::regtype) THEN
        ALTER TYPE "ProspectStatus" ADD VALUE 'closed_lost';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Extend SalesActivityType enum
-- ----------------------------------------------------------------------------
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'email_replied'
                   AND enumtypid = 'public."SalesActivityType"'::regtype) THEN
        ALTER TYPE "SalesActivityType" ADD VALUE 'email_replied';
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'meeting_booked'
                   AND enumtypid = 'public."SalesActivityType"'::regtype) THEN
        ALTER TYPE "SalesActivityType" ADD VALUE 'meeting_booked';
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'contract_sent'
                   AND enumtypid = 'public."SalesActivityType"'::regtype) THEN
        ALTER TYPE "SalesActivityType" ADD VALUE 'contract_sent';
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'contract_signed'
                   AND enumtypid = 'public."SalesActivityType"'::regtype) THEN
        ALTER TYPE "SalesActivityType" ADD VALUE 'contract_signed';
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'crm_updated'
                   AND enumtypid = 'public."SalesActivityType"'::regtype) THEN
        ALTER TYPE "SalesActivityType" ADD VALUE 'crm_updated';
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'lead_found'
                   AND enumtypid = 'public."SalesActivityType"'::regtype) THEN
        ALTER TYPE "SalesActivityType" ADD VALUE 'lead_found';
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'lead_enriched'
                   AND enumtypid = 'public."SalesActivityType"'::regtype) THEN
        ALTER TYPE "SalesActivityType" ADD VALUE 'lead_enriched';
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'objection_handled'
                   AND enumtypid = 'public."SalesActivityType"'::regtype) THEN
        ALTER TYPE "SalesActivityType" ADD VALUE 'objection_handled';
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'handoff_sent'
                   AND enumtypid = 'public."SalesActivityType"'::regtype) THEN
        ALTER TYPE "SalesActivityType" ADD VALUE 'handoff_sent';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. Add sequenceStep column to Prospect
-- ----------------------------------------------------------------------------
ALTER TABLE "Prospect"
    ADD COLUMN IF NOT EXISTS "sequenceStep" INTEGER NOT NULL DEFAULT 1;

-- ----------------------------------------------------------------------------
-- 4. Create Lead table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "Lead" (
    "id"            TEXT        NOT NULL,
    "tenantId"      TEXT        NOT NULL,
    "firstName"     TEXT        NOT NULL,
    "lastName"      TEXT,
    "email"         TEXT        NOT NULL,
    "company"       TEXT,
    "status"        TEXT        NOT NULL DEFAULT 'NEW',
    "nurtureStep"   INTEGER     NOT NULL DEFAULT 0,
    "lastContactAt" TIMESTAMP(3),
    "nextContactAt" TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Lead_tenantId_email_key"
    ON "Lead"("tenantId", "email");

CREATE INDEX IF NOT EXISTS "Lead_tenantId_idx"
    ON "Lead"("tenantId");

CREATE INDEX IF NOT EXISTS "Lead_status_idx"
    ON "Lead"("status");

CREATE INDEX IF NOT EXISTS "Lead_nextContactAt_idx"
    ON "Lead"("nextContactAt");

-- ----------------------------------------------------------------------------
-- 5. Create NurtureSequenceEntry table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "NurtureSequenceEntry" (
    "id"        TEXT        NOT NULL,
    "leadId"    TEXT        NOT NULL,
    "step"      INTEGER     NOT NULL,
    "channel"   TEXT        NOT NULL DEFAULT 'email',
    "subject"   TEXT,
    "body"      TEXT,
    "sentAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NurtureSequenceEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NurtureSequenceEntry_leadId_idx"
    ON "NurtureSequenceEntry"("leadId");

CREATE INDEX IF NOT EXISTS "NurtureSequenceEntry_step_idx"
    ON "NurtureSequenceEntry"("step");

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NurtureSequenceEntry_leadId_fkey'
    ) THEN
        ALTER TABLE "NurtureSequenceEntry"
            ADD CONSTRAINT "NurtureSequenceEntry_leadId_fkey"
            FOREIGN KEY ("leadId")
            REFERENCES "Lead"("id")
            ON DELETE CASCADE
            ON UPDATE CASCADE
            NOT VALID;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. Create SalesSequenceEntry table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "SalesSequenceEntry" (
    "id"           TEXT        NOT NULL,
    "tenantId"     TEXT        NOT NULL,
    "botId"        TEXT        NOT NULL,
    "prospectId"   TEXT        NOT NULL,
    "sequenceStep" INTEGER     NOT NULL DEFAULT 1,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt"       TIMESTAMP(3),
    "skipped"      BOOLEAN     NOT NULL DEFAULT false,
    "skipReason"   TEXT,
    "subject"      TEXT,
    "activityId"   TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesSequenceEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SalesSequenceEntry_tenantId_idx"
    ON "SalesSequenceEntry"("tenantId");

CREATE INDEX IF NOT EXISTS "SalesSequenceEntry_botId_idx"
    ON "SalesSequenceEntry"("botId");

CREATE INDEX IF NOT EXISTS "SalesSequenceEntry_prospectId_idx"
    ON "SalesSequenceEntry"("prospectId");

CREATE INDEX IF NOT EXISTS "SalesSequenceEntry_scheduledFor_idx"
    ON "SalesSequenceEntry"("scheduledFor");

CREATE INDEX IF NOT EXISTS "SalesSequenceEntry_sentAt_idx"
    ON "SalesSequenceEntry"("sentAt");

ALTER TABLE "SalesSequenceEntry"
    ADD CONSTRAINT "SalesSequenceEntry_prospectId_fkey"
    FOREIGN KEY ("prospectId")
    REFERENCES "Prospect"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
    NOT VALID;
