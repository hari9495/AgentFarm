-- CreateTable: MeetingAuditEvent was declared in schema.prisma (MeetingSession.auditEvents
-- relation) but never had a migration, so a fresh `migrate deploy` DB lacks the table and
-- GET /v1/meetings/:id/audit-events 500s ("table public.MeetingAuditEvent does not exist").
CREATE TABLE IF NOT EXISTS "MeetingAuditEvent" (
    "id" TEXT NOT NULL,
    "meetingSessionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "summary" TEXT NOT NULL,
    "payload" JSONB,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MeetingAuditEvent_meetingSessionId_idx" ON "MeetingAuditEvent"("meetingSessionId");
CREATE INDEX IF NOT EXISTS "MeetingAuditEvent_tenantId_idx" ON "MeetingAuditEvent"("tenantId");
CREATE INDEX IF NOT EXISTS "MeetingAuditEvent_tenantId_createdAt_idx" ON "MeetingAuditEvent"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "MeetingAuditEvent_tenantId_eventType_idx" ON "MeetingAuditEvent"("tenantId", "eventType");

ALTER TABLE "MeetingAuditEvent"
    ADD CONSTRAINT "MeetingAuditEvent_meetingSessionId_fkey"
    FOREIGN KEY ("meetingSessionId") REFERENCES "MeetingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
