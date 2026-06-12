-- TaskQueueEntry.dependsOn / dependencyMet existed in schema.prisma but no
-- migration ever created them (local DBs were patched via `prisma db push`),
-- so freshly-migrated databases 500 on /v1/task-queue (P2022).
-- IF NOT EXISTS keeps this idempotent for databases already patched manually.
ALTER TABLE "TaskQueueEntry" ADD COLUMN IF NOT EXISTS "dependsOn" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "TaskQueueEntry" ADD COLUMN IF NOT EXISTS "dependencyMet" BOOLEAN NOT NULL DEFAULT true;
