-- Add delegation fields to Approval
-- Allows any pending approval to be delegated to another team member,
-- with an optional expiry after which it should be re-escalated.

ALTER TABLE "Approval" ADD COLUMN "delegatedToUserId"   TEXT;
ALTER TABLE "Approval" ADD COLUMN "delegatedByUserId"   TEXT;
ALTER TABLE "Approval" ADD COLUMN "delegatedAt"          TIMESTAMP(3);
ALTER TABLE "Approval" ADD COLUMN "delegationExpiresAt"  TIMESTAMP(3);

CREATE INDEX "Approval_delegatedToUserId_idx" ON "Approval"("delegatedToUserId");
