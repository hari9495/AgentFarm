/**
 * route-registry.ts — single source of truth for route registration.
 *
 * Moving all registerXxx() calls out of main.ts means:
 *   - main.ts stays a ~60-line bootstrap with no routing knowledge
 *   - Adding or removing a domain route group is one change here
 *   - The registration order is explicit and documented
 *
 * Convention: registrations are grouped by domain, in the same order
 * they appear in the routes/ directory.
 */

import type { FastifyInstance } from 'fastify';
import type { SecretStore } from './lib/secret-store.js';
import { readSession } from './request-context.js';
import { buildSessionToken } from './lib/session-auth.js';
import { prisma } from './lib/db.js';
import { createEmbedFn } from '@agentfarm/memory-service';

// Auth
import { registerAuthRoutes } from './routes/auth/auth.js';
import { registerSsoRoutes } from './routes/auth/sso.js';
import { registerMfaRoutes } from './routes/auth/mfa.js';
import { registerPortalAuthRoutes } from './routes/auth/portal-auth.js';
import { registerRoleRoutes } from './routes/auth/roles.js';
import { registerInternalLoginPolicyRoutes } from './routes/auth/internal-login-policy.js';
import { registerTeamRoutes } from './routes/auth/team.js';
import { registerApiKeyRoutes } from './routes/auth/api-keys.js';

// Connectors
import { registerConnectorAuthRoutes } from './routes/connectors/connector-auth.js';
import { registerMcpRegistryRoutes } from './routes/connectors/mcp-registry.js';
import { registerConnectorActionRoutes } from './routes/connectors/connector-actions.js';
import { registerPluginLoadingRoutes } from './routes/connectors/plugin-loading.js';
import { registerWebhookRoutes } from './routes/connectors/webhooks.js';
import { registerConnectorHealthRoutes } from './routes/connectors/connector-health.js';
import { registerAdapterRegistryRoutes } from './routes/connectors/adapter-registry.js';
import { registerOutboundWebhookRoutes } from './routes/connectors/outbound-webhooks.js';
import { registerConnectorCapabilitiesRoutes } from './routes/connectors/connector-capabilities.js';

// Governance
import { registerApprovalRoutes } from './routes/governance/approvals.js';
import { registerAuditRoutes } from './routes/governance/audit.js';
import { registerBudgetPolicyRoutes } from './routes/governance/budget-policy.js';
import { registerGovernanceWorkflowRoutes } from './routes/governance/governance-workflows.js';
import { registerKillSwitchRoutes } from './routes/governance/kill-switches.js';
import { registerActivityRoutes } from './routes/governance/activity-events.js';
import { registerActivityFeedRoutes } from './routes/governance/activity-feed.js';
import { registerDisclosureRoutes } from './routes/governance/disclosure.js';
import { registerGovernanceKPIRoutes } from './routes/governance/governance-kpis.js';
import { registerRetentionPolicyRoutes } from './routes/governance/retention-policy.js';
import { registerCircuitBreakerRoutes } from './routes/governance/circuit-breakers.js';

// Memory
import { registerSnapshotRoutes } from './routes/memory/snapshots.js';
import { registerWorkMemoryRoutes } from './routes/memory/work-memory.js';
import { registerMemoryRoutes } from './routes/memory/memory.js';
import { registerKnowledgeBaseRoutes } from './routes/memory/knowledge-base.js';
import { registerEpisodicMemoryRoutes } from './routes/memory/episodic-memory.js';
import { registerKnowledgeGraphRoutes } from './routes/memory/knowledge-graph.js';

// Agents
import { registerAgentsRoutes } from './routes/agents/agents.js';
import { registerPersonaRoutes } from './routes/agents/personas.js';
import { registerAgentLifecycleRoutes } from './routes/agents/agent-lifecycle.js';
import { registerAgentControlRoutes } from './routes/agents/agent-control.js';
import { registerAgentDispatchRoutes } from './routes/agents/agent-dispatch.js';
import { registerAgentFeedbackRoutes } from './routes/agents/agent-feedback.js';
import { registerHandoffRoutes } from './routes/agents/handoffs.js';
import { registerQuestionRoutes } from './routes/agents/questions.js';
import { registerBotVersionRoutes } from './routes/agents/bot-versions.js';
import { registerAgentMessageRoutes } from './routes/agents/agent-messages.js';
import { registerAgentBudgetRoutes } from './routes/agents/agent-budget.js';
import { registerBatchDispatchRoutes } from './routes/agents/batch-dispatch.js';

