-- CreateTable
CREATE TABLE "WorkspaceSessionState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceSessionState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceCheckpoint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "reason" TEXT,
    "stateDigest" TEXT,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "correlationId" TEXT NOT NULL,

    CONSTRAINT "WorkspaceCheckpoint_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSessionState_tenantId_workspaceId_key" ON "WorkspaceSessionState"("tenantId", "workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceSessionState_tenantId_idx" ON "WorkspaceSessionState"("tenantId");

-- CreateIndex
CREATE INDEX "WorkspaceSessionState_workspaceId_idx" ON "WorkspaceSessionState"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceCheckpoint_tenantId_idx" ON "WorkspaceCheckpoint"("tenantId");

-- CreateIndex
CREATE INDEX "WorkspaceCheckpoint_workspaceId_idx" ON "WorkspaceCheckpoint"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceCheckpoint_tenantId_workspaceId_idx" ON "WorkspaceCheckpoint"("tenantId", "workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceCheckpoint_createdAt_idx" ON "WorkspaceCheckpoint"("createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceCheckpoint_correlationId_idx" ON "WorkspaceCheckpoint"("correlationId");
