-- Frozen 2026-05-01 — Phase 1 Sprint 2: Activity stream, env reconciler, desktop actions
-- Migration: 20260501030000_add_sprint2_features

-- F5: Unified activity/notification stream
CREATE TABLE IF NOT EXISTS "ActivityEvent" (
  "id"            TEXT        NOT NULL,
  "tenantId"      TEXT        NOT NULL,
  "workspaceId"   TEXT        NOT NULL,
  "category"      TEXT        NOT NULL,
  "title"         TEXT        NOT NULL,
  "body"          TEXT,
  "payload"       JSONB,
  "status"        TEXT        NOT NULL DEFAULT 'unread',
  "sequence"      INTEGER     NOT NULL,
  "ackedAt"       TIMESTAMPTZ,
  "ackedBy"       TEXT,
  "correlationId" TEXT        NOT NULL,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ActivityEvent_tenantId_idx"
  ON "ActivityEvent" ("tenantId");
CREATE INDEX IF NOT EXISTS "ActivityEvent_workspaceId_idx"
  ON "ActivityEvent" ("workspaceId");
CREATE INDEX IF NOT EXISTS "ActivityEvent_tenantId_workspaceId_sequence_idx"
  ON "ActivityEvent" ("tenantId", "workspaceId", "sequence");
CREATE INDEX IF NOT EXISTS "ActivityEvent_tenantId_workspaceId_status_idx"
  ON "ActivityEvent" ("tenantId", "workspaceId", "status");

-- F8: Environment reconciler profile
CREATE TABLE IF NOT EXISTS "EnvProfile" (
  "id"               TEXT        NOT NULL,
  "tenantId"         TEXT        NOT NULL,
  "workspaceId"      TEXT        NOT NULL,
  "toolchain"        JSONB       NOT NULL DEFAULT '[]',
  "reconcileStatus"  TEXT        NOT NULL DEFAULT 'clean',
  "lastReconcileAt"  TIMESTAMPTZ,
  "driftReport"      JSONB,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "EnvProfile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnvProfile_tenantId_workspaceId_key" UNIQUE ("tenantId", "workspaceId")
);

CREATE INDEX IF NOT EXISTS "EnvProfile_tenantId_idx"    ON "EnvProfile" ("tenantId");
CREATE INDEX IF NOT EXISTS "EnvProfile_workspaceId_idx" ON "EnvProfile" ("workspaceId");

-- F3: Desktop GUI action runtime records
CREATE TABLE IF NOT EXISTS "DesktopAction" (
  "id"            TEXT        NOT NULL,
  "tenantId"      TEXT        NOT NULL,
  "workspaceId"   TEXT        NOT NULL,
  "actionType"    TEXT        NOT NULL,
  "target"        TEXT,
  "inputPayload"  JSONB,
  "result"        TEXT        NOT NULL DEFAULT 'success',
  "riskLevel"     TEXT        NOT NULL DEFAULT 'low',
  "retryClass"    TEXT        NOT NULL DEFAULT 'retryable',
  "retryCount"    INTEGER     NOT NULL DEFAULT 0,
  "screenshotRef" TEXT,
  "approvalId"    TEXT,
  "errorMessage"  TEXT,
  "completedAt"   TIMESTAMPTZ,
  "correlationId" TEXT        NOT NULL,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "DesktopAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DesktopAction_tenantId_idx"             ON "DesktopAction" ("tenantId");
CREATE INDEX IF NOT EXISTS "DesktopAction_workspaceId_idx"          ON "DesktopAction" ("workspaceId");
CREATE INDEX IF NOT EXISTS "DesktopAction_tenantId_workspaceId_idx" ON "DesktopAction" ("tenantId", "workspaceId");
CREATE INDEX IF NOT EXISTS "DesktopAction_approvalId_idx"           ON "DesktopAction" ("approvalId");