// Runtime
import { registerRuntimeLlmConfigRoutes } from './routes/runtime/runtime-llm-config.js';
import { registerRuntimeTaskRoutes } from './routes/runtime/runtime-tasks.js';
import { registerSkillPipelineRoutes } from './routes/runtime/skill-pipelines.js';
import { registerSkillSchedulerRoutes } from './routes/runtime/skill-scheduler.js';
import { registerSkillCompositionRoutes } from './routes/runtime/skill-composition-execute.js';
import { registerAutonomousLoopRoutes } from './routes/runtime/autonomous-loops.js';
import { registerRoutineSchedulerRoutes } from './routes/runtime/routine-scheduler.js';
import { registerWakeRunRoutes } from './routes/runtime/wake-runs.js';
import { registerOrchestrationRoutes } from './routes/runtime/orchestration.js';
import { registerSseTaskRoutes } from './routes/runtime/sse-tasks.js';
import { registerTaskNotifyRoutes } from './routes/runtime/task-notify.js';
import { registerScheduleRoutes } from './routes/runtime/schedules.js';
import { registerTaskQueueRoutes } from './routes/runtime/task-queue.js';
import { registerTaskTemplateRoutes } from './routes/runtime/task-templates.js';

// Workspace
import { registerWorkspaceSessionRoutes } from './routes/workspace/workspace-session.js';
import { registerDesktopProfileRoutes } from './routes/workspace/desktop-profile.js';
import { registerIdeStateRoutes } from './routes/workspace/ide-state.js';
import { registerDesktopActionRoutes } from './routes/workspace/desktop-actions.js';
import { registerPrRoutes } from './routes/workspace/pull-requests.js';
import { registerCiFailureRoutes } from './routes/workspace/ci-failures.js';
import { registerReproPackRoutes } from './routes/workspace/repro-packs.js';
import { registerDesktopSessionsRoutes } from './routes/workspace/desktop-sessions.js';
import { registerDeliverableRoutes } from './routes/workspace/deliverables.js';

// Platform
import { registerLanguageRoutes } from './routes/platform/language.js';
import { registerBillingRoutes } from './routes/platform/billing.js';
import { registerAnalyticsRoutes } from './routes/platform/analytics.js';
import { registerNotificationRoutes } from './routes/platform/notifications.js';
import { registerObservabilityRoutes } from './routes/platform/observability.js';
import { registerChatRoutes } from './routes/platform/chat.js';
import { registerAbTestRoutes } from './routes/platform/ab-tests.js';
import { registerScheduledReportRoutes } from './routes/platform/scheduled-reports.js';
import { registerDashboardRoutes } from './routes/platform/dashboard.js';
import { registerTenantBrandingRoutes } from './routes/platform/tenant-branding.js';

// Sales
import { registerLeadRoutes } from './routes/sales/leads.js';
import { registerProspectsRoutes } from './routes/sales/prospects.js';
import { registerSalesConfigRoutes } from './routes/sales/sales-config.js';
import { registerOutreachRoutes } from './routes/sales/outreach.js';
import { registerDealsRoutes } from './routes/sales/deals.js';
import { registerBrowserTasksRoutes } from './routes/sales/browser-tasks.js';
import { registerKpiRoutes } from './routes/sales/kpi.js';
import { registerZohoSignWebhookRoutes } from './routes/sales/zoho-sign-webhook.js';
import { registerBookingWebhookRoutes } from './routes/sales/booking-webhook.js';
import { registerContractWebhookRoutes } from './routes/sales/contract-webhook.js';
import { registerCallsWebhookRoutes } from './routes/sales/calls-webhook.js';
import { registerNpsWebhookRoutes } from './routes/sales/nps-webhook.js';

// Admin
import { registerPortalDataRoutes } from './routes/admin/portal-data.js';
import { registerOnboardingConfigRoutes } from './routes/admin/onboarding-config.js';
import { registerEnvReconcilerRoutes } from './routes/admin/env-reconciler.js';
import { registerSetupWizardRoutes } from './routes/admin/setup-wizard.js';
import { registerAdminProvisionRoutes } from './routes/admin/admin-provision.js';
import { registerMarketplaceRoutes } from './routes/admin/marketplace.js';

// Meetings
import { registerMeetingRoutes } from './routes/meetings.js';

// Content & Comms
import { registerContentDraftRoutes } from './routes/content/drafts.js';
import { registerCommsDraftRoutes } from './routes/comms/drafts.js';

// Support
import { registerSupportIssueRoutes } from './routes/support/support-issue.js';
import { registerSupportChatSessionRoutes } from './routes/support/support-chat-session.js';
import { registerSupportVoiceSessionRoutes } from './routes/support/support-voice-session.js';

