-- Sprint 9: Semantic Memory / Company Knowledge RAG (2026-05-22)
-- Adds AgentKnowledgeBase table for tenant-scoped knowledge chunks with
-- pgvector cosine-similarity search.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "AgentKnowledgeBase" (
    id             TEXT          NOT NULL PRIMARY KEY,
    "tenantId"     TEXT          NOT NULL,
    "botId"        TEXT,
    content        TEXT          NOT NULL,
    "sourceUrl"    TEXT,
    "sourceType"   TEXT          NOT NULL,
    "embeddingModel" VARCHAR(64),
    embedding      vector(1536),
    "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "AgentKnowledgeBase_tenantId_idx" ON "AgentKnowledgeBase"("tenantId");
CREATE INDEX "AgentKnowledgeBase_botId_idx"    ON "AgentKnowledgeBase"("botId");

-- ivfflat index for fast ANN cosine search (requires 100+ rows before it is
-- used by the planner; falls back to exact scan on small tables automatically)
CREATE INDEX "AgentKnowledgeBase_embedding_ivfflat_idx"
    ON "AgentKnowledgeBase" USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
