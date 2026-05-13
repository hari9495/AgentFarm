-- AlterTable: Add slackDistributed field to MeetingSession
ALTER TABLE "MeetingSession" ADD COLUMN "slackDistributed" BOOLEAN NOT NULL DEFAULT false;
