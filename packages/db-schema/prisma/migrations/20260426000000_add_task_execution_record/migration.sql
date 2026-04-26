-- CreateEnum
CREATE TYPE "TaskExecutionOutcome" AS ENUM ('success', 'failed', 'approval_queued');

-- CreateTable
CREATE TABLE "TaskExecutionRecord" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL,
    "modelProfile" TEXT NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "outcome" "TaskExecutionOutcome" NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskExecutionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskExecutionRecord_botId_idx" ON "TaskExecutionRecord"("botId");

-- CreateIndex
CREATE INDEX "TaskExecutionRecord_tenantId_idx" ON "TaskExecutionRecord"("tenantId");

-- CreateIndex
CREATE INDEX "TaskExecutionRecord_tenantId_executedAt_idx" ON "TaskExecutionRecord"("tenantId", "executedAt");

-- CreateIndex
CREATE INDEX "TaskExecutionRecord_taskId_idx" ON "TaskExecutionRecord"("taskId");
