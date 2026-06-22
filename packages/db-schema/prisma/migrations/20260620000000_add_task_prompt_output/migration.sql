-- Add taskPrompt and outputSummary to TaskExecutionRecord so the customer
-- portal can show what the customer asked and what the agent produced.
ALTER TABLE "TaskExecutionRecord" ADD COLUMN IF NOT EXISTS "taskPrompt" TEXT;
ALTER TABLE "TaskExecutionRecord" ADD COLUMN IF NOT EXISTS "outputSummary" TEXT;
