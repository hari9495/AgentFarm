-- Add messagingEnabled flag to Bot
-- Allows operators to disable agent-to-agent (A2A) messaging per bot.
-- Default TRUE preserves existing behaviour for all current bots.

ALTER TABLE "Bot" ADD COLUMN "messagingEnabled" BOOLEAN NOT NULL DEFAULT TRUE;
