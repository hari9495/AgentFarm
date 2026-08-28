-- CreateTable: MeetingActionItem — structured action items extracted from a meeting.
-- Additive; parent MeetingSession already exists. Cascade-deletes with the session.
CREATE TABLE IF NOT EXISTS "MeetingActionItem" (
    "id" TEXT NOT NULL,
    "meetingSessionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "ownerName" TEXT,
    "ownerEmail" TEXT,
    "dueDate" TIMESTAMP(3),
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "status" TEXT NOT NULL DEFAULT 'open',
    "linkedTaskId" TEXT,
    "linkedConnector" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MeetingActionItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MeetingActionItem_meetingSessionId_idx" ON "MeetingActionItem"("meetingSessionId");
CREATE INDEX IF NOT EXISTS "MeetingActionItem_tenantId_idx" ON "MeetingActionItem"("tenantId");
CREATE INDEX IF NOT EXISTS "MeetingActionItem_tenantId_status_idx" ON "MeetingActionItem"("tenantId", "status");

ALTER TABLE "MeetingActionItem"
    ADD CONSTRAINT "MeetingActionItem_meetingSessionId_fkey"
    FOREIGN KEY ("meetingSessionId") REFERENCES "MeetingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
