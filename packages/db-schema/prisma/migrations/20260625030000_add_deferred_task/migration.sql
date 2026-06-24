-- C5: shift enforcement — durable deferral of off-shift tasks.

-- CreateTable
CREATE TABLE "DeferredTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT,
    "payload" JSONB NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'shift_closed',
    "runAfter" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "DeferredTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeferredTask_status_runAfter_idx" ON "DeferredTask"("status", "runAfter");

-- CreateIndex
CREATE INDEX "DeferredTask_tenantId_idx" ON "DeferredTask"("tenantId");
