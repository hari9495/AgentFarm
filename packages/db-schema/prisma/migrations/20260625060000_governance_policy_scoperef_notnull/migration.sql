-- Fix: tenant-scoped policies have scopeRef = NULL, and Postgres treats NULLs as
-- distinct in a unique index, so the (tenantId, scope, scopeRef, version) unique
-- constraint never deduped tenant-wide policies. Make scopeRef NOT NULL with a ''
-- sentinel so the constraint works for every scope.

-- Backfill existing NULLs to the empty-string sentinel
UPDATE "GovernancePolicy" SET "scopeRef" = '' WHERE "scopeRef" IS NULL;

-- AlterTable
ALTER TABLE "GovernancePolicy" ALTER COLUMN "scopeRef" SET DEFAULT '';
ALTER TABLE "GovernancePolicy" ALTER COLUMN "scopeRef" SET NOT NULL;
