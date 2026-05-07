-- CreateEnum
CREATE TYPE "BrowserActionType" AS ENUM ('click', 'fill', 'navigate', 'select', 'submit', 'key_press', 'screenshot', 'hover', 'scroll', 'wait');

-- CreateEnum
CREATE TYPE "SessionAuditStatus" AS ENUM ('running', 'completed', 'failed', 'error');

-- CreateEnum
CREATE TYPE "RetentionPolicyAction" AS ENUM ('never_delete', 'manual_delete', 'auto_delete_after_days');

-- CreateEnum
CREATE TYPE "RetentionPolicyScope" AS ENUM ('tenant', 'workspace', 'role');

-- CreateEnum
CREATE TYPE "RetentionPolicyStatus" AS ENUM ('active', 'archived', 'superseded');

-- CreateEnum
CREATE TYPE "AgentQuestionStatus" AS ENUM ('pending', 'answered', 'timed_out');

-- CreateEnum
CREATE TYPE "AgentQuestionChannel" AS ENUM ('slack', 'teams', 'dashboard');

-- CreateEnum
CREATE TYPE "AgentQuestionTimeoutPolicy" AS ENUM ('proceed_with_best_guess', 'escalate', 'abandon_task');

-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'memory_write';

-- AlterTable
ALTER TABLE "ActivityEvent" ALTER COLUMN "ackedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Approval" ADD COLUMN     "llmModel" TEXT,
ADD COLUMN     "llmProvider" TEXT;

-- AlterTable
ALTER TABLE "CiTriageReport" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "DesktopAction" ALTER COLUMN "completedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "EnvProfile" ALTER COLUMN "lastReconcileAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "IdeState" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PrDraft" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TerminalSession" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WorkMemory" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "AgentShortTermMemory" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actionsTaken" JSONB NOT NULL,
    "approvalOutcomes" JSONB NOT NULL,
    "connectorsUsed" JSONB NOT NULL,
    "llmProvider" TEXT,
    "executionStatus" TEXT NOT NULL DEFAULT 'success',
    "summary" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentShortTermMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLongTermMemory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "observedCount" INTEGER NOT NULL DEFAULT 1,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLongTermMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentInstanceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "recordingUrl" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "actionCount" INTEGER NOT NULL DEFAULT 0,
    "status" "SessionAuditStatus" NOT NULL DEFAULT 'running',
    "failureReason" TEXT,
    "retentionExpiresAt" TIMESTAMP(3),
    "retentionPolicyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrowserActionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentInstanceId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "actionType" "BrowserActionType" NOT NULL,
    "targetSelector" TEXT NOT NULL,
    "targetText" TEXT NOT NULL,
    "inputValue" TEXT,
    "pageUrl" TEXT NOT NULL,
    "screenshotBeforeId" TEXT NOT NULL,
    "screenshotAfterId" TEXT NOT NULL,
    "screenshotBeforeUrl" TEXT NOT NULL,
    "screenshotAfterUrl" TEXT NOT NULL,
    "domSnapshotHashBefore" TEXT,
    "domSnapshotHashAfter" TEXT,
    "networkLog" JSONB NOT NULL DEFAULT '[]',
    "durationMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "failureClass" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "correctnessAssertion" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrowserActionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "roleKey" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "RetentionPolicyScope" NOT NULL DEFAULT 'tenant',
    "action" "RetentionPolicyAction" NOT NULL DEFAULT 'never_delete',
    "retentionDays" INTEGER,
    "deletionTrigger" TEXT,
    "deletionSchedule" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "expiredAt" TIMESTAMP(3),
    "status" "RetentionPolicyStatus" NOT NULL DEFAULT 'active',
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentQuestion" (
    "id" TEXT NOT NULL,
    "contractVersion" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "askedVia" "AgentQuestionChannel" NOT NULL,
    "status" "AgentQuestionStatus" NOT NULL DEFAULT 'pending',
    "timeoutMs" INTEGER NOT NULL DEFAULT 14400000,
    "onTimeout" "AgentQuestionTimeoutPolicy" NOT NULL DEFAULT 'escalate',
    "answer" TEXT,
    "answeredBy" TEXT,
    "answeredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentShortTermMemory_workspaceId_createdAt_idx" ON "AgentShortTermMemory"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentShortTermMemory_workspaceId_expiresAt_idx" ON "AgentShortTermMemory"("workspaceId", "expiresAt");