// Ops monitoring
import { registerOpsSlaRoutes } from './routes/ops/provisioning-sla.js';

// ---------------------------------------------------------------------------
// Embedding factory — shared across memory routes
// ---------------------------------------------------------------------------

const buildEmbedFn = () => {
    const endpoint = process.env['EPISODIC_EMBEDDING_ENDPOINT'] ?? '';
    const apiKey = process.env['EPISODIC_EMBEDDING_API_KEY'] ?? '';
    const deployment = process.env['EPISODIC_EMBEDDING_DEPLOYMENT'] ?? 'text-embedding-3-small';
    if (!endpoint || !apiKey) return null;
    return createEmbedFn({ endpoint, deployment, apiKey });
};

const embeddingDeployment = process.env['EPISODIC_EMBEDDING_DEPLOYMENT'] ?? 'text-embedding-3-small';

// ---------------------------------------------------------------------------
// Session getter — passed to routes that need it
// ---------------------------------------------------------------------------

const getSession = (request: { headers: Record<string, unknown> }) => readSession(request);

// ---------------------------------------------------------------------------
// Main registration function
// ---------------------------------------------------------------------------

export const registerAllRoutes = async (
    app: FastifyInstance,
    deps: { secretStore: SecretStore },
): Promise<void> => {
    const { secretStore } = deps;

    // Auth
    await registerAuthRoutes(app);
    await registerSsoRoutes(app, { getSession });
    await registerMfaRoutes(app, {
        getSession,
        sessionSecret: process.env['API_SESSION_SECRET'] ?? '',
        buildSessionToken: (payload) => buildSessionToken({ ...payload, scope: 'customer' }),
    });
    await registerPortalAuthRoutes(app);
    await registerPortalDataRoutes(app);
    await registerRoleRoutes(app, { getSession });
    await registerInternalLoginPolicyRoutes(app, { getSession });
    await registerTeamRoutes(app, { getSession });
    await registerApiKeyRoutes(app, { getSession, prisma: prisma as never });

    // Connectors
    await registerConnectorAuthRoutes(app, { getSession, secretStore });
    await registerMcpRegistryRoutes(app, { getSession });
    await registerConnectorActionRoutes(app, { getSession, secretStore });
    await registerPluginLoadingRoutes(app, {
        getSession,
        featureEnabled: process.env.FEATURE_EXTERNAL_PLUGIN_LOADING === 'true',
        trustedPublishers: [{ publisher: 'agentfarm-plugins', sourceRepoPrefix: 'https://github.com/agentfarm/' }],
    });
    registerWebhookRoutes(app, prisma, { getSession });
    registerConnectorHealthRoutes(app, { getSession });
    registerAdapterRegistryRoutes(app, { getSession });
    await registerOutboundWebhookRoutes(app, { getSession });
    await registerConnectorCapabilitiesRoutes(app, { getSession });

    // Governance
    await registerApprovalRoutes(app, { getSession });
    await registerAuditRoutes(app, { getSession });
    await registerBudgetPolicyRoutes(app, { getSession });
    await registerGovernanceWorkflowRoutes(app, { getSession });
    await registerKillSwitchRoutes(app, { getSession });
    await registerActivityRoutes(app, { getSession });
    await registerActivityFeedRoutes(app, { getSession });
    await registerDisclosureRoutes(app, { getSession });
    registerGovernanceKPIRoutes(app, { getSession });
    await registerRetentionPolicyRoutes(app, prisma, { getSession });
    await registerCircuitBreakerRoutes(app, { getSession });

    // Memory
    await registerSnapshotRoutes(app, { getSession });
    await registerWorkMemoryRoutes(app, { getSession });
    await registerMemoryRoutes(app, prisma, { getSession, embedFn: buildEmbedFn(), embeddingDeployment });
    await registerKnowledgeBaseRoutes(app, prisma, { getSession, embedFn: buildEmbedFn(), embeddingDeployment });
    await registerEpisodicMemoryRoutes(app, { getSession });
    registerKnowledgeGraphRoutes(app, { getSession });

    // Agents
    await registerAgentsRoutes(app, { getSession });
    await registerPersonaRoutes(app, { getSession });
    await registerAgentLifecycleRoutes(app, { getSession });
    await registerAgentControlRoutes(app, { getSession });
    await registerAgentDispatchRoutes(app, { getSession });
    registerAgentFeedbackRoutes(app, { getSession });
    await registerHandoffRoutes(app, { getSession });
    await registerQuestionRoutes(app, prisma, { getSession });
    await registerBotVersionRoutes(app, { getSession });
    registerAgentMessageRoutes(app, { getSession });
    await registerAgentBudgetRoutes(app, { getSession });
    await registerBatchDispatchRoutes(app, { getSession });

    // Runtime
    await registerRuntimeLlmConfigRoutes(app, { getSession, secretStore });
    await registerRuntimeTaskRoutes(app, { getSession, prisma });
    registerSkillPipelineRoutes(app, { getSession });
    registerSkillSchedulerRoutes(app, { getSession });
    registerSkillCompositionRoutes(app, { getSession });
    registerAutonomousLoopRoutes(app, { getSession });
    await registerRoutineSchedulerRoutes(app, { getSession });
    await registerWakeRunRoutes(app, { getSession });
    await registerOrchestrationRoutes(app, { getSession });
    await registerSseTaskRoutes(app, { getSession });
    await registerTaskNotifyRoutes(app, { getSession });
    await registerScheduleRoutes(app, { getSession });
    await registerTaskQueueRoutes(app, { getSession, prisma: prisma as never });
    await registerTaskTemplateRoutes(app, { getSession });

    // Workspace
    await registerWorkspaceSessionRoutes(app, { getSession });
    await registerDesktopProfileRoutes(app, { getSession });
    await registerIdeStateRoutes(app, { getSession });
    await registerDesktopActionRoutes(app, { getSession });
    await registerPrRoutes(app, { getSession, prisma });
    await registerCiFailureRoutes(app, { getSession, prisma });
    await registerReproPackRoutes(app, { getSession });
    await registerDesktopSessionsRoutes(app, { getSession });
    await registerDeliverableRoutes(app, { getSession });

    // Platform
    await registerLanguageRoutes(app, { getSession });
    await registerBillingRoutes(app, { getSession });
    await registerAnalyticsRoutes(app, { getSession });
    registerNotificationRoutes(app, { getSession });
    await registerObservabilityRoutes(app, { getSession });
    await registerChatRoutes(app, { getSession });
    await registerAbTestRoutes(app, { getSession });
    await registerScheduledReportRoutes(app, { getSession, prisma: prisma as never });
    await registerDashboardRoutes(app);
    await registerTenantBrandingRoutes(app, { getSession });

    // Sales
    registerLeadRoutes(app, { prisma, getSession });
    await registerProspectsRoutes(app, { getSession, prisma: prisma as never });
    await registerSalesConfigRoutes(app, { getSession, prisma: prisma as never });
    await registerOutreachRoutes(app, { getSession, prisma: prisma as never });
    await registerDealsRoutes(app, { getSession, prisma });
    await registerBrowserTasksRoutes(app, { getSession, prisma });
    await registerKpiRoutes(app, { getSession, prisma: prisma as never });
    await registerZohoSignWebhookRoutes(app);
    await registerBookingWebhookRoutes(app, { prisma });
    await registerContractWebhookRoutes(app, { prisma });
    await registerCallsWebhookRoutes(app, { prisma });
    await registerNpsWebhookRoutes(app, { prisma });

    // Admin
    await registerSetupWizardRoutes(app, { getSession });
    await registerAdminProvisionRoutes(app, { getSession });
    await registerEnvReconcilerRoutes(app, { getSession });
    await registerMarketplaceRoutes(app, { getSession });
    registerOnboardingConfigRoutes(app);

    // Meetings
    await registerMeetingRoutes(app, { getSession });

    // Content & Comms
    registerContentDraftRoutes(app, { getSession });
    registerCommsDraftRoutes(app, { getSession });

    // Support — also accept portal_session cookie for WS connections
    const getPortalSession = async (cookies: string) => {
        const { verifyPortalSession } = await import('./lib/portal-session.js');
        const item = cookies.split(';').map((v) => v.trim()).find((v) => v.startsWith('portal_session='));
        if (!item) return null;
        const token = decodeURIComponent(item.slice('portal_session='.length));
        const data = await verifyPortalSession(token, prisma);
        if (!data) return null;
        return { userId: data.accountId, tenantId: data.tenantId, workspaceIds: [], expiresAt: Date.now() + 3_600_000 };
    };
    await registerSupportIssueRoutes(app, { getSession });
    await registerSupportChatSessionRoutes(app, { getSession, getPortalSession });
    await registerSupportVoiceSessionRoutes(app, { getSession, getPortalSession });

    // Ops monitoring
    await registerOpsSlaRoutes(app);
};
