-- Tamper-evident hash chain for policy violations (per-tenant chain).

-- AlterTable
ALTER TABLE "PolicyViolation" ADD COLUMN "prevHash" TEXT;
ALTER TABLE "PolicyViolation" ADD COLUMN "hash" TEXT;
