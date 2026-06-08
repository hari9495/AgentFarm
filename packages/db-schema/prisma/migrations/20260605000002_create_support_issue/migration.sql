-- CreateEnum
CREATE TYPE "SupportIssueStatus" AS ENUM ('open', 'diagnosing', 'fixing', 'escalated', 'resolved');

-- CreateEnum
CREATE TYPE "SupportIssueSeverity" AS ENUM ('critical', 'high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "DiagnosisStepStatus" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateTable: SupportIssue
CREATE TABLE "SupportIssue" (
    "id"               TEXT NOT NULL,
    "tenantId"         TEXT NOT NULL,
    "workspaceId"      TEXT,
    "title"            TEXT NOT NULL,
    "description"      TEXT NOT NULL,
    "status"           "SupportIssueStatus" NOT NULL DEFAULT 'open',
    "severity"         "SupportIssueSeverity" NOT NULL DEFAULT 'medium',
    "tierReached"      INTEGER,
    "fixApplied"       BOOLEAN NOT NULL DEFAULT FALSE,
    "diagnosisReport"  JSONB,
    "resolutionNotes"  TEXT,
    "escalatedTo"      TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt"       TIMESTAMP(3),

    CONSTRAINT "SupportIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SupportDiagnosisStep
CREATE TABLE "SupportDiagnosisStep" (
    "id"          TEXT NOT NULL,
    "issueId"     TEXT NOT NULL,
    "stepType"    TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status"      "DiagnosisStepStatus" NOT NULL DEFAULT 'pending',
    "metadata"    JSONB NOT NULL DEFAULT '{}',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportDiagnosisStep_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SupportDiagnosisStep" ADD CONSTRAINT "SupportDiagnosisStep_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "SupportIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "SupportIssue_tenantId_idx" ON "SupportIssue"("tenantId");
CREATE INDEX "SupportIssue_tenantId_status_idx" ON "SupportIssue"("tenantId", "status");
CREATE INDEX "SupportDiagnosisStep_issueId_idx" ON "SupportDiagnosisStep"("issueId");
