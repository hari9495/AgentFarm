-- H2: org identity fields on AgentPersona (employeeId, department, managerId).

-- AlterTable
ALTER TABLE "AgentPersona" ADD COLUMN "employeeId" VARCHAR(64);
ALTER TABLE "AgentPersona" ADD COLUMN "department" VARCHAR(100);
ALTER TABLE "AgentPersona" ADD COLUMN "managerId" TEXT;

-- CreateIndex
CREATE INDEX "AgentPersona_managerId_idx" ON "AgentPersona"("managerId");
