-- CreateTable: TenantPasswordResetToken
CREATE TABLE "TenantPasswordResetToken" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "token"     TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantPasswordResetToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantPasswordResetToken_token_key" ON "TenantPasswordResetToken"("token");
CREATE INDEX "TenantPasswordResetToken_tenantId_idx" ON "TenantPasswordResetToken"("tenantId");
CREATE INDEX "TenantPasswordResetToken_token_idx" ON "TenantPasswordResetToken"("token");

ALTER TABLE "TenantPasswordResetToken" ADD CONSTRAINT "TenantPasswordResetToken_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "TenantPortalAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: SupportIssue — add prUrl column (IF NOT EXISTS guards replay)
ALTER TABLE "SupportIssue" ADD COLUMN IF NOT EXISTS "prUrl" TEXT;
