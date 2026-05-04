-- CreateTable
CREATE TABLE "DesktopProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "storageRef" TEXT,
    "tabState" JSONB NOT NULL,
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "lastRotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesktopProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DesktopProfile_profileId_key" ON "DesktopProfile"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "DesktopProfile_tenantId_workspaceId_key" ON "DesktopProfile"("tenantId", "workspaceId");

-- CreateIndex
CREATE INDEX "DesktopProfile_tenantId_idx" ON "DesktopProfile"("tenantId");

-- CreateIndex
CREATE INDEX "DesktopProfile_workspaceId_idx" ON "DesktopProfile"("workspaceId");
