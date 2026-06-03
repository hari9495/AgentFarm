-- Add TOTP-based MFA fields to TenantUser
-- totpSecret is stored AES-256-GCM encrypted (never plaintext).
-- totpEnabled gates the MFA check in the login flow.
-- totpVerifiedAt records when MFA was last successfully verified for audit.

ALTER TABLE "TenantUser" ADD COLUMN "totpSecret"     TEXT;
ALTER TABLE "TenantUser" ADD COLUMN "totpEnabled"    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "TenantUser" ADD COLUMN "totpVerifiedAt" TIMESTAMP(3);

CREATE INDEX "TenantUser_totpEnabled_idx" ON "TenantUser"("totpEnabled");
