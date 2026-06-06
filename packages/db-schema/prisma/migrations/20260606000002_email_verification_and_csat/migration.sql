-- Email verification fields on TenantPortalAccount
ALTER TABLE "TenantPortalAccount" ADD COLUMN "isEmailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TenantPortalAccount" ADD COLUMN "emailVerificationToken" TEXT;
ALTER TABLE "TenantPortalAccount" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "TenantPortalAccount_emailVerificationToken_key" ON "TenantPortalAccount"("emailVerificationToken");

-- Mark all pre-existing accounts as already verified (don't break existing users)
UPDATE "TenantPortalAccount" SET "isEmailVerified" = true WHERE "isEmailVerified" = false;

-- CSAT response table
CREATE TABLE "SupportCsatResponse" (
    "id"          TEXT NOT NULL,
    "issueId"     TEXT NOT NULL,
    "token"       TEXT NOT NULL,
    "rating"      INTEGER,
    "comment"     TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportCsatResponse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupportCsatResponse_issueId_key" ON "SupportCsatResponse"("issueId");
CREATE UNIQUE INDEX "SupportCsatResponse_token_key"   ON "SupportCsatResponse"("token");
CREATE INDEX        "SupportCsatResponse_token_idx"   ON "SupportCsatResponse"("token");
ALTER TABLE "SupportCsatResponse"
    ADD CONSTRAINT "SupportCsatResponse_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "SupportIssue"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
