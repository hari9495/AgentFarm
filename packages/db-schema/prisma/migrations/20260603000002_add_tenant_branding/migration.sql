-- Per-tenant white-label branding configuration.
-- Stores company name, logo URL, and primary accent color for the portal.

CREATE TABLE "TenantBranding" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "companyName" TEXT,
    "logoUrl"     TEXT,
    "primaryColor" TEXT,
    "portalTitle" TEXT,
    "faviconUrl"  TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantBranding_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantBranding_tenantId_key" ON "TenantBranding"("tenantId");
CREATE INDEX "TenantBranding_tenantId_idx"        ON "TenantBranding"("tenantId");

ALTER TABLE "TenantBranding"
    ADD CONSTRAINT "TenantBranding_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
