-- CreateTable: TenantSsoConfig
CREATE TABLE "TenantSsoConfig" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "enabled"       BOOLEAN NOT NULL DEFAULT false,
    "provider"      TEXT NOT NULL DEFAULT 'saml',
    "entryPoint"    TEXT NOT NULL DEFAULT '',
    "issuer"        TEXT NOT NULL DEFAULT '',
    "cert"          TEXT NOT NULL DEFAULT '',
    "spEntityId"    TEXT NOT NULL DEFAULT '',
    "callbackUrl"   TEXT NOT NULL DEFAULT '',
    "signatureAlgo" TEXT NOT NULL DEFAULT 'sha256',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSsoConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantSsoConfig_tenantId_key" ON "TenantSsoConfig"("tenantId");
CREATE INDEX "TenantSsoConfig_tenantId_idx" ON "TenantSsoConfig"("tenantId");

ALTER TABLE "TenantSsoConfig"
    ADD CONSTRAINT "TenantSsoConfig_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Extend TenantUser for SSO-provisioned users
ALTER TABLE "TenantUser"
    ALTER COLUMN "passwordHash" DROP NOT NULL;

ALTER TABLE "TenantUser"
    ADD COLUMN IF NOT EXISTS "ssoProvider" TEXT,
    ADD COLUMN IF NOT EXISTS "ssoSubject"  TEXT;