-- CreateIndex
CREATE INDEX "AgentShortTermMemory_tenantId_idx" ON "AgentShortTermMemory"("tenantId");

-- CreateIndex
CREATE INDEX "AgentLongTermMemory_workspaceId_confidence_idx" ON "AgentLongTermMemory"("workspaceId", "confidence");

-- CreateIndex
CREATE INDEX "AgentLongTermMemory_tenantId_workspaceId_idx" ON "AgentLongTermMemory"("tenantId", "workspaceId");

-- CreateIndex
CREATE INDEX "AgentSession_tenantId_idx" ON "AgentSession"("tenantId");

-- CreateIndex
CREATE INDEX "AgentSession_agentInstanceId_idx" ON "AgentSession"("agentInstanceId");

-- CreateIndex
CREATE INDEX "AgentSession_taskId_idx" ON "AgentSession"("taskId");

-- CreateIndex
CREATE INDEX "AgentSession_tenantId_startedAt_idx" ON "AgentSession"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentSession_status_idx" ON "AgentSession"("status");

-- CreateIndex
CREATE INDEX "AgentSession_retentionExpiresAt_idx" ON "AgentSession"("retentionExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_id_key" ON "AgentSession"("id");

-- CreateIndex
CREATE INDEX "BrowserActionEvent_sessionId_idx" ON "BrowserActionEvent"("sessionId");

-- CreateIndex
CREATE INDEX "BrowserActionEvent_tenantId_idx" ON "BrowserActionEvent"("tenantId");

-- CreateIndex
CREATE INDEX "BrowserActionEvent_agentInstanceId_idx" ON "BrowserActionEvent"("agentInstanceId");

-- CreateIndex
CREATE INDEX "BrowserActionEvent_tenantId_actionType_idx" ON "BrowserActionEvent"("tenantId", "actionType");

-- CreateIndex
CREATE INDEX "BrowserActionEvent_timestamp_idx" ON "BrowserActionEvent"("timestamp");

-- CreateIndex
CREATE INDEX "BrowserActionEvent_tenantId_timestamp_idx" ON "BrowserActionEvent"("tenantId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "BrowserActionEvent_id_key" ON "BrowserActionEvent"("id");

-- CreateIndex
CREATE INDEX "RetentionPolicy_tenantId_idx" ON "RetentionPolicy"("tenantId");

-- CreateIndex
CREATE INDEX "RetentionPolicy_tenantId_workspaceId_idx" ON "RetentionPolicy"("tenantId", "workspaceId");

-- CreateIndex
CREATE INDEX "RetentionPolicy_tenantId_status_idx" ON "RetentionPolicy"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AgentQuestion_tenantId_idx" ON "AgentQuestion"("tenantId");

-- CreateIndex
CREATE INDEX "AgentQuestion_workspaceId_idx" ON "AgentQuestion"("workspaceId");

-- CreateIndex
CREATE INDEX "AgentQuestion_taskId_idx" ON "AgentQuestion"("taskId");

-- CreateIndex
CREATE INDEX "AgentQuestion_status_idx" ON "AgentQuestion"("status");

-- CreateIndex
CREATE INDEX "AgentQuestion_expiresAt_idx" ON "AgentQuestion"("expiresAt");

-- CreateIndex
CREATE INDEX "AgentQuestion_tenantId_status_idx" ON "AgentQuestion"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "BrowserActionEvent" ADD CONSTRAINT "BrowserActionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
