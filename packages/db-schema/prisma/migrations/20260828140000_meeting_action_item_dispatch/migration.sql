-- AlterTable: Phase 2 act-via-approvals columns on MeetingActionItem. Additive/nullable.
ALTER TABLE "MeetingActionItem" ADD COLUMN IF NOT EXISTS "approvalId" TEXT;
ALTER TABLE "MeetingActionItem" ADD COLUMN IF NOT EXISTS "dispatchConnector" TEXT;
ALTER TABLE "MeetingActionItem" ADD COLUMN IF NOT EXISTS "dispatchActionType" TEXT;
ALTER TABLE "MeetingActionItem" ADD COLUMN IF NOT EXISTS "dispatchPayload" JSONB;
ALTER TABLE "MeetingActionItem" ADD COLUMN IF NOT EXISTS "dispatchError" TEXT;
