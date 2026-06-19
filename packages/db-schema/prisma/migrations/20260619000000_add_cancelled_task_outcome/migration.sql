-- Add 'cancelled' to TaskExecutionOutcome so rejected approvals can be recorded
-- as a terminal task outcome (the customer portal Task History reads this enum).
ALTER TYPE "TaskExecutionOutcome" ADD VALUE IF NOT EXISTS 'cancelled';
