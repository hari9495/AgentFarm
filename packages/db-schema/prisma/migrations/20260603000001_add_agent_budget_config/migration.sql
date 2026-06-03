-- Per-agent spending caps
-- Allows operators to set daily/monthly USD limits per bot independently
-- of the workspace-level budget policy.

CREATE TABLE "AgentBudgetConfig" (
    "id"              TEXT NOT NULL,
    "tenantId"        TEXT NOT NULL,
    "workspaceId"     TEXT NOT NULL,
    "botId"           TEXT NOT NULL,
    "dailyLimitUsd"   DOUBLE PRECISION,
    "monthlyLimitUsd" DOUBLE PRECISION,
    "enabled"         BOOLEAN NOT NULL DEFAULT TRUE,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentBudgetConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentBudgetConfig_botId_key"  ON "AgentBudgetConfig"("botId");
CREATE INDEX "AgentBudgetConfig_tenantId_idx"       ON "AgentBudgetConfig"("tenantId");
CREATE INDEX "AgentBudgetConfig_workspaceId_idx"    ON "AgentBudgetConfig"("workspaceId");
