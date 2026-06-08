-- CreateEnum
CREATE TYPE "SupportIssueSource" AS ENUM ('portal', 'operator');

-- AlterTable: SupportIssue — add discriminator for who raised the ticket
ALTER TABLE "SupportIssue" ADD COLUMN "source" "SupportIssueSource" NOT NULL DEFAULT 'operator';
