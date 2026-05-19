-- Sprint 7: Billing Metering — add platformFeeUsd to TaskExecutionRecord
-- This column records the AgentFarm per-task platform fee ($0.10 for successful tasks).
-- NULL for rows written before this migration (pre-Sprint 7 records).

ALTER TABLE "TaskExecutionRecord" ADD COLUMN "platformFeeUsd" DOUBLE PRECISION;
