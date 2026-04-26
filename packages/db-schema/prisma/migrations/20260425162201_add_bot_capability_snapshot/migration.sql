-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('pending', 'provisioning', 'ready', 'degraded', 'suspended', 'terminated');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('pending', 'provisioning', 'ready', 'degraded', 'suspended', 'failed');

-- CreateEnum
CREATE TYPE "BotStatus" AS ENUM ('created', 'bootstrapping', 'connector_setup_required', 'active', 'paused', 'failed');

-- CreateEnum
CREATE TYPE "ProvisioningJobStatus" AS ENUM ('queued', 'validating', 'creating_resources', 'bootstrapping_vm', 'starting_container', 'registering_runtime', 'healthchecking', 'completed', 'failed', 'cleanup_pending', 'cleaned_up');

-- CreateEnum
CREATE TYPE "RuntimeStatus" AS ENUM ('created', 'starting', 'ready', 'active', 'degraded', 'paused', 'stopping', 'stopped', 'failed');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('pending', 'approved', 'rejected', 'timeout_rejected');

-- CreateEnum
CREATE TYPE "ConnectorAuthStatus" AS ENUM ('not_configured', 'auth_initiated', 'consent_pending', 'token_received', 'validation_in_progress', 'connected', 'degraded', 'token_expired', 'permission_invalid', 'revoked', 'disconnected');

-- CreateEnum
CREATE TYPE "ConnectorScopeStatus" AS ENUM ('full', 'partial', 'insufficient');

-- CreateEnum
CREATE TYPE "ConnectorErrorClass" AS ENUM ('oauth_state_mismatch', 'oauth_code_exchange_failed', 'token_refresh_failed', 'token_expired', 'insufficient_scope', 'provider_rate_limited', 'provider_unavailable', 'secret_store_unavailable');

-- CreateEnum
CREATE TYPE "ConnectorActionType" AS ENUM ('read_task', 'create_comment', 'update_status', 'send_message', 'create_pr_comment', 'send_email');

-- CreateEnum
CREATE TYPE "ConnectorActionStatus" AS ENUM ('success', 'failed', 'timeout');

-- CreateEnum
CREATE TYPE "ConnectorActionErrorCode" AS ENUM ('rate_limit', 'timeout', 'provider_unavailable', 'permission_denied', 'invalid_format', 'unsupported_action', 'upgrade_required');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('provisioning_event', 'bot_runtime_event', 'connector_event', 'approval_event', 'security_event', 'audit_event');

-- CreateEnum
CREATE TYPE "AuditSeverity" AS ENUM ('info', 'warn', 'error', 'critical');

