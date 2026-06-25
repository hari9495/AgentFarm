-- Phase 1: customer-configurable governance policy engine.
-- Adds versioned per-tenant GovernancePolicy (rules pushed to OPA) and
-- PolicyDocument storage (parsing/extraction lands in a later phase).

-- CreateEnum
CREATE TYPE "GovernancePolicyScope" AS ENUM ('tenant', 'workspace', 'role', 'agent');

-- CreateEnum
CREATE TYPE "GovernancePolicyStatus" AS ENUM ('draft', 'active', 'archived');

-- CreateEnum
CREATE TYPE "PolicyDocumentStatus" AS ENUM ('uploaded', 'parsed', 'failed');

-- CreateTable
CREATE TABLE "GovernancePolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scope" "GovernancePolicyScope" NOT NULL DEFAULT 'tenant',
    "scopeRef" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "GovernancePolicyStatus" NOT NULL DEFAULT 'draft',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "rulesJson" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GovernancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "PolicyDocumentStatus" NOT NULL DEFAULT 'uploaded',
    "extractedRulesJson" JSONB,
    "failureReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GovernancePolicy_tenantId_scope_scopeRef_version_key" ON "GovernancePolicy"("tenantId", "scope", "scopeRef", "version");

-- CreateIndex
CREATE INDEX "GovernancePolicy_tenantId_idx" ON "GovernancePolicy"("tenantId");

-- CreateIndex
CREATE INDEX "GovernancePolicy_tenantId_status_idx" ON "GovernancePolicy"("tenantId", "status");

-- CreateIndex
CREATE INDEX "GovernancePolicy_tenantId_scope_scopeRef_status_idx" ON "GovernancePolicy"("tenantId", "scope", "scopeRef", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDocument_tenantId_sha256_key" ON "PolicyDocument"("tenantId", "sha256");

-- CreateIndex
CREATE INDEX "PolicyDocument_tenantId_idx" ON "PolicyDocument"("tenantId");

-- CreateIndex
CREATE INDEX "PolicyDocument_tenantId_status_idx" ON "PolicyDocument"("tenantId", "status");
