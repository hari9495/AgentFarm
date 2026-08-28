-- AlterTable: Add MeetingSession columns declared in schema.prisma that never had a migration
-- (proposalPath, videoEnabled, avatarProfileId, desktopSessionId, recordingUrl).
-- Without these, a fresh `migrate deploy` DB is missing the columns while the generated
-- Prisma client selects them, so GET /v1/meetings 500s ("column ... does not exist").
-- All additive and nullable/defaulted → safe on existing data.
ALTER TABLE "MeetingSession" ADD COLUMN IF NOT EXISTS "proposalPath" TEXT;
ALTER TABLE "MeetingSession" ADD COLUMN IF NOT EXISTS "videoEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MeetingSession" ADD COLUMN IF NOT EXISTS "avatarProfileId" TEXT;
ALTER TABLE "MeetingSession" ADD COLUMN IF NOT EXISTS "desktopSessionId" TEXT;
ALTER TABLE "MeetingSession" ADD COLUMN IF NOT EXISTS "recordingUrl" TEXT;
