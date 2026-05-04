-- Sprint 3 migration: F6 PR Auto Driver, F7 CI Failure Triage, F10 Work Memory

-- F6 PrDraft
CREATE TABLE IF NOT EXISTS "PrDraft" (
  "id"                 TEXT NOT NULL PRIMARY KEY,
  "tenantId"           TEXT NOT NULL,
  "workspaceId"        TEXT NOT NULL,
  "branch"             TEXT NOT NULL,
  "targetBranch"       TEXT,
  "changeSummary"      TEXT NOT NULL,
  "linkedIssueIds"     JSONB NOT NULL DEFAULT '[]',
  "title"              TEXT NOT NULL,
  "body"               TEXT NOT NULL,
  "checklist"          JSONB NOT NULL DEFAULT '[]',
  "reviewersSuggested" JSONB NOT NULL DEFAULT '[]',
  "status"             TEXT NOT NULL DEFAULT 'draft',
  "prId"               TEXT,
  "provider"           TEXT,
  "labels"             JSONB NOT NULL DEFAULT '[]',
  "correlationId"      TEXT NOT NULL,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "PrDraft_tenantId_workspaceId_idx" ON "PrDraft"("tenantId", "workspaceId");
CREATE INDEX IF NOT EXISTS "PrDraft_tenantId_workspaceId_status_idx" ON "PrDraft"("tenantId", "workspaceId", "status");

-- F7 CiTriageReport
CREATE TABLE IF NOT EXISTS "CiTriageReport" (
  "id"                  TEXT NOT NULL PRIMARY KEY,
  "tenantId"            TEXT NOT NULL,
  "workspaceId"         TEXT NOT NULL,
  "provider"            TEXT NOT NULL,
  "runId"               TEXT NOT NULL,
  "repo"                TEXT NOT NULL,
  "branch"              TEXT NOT NULL,
  "failedJobs"          JSONB NOT NULL DEFAULT '[]',
  "logRefs"             JSONB NOT NULL DEFAULT '[]',
  "status"              TEXT NOT NULL DEFAULT 'queued',
  "rootCauseHypothesis" TEXT,
  "reproSteps"          JSONB,
  "patchProposal"       TEXT,
  "confidence"          DOUBLE PRECISION,
  "blastRadius"         TEXT,
  "correlationId"       TEXT NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "CiTriageReport_tenantId_workspaceId_idx" ON "CiTriageReport"("tenantId", "workspaceId");
CREATE INDEX IF NOT EXISTS "CiTriageReport_tenantId_workspaceId_status_idx" ON "CiTriageReport"("tenantId", "workspaceId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "CiTriageReport_tenantId_workspaceId_runId_key" ON "CiTriageReport"("tenantId", "workspaceId", "runId");

-- F10 WorkMemory
CREATE TABLE IF NOT EXISTS "WorkMemory" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "tenantId"      TEXT NOT NULL,
  "workspaceId"   TEXT NOT NULL,
  "memoryVersion" INTEGER NOT NULL DEFAULT 1,
  "entries"       JSONB NOT NULL DEFAULT '[]',
  "summary"       TEXT,
  "correlationId" TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkMemory_tenantId_workspaceId_key" ON "WorkMemory"("tenantId", "workspaceId");
CREATE INDEX IF NOT EXISTS "WorkMemory_tenantId_workspaceId_idx" ON "WorkMemory"("tenantId", "workspaceId");
