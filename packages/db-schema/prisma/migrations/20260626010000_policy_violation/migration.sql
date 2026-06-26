-- Phase 6: append-only policy-violation history for compliance export.

-- CreateTable
CREATE TABLE "PolicyViolation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "botId" TEXT,
    "taskId" TEXT,
    "actionType" TEXT NOT NULL,
    "connector" TEXT,
    "riskLevel" TEXT,
    "effect" TEXT NOT NULL DEFAULT 'deny',
    "reason" TEXT NOT NULL,
    "matchedPolicyId" TEXT,
    "policyVersion" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'runtime',
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyViolation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PolicyViolation_tenantId_idx" ON "PolicyViolation"("tenantId");

-- CreateIndex
CREATE INDEX "PolicyViolation_tenantId_createdAt_idx" ON "PolicyViolation"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PolicyViolation_tenantId_matchedPolicyId_idx" ON "PolicyViolation"("tenantId", "matchedPolicyId");
