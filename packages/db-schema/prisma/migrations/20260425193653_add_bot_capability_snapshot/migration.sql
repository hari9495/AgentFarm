-- Add capability snapshot source enum if missing.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'CapabilitySnapshotSource'
    ) THEN
        CREATE TYPE "CapabilitySnapshotSource" AS ENUM ('runtime_freeze', 'persisted_load', 'manual_override');
    END IF;
END
$$;

-- Create BotCapabilitySnapshot table for persisted runtime capability snapshots.
CREATE TABLE IF NOT EXISTS "BotCapabilitySnapshot" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "roleVersion" TEXT NOT NULL,
    "policyPackVersion" TEXT NOT NULL,
    "allowedConnectorTools" TEXT[],
    "allowedActions" TEXT[],
    "brainConfig" JSONB NOT NULL,
    "supportedLanguages" TEXT[] DEFAULT ARRAY['en-US']::TEXT[],
    "defaultLanguage" TEXT NOT NULL DEFAULT 'en-US',
    "languageTier" TEXT NOT NULL DEFAULT 'base',
    "speechProvider" TEXT NOT NULL DEFAULT 'oss',
    "translationProvider" TEXT NOT NULL DEFAULT 'oss',
    "ttsProvider" TEXT NOT NULL DEFAULT 'oss',
    "avatarEnabled" BOOLEAN NOT NULL DEFAULT false,
    "avatarStyle" TEXT NOT NULL DEFAULT 'audio-only',
    "avatarProvider" TEXT NOT NULL DEFAULT 'none',
    "avatarLocale" TEXT NOT NULL DEFAULT 'en-US',
    "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
    "snapshotChecksum" TEXT,
    "source" "CapabilitySnapshotSource" NOT NULL DEFAULT 'runtime_freeze',
    "frozenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BotCapabilitySnapshot_pkey" PRIMARY KEY ("id")
);

-- Idempotent indexes/constraints.
CREATE UNIQUE INDEX IF NOT EXISTS "BotCapabilitySnapshot_botId_snapshotVersion_key"
ON "BotCapabilitySnapshot"("botId", "snapshotVersion");

CREATE INDEX IF NOT EXISTS "BotCapabilitySnapshot_tenantId_idx"
ON "BotCapabilitySnapshot"("tenantId");

CREATE INDEX IF NOT EXISTS "BotCapabilitySnapshot_workspaceId_idx"
ON "BotCapabilitySnapshot"("workspaceId");

CREATE INDEX IF NOT EXISTS "BotCapabilitySnapshot_botId_frozenAt_idx"
ON "BotCapabilitySnapshot"("botId", "frozenAt");
