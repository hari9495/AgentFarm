-- Sprint 4: pgvector Episodic Memory (2026-05-15)
-- Enables semantic similarity search on agent task memories.

-- Enable pgvector extension for vector similarity operators (<=>)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add episodic memory fields to AgentLongTermMemory
ALTER TABLE "AgentLongTermMemory"
  ADD COLUMN IF NOT EXISTS "botId"          TEXT,
  ADD COLUMN IF NOT EXISTS "summary"        TEXT,
  ADD COLUMN IF NOT EXISTS "embeddingModel" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS embedding        vector(1536);

-- Index: fast bot-scoped lookup
CREATE INDEX IF NOT EXISTS "AgentLongTermMemory_botId_idx"
  ON "AgentLongTermMemory" ("botId");

-- Index: ivfflat cosine similarity (lists=100 suits up to ~1M rows)
-- NOTE: this index requires at least one row with a non-NULL embedding.
-- Prisma does not manage this index; it is maintained here manually.
CREATE INDEX IF NOT EXISTS "AgentLongTermMemory_embedding_ivfflat_idx"
  ON "AgentLongTermMemory" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
