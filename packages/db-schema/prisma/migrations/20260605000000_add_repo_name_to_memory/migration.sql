-- Add repoName to AgentShortTermMemory and AgentLongTermMemory
-- These nullable columns were added to the Prisma schema without a corresponding migration.

ALTER TABLE "AgentShortTermMemory"
  ADD COLUMN IF NOT EXISTS "repoName" TEXT;

ALTER TABLE "AgentLongTermMemory"
  ADD COLUMN IF NOT EXISTS "repoName" TEXT;
