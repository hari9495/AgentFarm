-- Add 'rejected' value to TaskExecutionOutcome enum
-- Distinguishes operator-rejected approval tasks from user-cancelled tasks

ALTER TYPE "TaskExecutionOutcome" ADD VALUE IF NOT EXISTS 'rejected';
