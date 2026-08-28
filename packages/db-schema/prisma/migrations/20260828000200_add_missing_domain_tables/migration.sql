-- Additive-only sync: 9 tables + 2 enums declared in schema.prisma that never had a
-- migration, so fresh migrate-deploy DBs lacked them and features 500'd (same class as
-- the meetings fixes). Tables: SetupWizardSession, BrowserTask, BookingEvent,
-- ContractEvent, WinLossEvent, CallRecord, SalesNegotiation, SalesProposal, NpsResponse.
-- DELIBERATELY EXCLUDES the diff's DROP COLUMN/INDEX/CONSTRAINT statements: those would
-- remove deletedAt soft-delete cols, pgvector ivfflat RAG indexes, and AgentMessage
-- columns that live code depends on — schema.prisma is stale for those; reconcile separately.

CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'expired', 'suspended', 'cancelled');

CREATE TYPE "SubscriptionEventActor" AS ENUM ('system', 'payment_webhook', 'admin', 'customer');

CREATE TABLE "SetupWizardSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "botId" TEXT,
    "currentStep" TEXT NOT NULL DEFAULT 'select_role',
    "completedSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selectedRole" TEXT,
    "connectors" JSONB NOT NULL DEFAULT '[]',
    "personaBotId" TEXT,
    "approvalPolicy" JSONB,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SetupWizardSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BrowserTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "prospectId" TEXT,
    "dealId" TEXT,
    "goal" TEXT NOT NULL,
    "allowedDomain" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "steps" JSONB NOT NULL DEFAULT '[]',
    "result" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrowserTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "prospectId" TEXT,
    "botId" TEXT,
    "bookingProvider" TEXT NOT NULL DEFAULT 'other',
    "externalId" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "guestEmail" TEXT,
    "guestName" TEXT,
    "meetingTitle" TEXT,
    "meetingSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rawPayload" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContractEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT,
    "signerEmail" TEXT NOT NULL,
    "signerName" TEXT,
    "signedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WinLossEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "dealValue" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "daysToClose" INTEGER,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WinLossEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CallRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "activityId" TEXT,
    "callId" TEXT,
    "twilioCallSid" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'twilio',
    "status" TEXT NOT NULL DEFAULT 'initiated',
    "toNumber" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "outcome" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesNegotiation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "dealId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "listPrice" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "currentOffer" DOUBLE PRECISION NOT NULL,
    "counterOffer" DOUBLE PRECISION,
    "discountPercent" DOUBLE PRECISION,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "approvalStatus" TEXT,
    "approverEmail" TEXT,
    "turns" JSONB NOT NULL DEFAULT '[]',
    "outcome" TEXT,
    "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesNegotiation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SalesProposal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "dealId" TEXT,
    "title" TEXT NOT NULL,
    "htmlContent" TEXT NOT NULL,
    "listPrice" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "sections" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sentAt" TIMESTAMP(3),
    "activityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesProposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NpsResponse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "dealId" TEXT,
    "surveyType" TEXT NOT NULL DEFAULT 'nps',
    "score" INTEGER,
    "feedback" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "token" TEXT NOT NULL,
    "activityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NpsResponse_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SetupWizardSession_tenantId_idx" ON "SetupWizardSession"("tenantId");

CREATE INDEX "SetupWizardSession_status_idx" ON "SetupWizardSession"("status");

CREATE INDEX "BrowserTask_tenantId_idx" ON "BrowserTask"("tenantId");

CREATE INDEX "BrowserTask_botId_idx" ON "BrowserTask"("botId");

CREATE INDEX "BrowserTask_tenantId_status_idx" ON "BrowserTask"("tenantId", "status");

CREATE INDEX "BookingEvent_tenantId_idx" ON "BookingEvent"("tenantId");

CREATE INDEX "BookingEvent_prospectId_idx" ON "BookingEvent"("prospectId");

CREATE INDEX "BookingEvent_tenantId_status_idx" ON "BookingEvent"("tenantId", "status");

CREATE INDEX "BookingEvent_meetingSessionId_idx" ON "BookingEvent"("meetingSessionId");

CREATE INDEX "ContractEvent_tenantId_idx" ON "ContractEvent"("tenantId");

CREATE INDEX "ContractEvent_dealId_idx" ON "ContractEvent"("dealId");

CREATE INDEX "ContractEvent_tenantId_status_idx" ON "ContractEvent"("tenantId", "status");

CREATE INDEX "WinLossEvent_tenantId_idx" ON "WinLossEvent"("tenantId");

CREATE INDEX "WinLossEvent_dealId_idx" ON "WinLossEvent"("dealId");

CREATE INDEX "WinLossEvent_tenantId_outcome_idx" ON "WinLossEvent"("tenantId", "outcome");

CREATE UNIQUE INDEX "CallRecord_callId_key" ON "CallRecord"("callId");

CREATE UNIQUE INDEX "CallRecord_twilioCallSid_key" ON "CallRecord"("twilioCallSid");

CREATE INDEX "CallRecord_tenantId_idx" ON "CallRecord"("tenantId");

CREATE INDEX "CallRecord_botId_idx" ON "CallRecord"("botId");

CREATE INDEX "CallRecord_prospectId_idx" ON "CallRecord"("prospectId");

CREATE INDEX "CallRecord_callId_idx" ON "CallRecord"("callId");

CREATE INDEX "CallRecord_twilioCallSid_idx" ON "CallRecord"("twilioCallSid");

CREATE INDEX "CallRecord_tenantId_status_idx" ON "CallRecord"("tenantId", "status");

CREATE INDEX "SalesNegotiation_tenantId_idx" ON "SalesNegotiation"("tenantId");

CREATE INDEX "SalesNegotiation_botId_idx" ON "SalesNegotiation"("botId");

CREATE INDEX "SalesNegotiation_prospectId_idx" ON "SalesNegotiation"("prospectId");

CREATE INDEX "SalesNegotiation_tenantId_status_idx" ON "SalesNegotiation"("tenantId", "status");

CREATE INDEX "SalesProposal_tenantId_idx" ON "SalesProposal"("tenantId");

CREATE INDEX "SalesProposal_botId_idx" ON "SalesProposal"("botId");

CREATE INDEX "SalesProposal_prospectId_idx" ON "SalesProposal"("prospectId");

CREATE INDEX "SalesProposal_tenantId_status_idx" ON "SalesProposal"("tenantId", "status");

CREATE UNIQUE INDEX "NpsResponse_token_key" ON "NpsResponse"("token");

CREATE INDEX "NpsResponse_tenantId_idx" ON "NpsResponse"("tenantId");

CREATE INDEX "NpsResponse_botId_idx" ON "NpsResponse"("botId");

CREATE INDEX "NpsResponse_prospectId_idx" ON "NpsResponse"("prospectId");

CREATE INDEX "NpsResponse_token_idx" ON "NpsResponse"("token");

CREATE INDEX "NpsResponse_tenantId_surveyType_idx" ON "NpsResponse"("tenantId", "surveyType");

ALTER TABLE "CallRecord" ADD CONSTRAINT "CallRecord_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesNegotiation" ADD CONSTRAINT "SalesNegotiation_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SalesProposal" ADD CONSTRAINT "SalesProposal_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NpsResponse" ADD CONSTRAINT "NpsResponse_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
