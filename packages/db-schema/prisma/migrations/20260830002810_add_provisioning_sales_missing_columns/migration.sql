-- Additive columns that exist in schema.prisma but were missing from drifted
-- databases (P2022 at runtime on the dashboard provisioning/summary queries).
-- Idempotent so it is safe to apply on partially-drifted databases.
ALTER TABLE "ProvisioningJob" ADD COLUMN IF NOT EXISTS "metadata" TEXT;
ALTER TABLE "ProvisioningJob" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
ALTER TABLE "ProvisioningJob" ADD COLUMN IF NOT EXISTS "triggeredBy" TEXT;
ALTER TABLE "ProvisioningJob" ADD COLUMN IF NOT EXISTS "failedAt" TIMESTAMP(3);
ALTER TABLE "SalesAgentConfig" ADD COLUMN IF NOT EXISTS "bookingUrl" TEXT;
ALTER TABLE "SalesAgentConfig" ADD COLUMN IF NOT EXISTS "bookingWebhookSecret" TEXT;
