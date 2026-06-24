-- C4: Task-pull intake — tracker poller source + dispatch ledger.

-- CreateTable
CREATE TABLE "TrackerPollSource" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agentId" TEXT,
    "tracker" TEXT NOT NULL,
    "baseUrl" TEXT,
    "assignee" TEXT NOT NULL,
    "projectFilter" TEXT,
    "secretRef" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalSec" INTEGER NOT NULL DEFAULT 300,
    "lastPolledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackerPollSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackerPollDispatch" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tracker" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT,
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackerPollDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackerPollSource_tenantId_idx" ON "TrackerPollSource"("tenantId");

-- CreateIndex
CREATE INDEX "TrackerPollSource_enabled_idx" ON "TrackerPollSource"("enabled");

-- CreateIndex
CREATE INDEX "TrackerPollDispatch_tenantId_idx" ON "TrackerPollDispatch"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackerPollDispatch_sourceId_externalId_key" ON "TrackerPollDispatch"("sourceId", "externalId");

-- AddForeignKey
ALTER TABLE "TrackerPollDispatch" ADD CONSTRAINT "TrackerPollDispatch_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "TrackerPollSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
