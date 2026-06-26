-- Phase 6 Group D: durable storage for governance workflow templates + instances
-- (replaces the in-memory Maps in governance-workflows.ts).

-- CreateTable
CREATE TABLE "GovernanceWorkflowTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dataJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernanceWorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GovernanceWorkflowInstance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dataJson" JSONB NOT NULL,
    "decisionsJson" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernanceWorkflowInstance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GovernanceWorkflowTemplate_tenantId_idx" ON "GovernanceWorkflowTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "GovernanceWorkflowInstance_tenantId_idx" ON "GovernanceWorkflowInstance"("tenantId");
