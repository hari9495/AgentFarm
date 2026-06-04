-- Make AgentShortTermMemory.expiresAt nullable to match schema.prisma (DateTime?)
-- The original migration created it as NOT NULL; the schema marks it optional.

ALTER TABLE "AgentShortTermMemory"
  ALTER COLUMN "expiresAt" DROP NOT NULL;
