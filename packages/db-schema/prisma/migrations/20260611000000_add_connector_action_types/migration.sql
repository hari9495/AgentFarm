-- Add GitHub-specific connector action types that were missing from the enum.
ALTER TYPE "ConnectorActionType" ADD VALUE IF NOT EXISTS 'create_pr';
ALTER TYPE "ConnectorActionType" ADD VALUE IF NOT EXISTS 'merge_pr';
ALTER TYPE "ConnectorActionType" ADD VALUE IF NOT EXISTS 'list_prs';
