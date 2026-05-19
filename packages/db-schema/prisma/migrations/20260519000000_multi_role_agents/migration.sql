-- Migration: multi-role agents
-- 1. Allow multiple bots per workspace (customer can buy Developer + Full Stack Developer etc.)
-- 2. Add roleType to Plan so each plan maps to an agent role

-- Drop the unique constraint on Bot.workspaceId
DROP INDEX IF EXISTS "Bot_workspaceId_key";

-- Add roleType to Plan (default to developer_agent for existing plans)
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "roleType" TEXT NOT NULL DEFAULT 'developer_agent';
