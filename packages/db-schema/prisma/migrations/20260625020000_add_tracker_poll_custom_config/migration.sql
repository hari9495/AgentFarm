-- C4.1: universal (generic REST) poll source — field-mapping config for any tracker.

-- AlterTable
ALTER TABLE "TrackerPollSource" ADD COLUMN "customConfig" JSONB;
