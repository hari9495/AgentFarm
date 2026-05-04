-- Frozen 2026-05-01 — Phase 1 VM realism F4: IDE state and terminal session continuity
-- Migration: 20260501020000_add_ide_terminal_state

CREATE TABLE IF NOT EXISTS "IdeState" (
  "id"          TEXT        NOT NULL,
  "tenantId"    TEXT        NOT NULL,
  "workspaceId" TEXT        NOT NULL,
  "openFiles"   JSONB       NOT NULL DEFAULT '[]',
  "activeFile"  TEXT,
  "breakpoints" JSONB       NOT NULL DEFAULT '[]',
  "status"      TEXT        NOT NULL DEFAULT 'active',
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "IdeState_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "IdeState_tenantId_workspaceId_key" UNIQUE ("tenantId", "workspaceId")
);

CREATE INDEX IF NOT EXISTS "IdeState_tenantId_idx"    ON "IdeState" ("tenantId");
CREATE INDEX IF NOT EXISTS "IdeState_workspaceId_idx" ON "IdeState" ("workspaceId");

CREATE TABLE IF NOT EXISTS "TerminalSession" (
  "id"          TEXT        NOT NULL,
  "tenantId"    TEXT        NOT NULL,
  "workspaceId" TEXT        NOT NULL,
  "shell"       TEXT        NOT NULL DEFAULT 'bash',
  "cwd"         TEXT        NOT NULL DEFAULT '/',
  "lastCommand" TEXT,
  "history"     JSONB       NOT NULL DEFAULT '[]',
  "status"      TEXT        NOT NULL DEFAULT 'active',
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "TerminalSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TerminalSession_tenantId_idx"             ON "TerminalSession" ("tenantId");
CREATE INDEX IF NOT EXISTS "TerminalSession_workspaceId_idx"          ON "TerminalSession" ("workspaceId");
CREATE INDEX IF NOT EXISTS "TerminalSession_tenantId_workspaceId_idx" ON "TerminalSession" ("tenantId", "workspaceId");
