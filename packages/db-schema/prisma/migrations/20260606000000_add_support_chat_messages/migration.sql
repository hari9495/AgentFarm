-- CreateTable: SupportChatMessage
-- Stores the full chat transcript per support issue for audit and history display.

CREATE TABLE "SupportChatMessage" (
    "id"        TEXT NOT NULL,
    "issueId"   TEXT NOT NULL,
    "role"      TEXT NOT NULL,
    "content"   TEXT NOT NULL,
    "metadata"  JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportChatMessage_pkey" PRIMARY KEY ("id")
);

-- AddIndex
CREATE INDEX "SupportChatMessage_issueId_idx" ON "SupportChatMessage"("issueId");
CREATE INDEX "SupportChatMessage_issueId_createdAt_idx" ON "SupportChatMessage"("issueId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportChatMessage" ADD CONSTRAINT "SupportChatMessage_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "SupportIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
