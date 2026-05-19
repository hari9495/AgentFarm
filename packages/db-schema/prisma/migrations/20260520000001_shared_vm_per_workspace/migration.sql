-- Shared VM per workspace: one VM hosts multiple bot containers to reduce infrastructure cost.
-- Each bot container gets a dedicated port on the shared VM; port is stored on Bot.containerPort.

CREATE TABLE IF NOT EXISTS "WorkspaceVm" (
    "id"                   TEXT         NOT NULL,
    "workspaceId"          TEXT         NOT NULL,
    "tenantId"             TEXT         NOT NULL,
    "vmName"               TEXT         NOT NULL,
    "vmResourceId"         TEXT         NOT NULL,
    "resourceGroup"        TEXT         NOT NULL,
    "privateIp"            TEXT         NOT NULL,
    "region"               TEXT         NOT NULL,
    "vmSize"               TEXT         NOT NULL DEFAULT 'Standard_B4ms',
    "status"               TEXT         NOT NULL DEFAULT 'running',
    "activeContainerCount" INTEGER      NOT NULL DEFAULT 0,
    "nextContainerPort"    INTEGER      NOT NULL DEFAULT 8081,
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceVm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceVm_workspaceId_key" ON "WorkspaceVm"("workspaceId");
CREATE INDEX IF NOT EXISTS "WorkspaceVm_tenantId_idx"           ON "WorkspaceVm"("tenantId");

-- Port assigned to this bot's container on the shared workspace VM (null until provisioned)
ALTER TABLE "Bot" ADD COLUMN IF NOT EXISTS "containerPort" INTEGER;
