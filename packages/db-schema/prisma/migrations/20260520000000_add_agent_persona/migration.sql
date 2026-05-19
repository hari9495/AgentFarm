-- CreateTable: AgentPersona
-- One-to-one relationship with Bot. Stores agent identity for persona layer.

CREATE TABLE "AgentPersona" (
    "id"                  TEXT NOT NULL,
    "botId"               TEXT NOT NULL,
    "tenantId"            TEXT NOT NULL,
    "displayName"         VARCHAR(100) NOT NULL,
    "emailAddress"        VARCHAR(255) NOT NULL,
    "avatarUrl"           TEXT,
    "communicationStyle"  VARCHAR(50) NOT NULL DEFAULT 'professional',
    "disclosureStatement" TEXT NOT NULL DEFAULT 'This message was sent by an AI agent.',
    "language"            VARCHAR(10) NOT NULL DEFAULT 'en',
    "timezone"            VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "workingHours"        JSONB,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentPersona_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique bot, tenant lookup
CREATE UNIQUE INDEX "AgentPersona_botId_key" ON "AgentPersona"("botId");
CREATE INDEX "AgentPersona_tenantId_idx" ON "AgentPersona"("tenantId");

-- AddForeignKey: cascade delete when Bot is deleted
ALTER TABLE "AgentPersona" ADD CONSTRAINT "AgentPersona_botId_fkey"
    FOREIGN KEY ("botId") REFERENCES "Bot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
