-- Phase 5: policy-document ingestion. Inline-store the converted markdown,
-- hold extracted candidate rules for human review, and track which
-- GovernancePolicy version the approved candidates were published into.

-- AlterTable
ALTER TABLE "PolicyDocument" ADD COLUMN "extractedText" TEXT;
ALTER TABLE "PolicyDocument" ADD COLUMN "appliedPolicyId" TEXT;
ALTER TABLE "PolicyDocument" ADD COLUMN "appliedAt" TIMESTAMP(3);