-- CreateEnum
CREATE TYPE "ActionStatus" AS ENUM ('pending', 'executing', 'completed', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantUser" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" "BotStatus" NOT NULL DEFAULT 'created',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvisioningJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "runtimeTier" TEXT NOT NULL,
    "roleType" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "triggerSource" TEXT NOT NULL,
    "status" "ProvisioningJobStatus" NOT NULL DEFAULT 'queued',
    "failureReason" TEXT,
    "remediationHint" TEXT,
    "cleanupResult" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvisioningJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuntimeInstance" (
    "id" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "RuntimeStatus" NOT NULL DEFAULT 'created',
    "contractVersion" TEXT NOT NULL,
    "endpoint" TEXT,
    "heartbeatAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuntimeInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "policyPackVersion" TEXT NOT NULL,
    "inputSummary" TEXT NOT NULL,
    "outputSummary" TEXT,
    "status" "ActionStatus" NOT NULL DEFAULT 'pending',
    "approvalId" TEXT,
    "connectorType" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ActionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "riskLevel" "RiskLevel" NOT NULL,
    "actionSummary" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "approverId" TEXT,
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'pending',
    "decisionReason" TEXT,
    "decisionLatencySeconds" INTEGER,
    "policyPackVersion" TEXT NOT NULL,
    "escalationTimeoutSeconds" INTEGER NOT NULL DEFAULT 3600,
    "escalatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "eventType" "AuditEventType" NOT NULL,
    "severity" "AuditSeverity" NOT NULL DEFAULT 'info',
    "summary" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorAuthMetadata" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "connectorType" TEXT NOT NULL,
    "authMode" TEXT NOT NULL,
    "status" "ConnectorAuthStatus" NOT NULL DEFAULT 'not_configured',
    "grantedScopes" TEXT[],
    "scopeStatus" "ConnectorScopeStatus",
    "secretRefId" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "lastRefreshAt" TIMESTAMP(3),
    "lastErrorClass" "ConnectorErrorClass",
    "lastHealthcheckAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorAuthMetadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorAuthSession" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "stateNonce" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectorAuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorAuthEvent" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "errorClass" "ConnectorErrorClass",
    "correlationId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorAuthEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectorAction" (
    "id" TEXT NOT NULL,
    "actionId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "connectorType" TEXT NOT NULL,
    "actionType" "ConnectorActionType" NOT NULL,
    "contractVersion" TEXT NOT NULL DEFAULT 'v1.0',
    "correlationId" TEXT NOT NULL,
    "requestBody" JSONB NOT NULL,
    "resultStatus" "ConnectorActionStatus" NOT NULL,
    "providerResponseCode" TEXT,
    "resultSummary" TEXT NOT NULL,
    "errorCode" "ConnectorActionErrorCode",
    "errorMessage" TEXT,
    "remediationHint" TEXT,
    "completedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConnectorAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantUser_email_key" ON "TenantUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Bot_workspaceId_key" ON "Bot"("workspaceId");

-- CreateIndex
CREATE INDEX "ProvisioningJob_tenantId_idx" ON "ProvisioningJob"("tenantId");

-- CreateIndex
CREATE INDEX "ProvisioningJob_workspaceId_idx" ON "ProvisioningJob"("workspaceId");

-- CreateIndex
CREATE INDEX "ProvisioningJob_correlationId_idx" ON "ProvisioningJob"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "RuntimeInstance_botId_key" ON "RuntimeInstance"("botId");

-- CreateIndex
CREATE INDEX "RuntimeInstance_tenantId_idx" ON "RuntimeInstance"("tenantId");

-- CreateIndex
CREATE INDEX "RuntimeInstance_workspaceId_idx" ON "RuntimeInstance"("workspaceId");

-- CreateIndex
CREATE INDEX "ActionRecord_tenantId_idx" ON "ActionRecord"("tenantId");

-- CreateIndex
CREATE INDEX "ActionRecord_botId_idx" ON "ActionRecord"("botId");

-- CreateIndex
CREATE INDEX "ActionRecord_correlationId_idx" ON "ActionRecord"("correlationId");

-- CreateIndex
CREATE INDEX "Approval_tenantId_idx" ON "Approval"("tenantId");

-- CreateIndex
CREATE INDEX "Approval_workspaceId_idx" ON "Approval"("workspaceId");

-- CreateIndex
CREATE INDEX "Approval_botId_idx" ON "Approval"("botId");

-- CreateIndex
CREATE INDEX "Approval_taskId_idx" ON "Approval"("taskId");

-- CreateIndex
CREATE INDEX "Approval_decision_idx" ON "Approval"("decision");

-- CreateIndex
CREATE INDEX "Approval_riskLevel_idx" ON "Approval"("riskLevel");

-- CreateIndex
CREATE INDEX "Approval_decisionLatencySeconds_idx" ON "Approval"("decisionLatencySeconds");

-- CreateIndex
CREATE INDEX "AuditEvent_tenantId_idx" ON "AuditEvent"("tenantId");

-- CreateIndex
CREATE INDEX "AuditEvent_botId_idx" ON "AuditEvent"("botId");

-- CreateIndex
CREATE INDEX "AuditEvent_correlationId_idx" ON "AuditEvent"("correlationId");

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorAuthMetadata_connectorId_key" ON "ConnectorAuthMetadata"("connectorId");

-- CreateIndex
CREATE INDEX "ConnectorAuthMetadata_tenantId_idx" ON "ConnectorAuthMetadata"("tenantId");

-- CreateIndex
CREATE INDEX "ConnectorAuthMetadata_workspaceId_idx" ON "ConnectorAuthMetadata"("workspaceId");

-- CreateIndex
CREATE INDEX "ConnectorAuthMetadata_status_idx" ON "ConnectorAuthMetadata"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorAuthSession_stateNonce_key" ON "ConnectorAuthSession"("stateNonce");

-- CreateIndex
CREATE INDEX "ConnectorAuthSession_connectorId_idx" ON "ConnectorAuthSession"("connectorId");

-- CreateIndex
CREATE INDEX "ConnectorAuthSession_tenantId_idx" ON "ConnectorAuthSession"("tenantId");

-- CreateIndex
CREATE INDEX "ConnectorAuthEvent_connectorId_idx" ON "ConnectorAuthEvent"("connectorId");

-- CreateIndex
CREATE INDEX "ConnectorAuthEvent_tenantId_idx" ON "ConnectorAuthEvent"("tenantId");

-- CreateIndex
CREATE INDEX "ConnectorAuthEvent_correlationId_idx" ON "ConnectorAuthEvent"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectorAction_actionId_key" ON "ConnectorAction"("actionId");

-- CreateIndex
CREATE INDEX "ConnectorAction_tenantId_idx" ON "ConnectorAction"("tenantId");

-- CreateIndex
CREATE INDEX "ConnectorAction_botId_idx" ON "ConnectorAction"("botId");

-- CreateIndex
CREATE INDEX "ConnectorAction_correlationId_idx" ON "ConnectorAction"("correlationId");

-- CreateIndex
CREATE INDEX "ConnectorAction_connectorType_idx" ON "ConnectorAction"("connectorType");

-- AddForeignKey
ALTER TABLE "TenantUser" ADD CONSTRAINT "TenantUser_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bot" ADD CONSTRAINT "Bot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
