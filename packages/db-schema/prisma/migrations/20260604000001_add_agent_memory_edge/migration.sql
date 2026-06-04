-- CreateTable: AgentMemoryEdge
-- FluxMem Phase 3 — heterogeneous graph over knowledge and lesson nodes
CREATE TABLE "AgentMemoryEdge" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fromId"      TEXT NOT NULL,
    "fromType"    TEXT NOT NULL,
    "toId"        TEXT NOT NULL,
    "toType"      TEXT NOT NULL,
    "edgeType"    TEXT NOT NULL,
    "agentPrefix" TEXT,
    "weight"      DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMemoryEdge_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one edge per (tenant, fromId, toId, edgeType)
CREATE UNIQUE INDEX "AgentMemoryEdge_tenantId_fromId_toId_edgeType_key"
    ON "AgentMemoryEdge"("tenantId", "fromId", "toId", "edgeType");

-- Lookup indexes
CREATE INDEX "AgentMemoryEdge_tenantId_workspaceId_idx"
    ON "AgentMemoryEdge"("tenantId", "workspaceId");

CREATE INDEX "AgentMemoryEdge_tenantId_fromId_fromType_idx"
    ON "AgentMemoryEdge"("tenantId", "fromId", "fromType");

CREATE INDEX "AgentMemoryEdge_tenantId_toId_toType_idx"
    ON "AgentMemoryEdge"("tenantId", "toId", "toType");
