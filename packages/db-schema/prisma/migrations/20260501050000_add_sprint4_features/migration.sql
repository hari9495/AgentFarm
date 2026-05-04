-- Migration: Sprint 4 — F9 Crash Recovery + Repro Pack Generator
-- Frozen 2026-05-01 — canonical source: planning/phase-1-vm-realism-execution-plan.md

-- RunResume: tracks crash recovery requests and resume outcomes
CREATE TABLE "RunResume" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "workspaceId"   TEXT NOT NULL,
    "runId"         TEXT NOT NULL,
    "strategy"      TEXT NOT NULL,
    "resumedFrom"   TEXT,
    "status"        TEXT NOT NULL DEFAULT 'queued',
    "failureReason" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunResume_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RunResume_tenantId_workspaceId_idx"        ON "RunResume"("tenantId", "workspaceId");
CREATE INDEX "RunResume_tenantId_workspaceId_runId_idx"  ON "RunResume"("tenantId", "workspaceId", "runId");

-- ReproPack: access-controlled repro packs for crash/failure investigation
CREATE TABLE "ReproPack" (
    "id"                 TEXT NOT NULL,
    "tenantId"           TEXT NOT NULL,
    "workspaceId"        TEXT NOT NULL,
    "runId"              TEXT NOT NULL,
    "status"             TEXT NOT NULL DEFAULT 'generating',
    "manifest"           JSONB NOT NULL,
    "downloadRef"        TEXT,
    "expiresAt"          TIMESTAMP(3) NOT NULL,
    "exportAuditEventId" TEXT,
    "correlationId"      TEXT NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReproPack_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReproPack_tenantId_workspaceId_idx"        ON "ReproPack"("tenantId", "workspaceId");
CREATE INDEX "ReproPack_tenantId_workspaceId_runId_idx"  ON "ReproPack"("tenantId", "workspaceId", "runId");
