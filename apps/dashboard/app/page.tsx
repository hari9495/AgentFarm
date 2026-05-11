import { cookies } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import type { ReactElement } from 'react';
import { ApprovalQueuePanel } from './components/approval-queue-panel';
import { AgentMemoryPatternPanel } from './components/agent-memory-pattern-panel';
import { AgentQuestionPanel } from './components/agent-question-panel';
import { ConnectorConfigPanel } from './components/connector-config-panel';
import { EvidenceCompliancePanel } from './components/evidence-compliance-panel';
import { RuntimeObservabilityPanel } from './components/runtime-observability-panel';
import { LlmConfigPanel } from './components/llm-config-panel';
import { DashboardTabNav } from './components/dashboard-tab-nav';
import { DashboardMobileShell } from './components/dashboard-mobile-shell';
import { DashboardDeepLinkBar } from './components/dashboard-deep-link-bar';
import { DashboardWorkspaceSwitcher } from './components/dashboard-workspace-switcher';
import { MissionMiniNav } from './components/mission-mini-nav';
import { KpiAnimatedCounter } from './components/kpi-animated-counter';
import { MetricSparkline } from './components/metric-sparkline';
import { HealthRing } from './components/health-ring';
import { CommandPalette } from './components/command-palette';
import { WorkspaceBudgetPanel } from './components/workspace-budget-panel';
import { SkillMarketplacePanel } from './components/skill-marketplace-panel';
import { GovernanceKPIPanel } from './components/governance-kpis-panel';
import { OperationalSignalTimeline, type OperationalSignalTimelinePoint } from './components/operational-signal-timeline';
import AgentPerformancePanel from './components/agent-performance-panel';
import AgentControlPanel from './components/agent-control-panel';
import TaskRetryPanel from './components/task-retry-panel';
import type { DashboardTab } from './components/dashboard-navigation';
import type { WorkspaceBudgetSnapshot } from './components/workspace-budget-panel-utils';
import { isInternalSessionToken } from './lib/internal-session';

type TenantSummary = {
    tenant_id: string;
    tenant_name: string;
    plan_name: string;
    tenant_status: string;
    total_workspaces: number;
    active_bots: number;
    degraded_workspaces: number;
    pending_approvals: number;
    created_at: string;
};

type WorkspaceBotSummary = {
    workspace_id: string;
    tenant_id: string;
    workspace_name: string;
    role_type: string;
    bot_id: string;
    bot_name: string;
    bot_status: string;
    workspace_status: string;
    runtime_tier: string;
    last_heartbeat_at: string;
    provisioning_status: string;
    latest_incident_level: string;
};

type UsageSummary = {
    tenant_id: string;
    workspace_id: string;
    billing_period: string;
    action_count: number;
    approval_count: number;
    connector_error_count: number;
    runtime_restart_count: number;
    estimated_cost: number;
};

type ProvisioningStep = {
    step: string;
    status: 'completed' | 'active' | 'pending';
};

type ProvisioningStatus = {
    job_id: string;
    workspace_id: string;
    bot_id: string;
    job_status: string;
    current_step: string;
    started_at: string;
    completed_at: string | null;
    error_code: string | null;
    error_message: string | null;
    provisioning_latency_ms: number;
    sla_target_ms: number;
    sla_breached: boolean;
    stuck_alert_threshold_ms: number;
    is_stuck: boolean;
    timeout_at: string | null;
    step_history: ProvisioningStep[];
};

type ConnectorHealth = {
    connector_id: string;
    workspace_id: string;
    connector_type: string;
    status: string;
    permission_scope: string;
    last_healthcheck_at: string;
    last_error_code: string | null;
    last_error_message: string | null;
};

type ConnectorConfigType = 'jira' | 'teams' | 'github' | 'email' | 'custom_api';

type ConnectorConfigSummary = {
    connector_id: string;
    connector_type: ConnectorConfigType;
    status: string;
    scope_status: string | null;
    last_error_class: string | null;
    last_healthcheck_at: string | null;
    remediation: string;
};

type ApprovalItem = {
    approval_id: string;
    workspace_id: string;
    bot_id: string;
    task_id?: string;
    action_summary: string;
    change_summary?: string;
    impacted_scope?: string | null;
    risk_reason?: string | null;
    proposed_rollback?: string | null;
    lint_status?: string | null;
    test_status?: string | null;
    packet_complete?: boolean;
    risk_level: 'low' | 'medium' | 'high';
    decision_status: string;
    requested_at: string;
    decided_at: string | null;
    decision_reason: string | null;
};

type ApprovalMetrics = {
    pending_count: number;
    decision_count: number;
    p95_decision_latency_seconds: number | null;
};

type AgentQuestionItem = {
    id: string;
    tenantId: string;
    workspaceId: string;
    taskId: string;
    questionText: string;
    status: 'pending' | 'answered' | 'timed_out';
    askedAt: string;
    answeredAt: string | null;
    expiresAt: string;
    answer: string | null;
};

type LearnedPattern = {
    id: string;
    pattern: string;
    confidence: number;
    observedCount: number;
    lastSeen: string;
};

type AuditEvent = {
    event_id: string;
    tenant_id: string;
    workspace_id: string;
    bot_id: string;
    event_type: string;
    severity: string;
    summary: string;
    source_system: string;
    created_at: string;
    correlation_id: string;
};

type RuntimeLogEntry = {
    at: string;
    eventType: string;
    runtimeState: string;
    tenantId?: string | null;
    workspaceId?: string | null;
    botId?: string | null;
    correlationId?: string | null;
    details?: Record<string, unknown> | null;
};

type RuntimeStateTransition = {
    at: string;
    from: string;
    to: string;
    reason?: string | null;
};

type RuntimeTranscriptEntry = {
    taskId: string;
    startedAt: string;
    completedAt: string;
    actionType: string;
    riskLevel: 'low' | 'medium' | 'high';
    route: 'execute' | 'approval';
    status: 'success' | 'approval_required' | 'failed';
    durationMs: number;
    errorMessage: string | null;
    approvalRequired: boolean;
    approvalSummary: string | null;
    payloadOverrideSource?: 'none' | 'llm_generated' | 'executor_inferred';
    payloadOverridesApplied?: boolean;
};

type RuntimeInterviewEventEntry = {
    taskId: string;
    actionType: string;
    sessionId: string | null;
    roleTrack: string | null;
    turnIndex: number | null;
    interruptedSpeaking: boolean;
    followUpQuestion: string | null;
    finalRecommendation: string | null;
    sequence: number;
    event: 'partial' | 'final';
    text: string;
    startedAt: string;
    endedAt: string;
    source: 'payload' | 'payload_chunks' | 'live_capture';
    recordedAt: string;
};

type RuntimeHealthSnapshot = {
    status?: string;
    runtime_state?: string;
    heartbeat_loop_running?: boolean;
    heartbeat_sent?: number;
    heartbeat_failed?: number;
    last_heartbeat_at?: string | null;
    task_queue_depth?: number;
    processed_tasks?: number;
    succeeded_tasks?: number;
    failed_tasks?: number;
};

type RuntimeObservabilityData = {
    logs: RuntimeLogEntry[];
    transitions: RuntimeStateTransition[];
    transcripts: RuntimeTranscriptEntry[];
    interviewEvents: RuntimeInterviewEventEntry[];
    currentState: string;
    health: RuntimeHealthSnapshot;
    source: ApiSource;
};

type InternalLoginPolicySnapshot = {
    allowed_domains_count: number;
    admin_roles_count: number;
    deny_all_mode: boolean;
    source: ApiSource;
    fetched_at: string;
};

type DashboardTone = 'low' | 'warn' | 'high' | 'neutral';

type SparkTone = 'brand' | 'sky' | 'emerald' | 'amber' | 'violet';

type KpiCard = {
    label: string;
    value: string;
    trend: string;
    delta: string;
    deltaTone: DashboardTone;
    status: string;
    statusTone: DashboardTone;
    icon: ReactElement;
    sparkData: number[];
    sparkTone: SparkTone;
};

type HistoricalMetricSample = {
    at: string;
    signal_count: number;
};

type HistoricalMetricsSnapshot = {
    points: OperationalSignalTimelinePoint[];
    source: ApiSource;
};

const fallbackRuntimeHealth: RuntimeHealthSnapshot = {
    heartbeat_loop_running: false,
    heartbeat_sent: 0,
    heartbeat_failed: 0,
    last_heartbeat_at: null,
    task_queue_depth: 0,
    processed_tasks: 0,
    succeeded_tasks: 0,
    failed_tasks: 0,
};

const fallbackRuntimeObservability: RuntimeObservabilityData = {
    logs: [],
    transitions: [],
    transcripts: [],
    interviewEvents: [],
    currentState: 'unknown',
    health: fallbackRuntimeHealth,
    source: 'fallback',
};

const fallbackInternalLoginPolicy: InternalLoginPolicySnapshot = {
    allowed_domains_count: 0,
    admin_roles_count: 0,
    deny_all_mode: true,
    source: 'fallback',
    fetched_at: new Date(0).toISOString(),
};

const fallbackBudgetState: WorkspaceBudgetSnapshot = {
    workspaceId: 'ws_primary_001',
    dailySpent: 42,
    dailyLimit: 100,
    monthlySpent: 412,
    monthlyLimit: 1000,
    isHardStopActive: false,
    lastResetDaily: '2026-04-20T00:00:00Z',
};

const fallbackTenantSummary: TenantSummary = {
    tenant_id: 'tenant_acme_001',
    tenant_name: 'Acme Product Labs',
    plan_name: 'Growth',
    tenant_status: 'provisioning',
    total_workspaces: 1,
    active_bots: 0,
    degraded_workspaces: 0,
    pending_approvals: 2,
    created_at: '2026-04-20T09:05:11Z',
};

const fallbackWorkspaceBotSummaries: WorkspaceBotSummary[] = [
    {
        workspace_id: 'ws_primary_001',
        tenant_id: 'tenant_acme_001',
        workspace_name: 'Primary Workspace',
        role_type: 'Developer Agent',
        bot_id: 'bot_dev_001',
        bot_name: 'Developer Agent',
        bot_status: 'bootstrapping',
        workspace_status: 'provisioning',
        runtime_tier: 'dedicated_vm',
        last_heartbeat_at: '2026-04-20T09:11:09Z',
        provisioning_status: 'bootstrapping_vm',
        latest_incident_level: 'none',
    },
    {
        workspace_id: 'ws_release_002',
        tenant_id: 'tenant_acme_001',
        workspace_name: 'Release Workspace',
        role_type: 'Release Agent',
        bot_id: 'bot_release_002',
        bot_name: 'Release Agent',
        bot_status: 'active',
        workspace_status: 'active',
        runtime_tier: 'shared_vm',
        last_heartbeat_at: '2026-04-20T09:12:45Z',
        provisioning_status: 'completed',
        latest_incident_level: 'low',
    },
];

const fallbackUsageSummary: UsageSummary = {
    tenant_id: 'tenant_acme_001',
    workspace_id: 'ws_primary_001',
    billing_period: '2026-04',
    action_count: 42,
    approval_count: 6,
    connector_error_count: 1,
    runtime_restart_count: 0,
    estimated_cost: 39.8,
};

const fallbackProvisioning: ProvisioningStatus = {
    job_id: 'prov_001',
    workspace_id: 'ws_primary_001',
    bot_id: 'bot_dev_001',
    job_status: 'bootstrapping_vm',
    current_step: 'bootstrapping_vm',
    started_at: '2026-04-20T09:06:10Z',
    completed_at: null,
    error_code: null,
    error_message: null,
    provisioning_latency_ms: 6 * 60_000,
    sla_target_ms: 10 * 60_000,
    sla_breached: false,
    stuck_alert_threshold_ms: 60 * 60_000,
    is_stuck: false,
    timeout_at: '2026-04-21T09:06:10Z',
    step_history: [
        { step: 'queued', status: 'completed' },
        { step: 'validating', status: 'completed' },
        { step: 'creating_resources', status: 'completed' },
        { step: 'bootstrapping_vm', status: 'active' },
        { step: 'starting_container', status: 'pending' },
        { step: 'registering_runtime', status: 'pending' },
        { step: 'healthchecking', status: 'pending' },
        { step: 'completed', status: 'pending' },
    ],
};

const fallbackConnectors: ConnectorHealth[] = [
    {
        connector_id: 'con_jira_001',
        workspace_id: 'ws_primary_001',
        connector_type: 'jira',
        status: 'connected',
        permission_scope: 'project:read,issue:write',
        last_healthcheck_at: '2026-04-20T09:10:01Z',
        last_error_code: null,
        last_error_message: null,
    },
    {
        connector_id: 'con_github_001',
        workspace_id: 'ws_primary_001',
        connector_type: 'github',
        status: 'connected',
        permission_scope: 'repo:read,pull_request:write',
        last_healthcheck_at: '2026-04-20T09:10:02Z',
        last_error_code: null,
        last_error_message: null,
    },
    {
        connector_id: 'con_teams_001',
        workspace_id: 'ws_primary_001',
        connector_type: 'teams',
        status: 'degraded',
        permission_scope: 'channel:send,presence:read',
        last_healthcheck_at: '2026-04-20T09:10:03Z',
        last_error_code: 'TEAMS_TIMEOUT',
        last_error_message: 'Upstream timeout',
    },
    {
        connector_id: 'con_email_001',
        workspace_id: 'ws_primary_001',
        connector_type: 'company_email',
        status: 'token_expired',
        permission_scope: 'mail:send,mail:read',
        last_healthcheck_at: '2026-04-20T09:10:04Z',
        last_error_code: 'TOKEN_EXPIRED',
        last_error_message: 'Refresh token requires re-consent',
    },
];

const fallbackApprovals: ApprovalItem[] = [
    {
        approval_id: 'APR-1009',
        workspace_id: 'ws_primary_001',
        bot_id: 'bot_dev_001',
        action_summary: 'Merge release PR #221',
        change_summary: 'Merge release PR #221',
        impacted_scope: 'github:repo/main',
        risk_reason: 'Action merge_pr is high-risk by policy.',
        proposed_rollback: 'Re-open rollback branch and revert merge commit if release validation fails.',
        lint_status: 'passed',
        test_status: 'passed',
        packet_complete: true,
        risk_level: 'high',
        decision_status: 'pending',
        requested_at: '2026-04-20T09:11:39Z',
        decided_at: null,
        decision_reason: null,
    },
    {
        approval_id: 'APR-1010',
        workspace_id: 'ws_primary_001',
        bot_id: 'bot_dev_001',
        action_summary: 'Update Jira release ticket',
        change_summary: 'Update Jira release ticket',
        impacted_scope: 'jira:REL-221',
        risk_reason: 'Action update_status is medium-risk by policy.',
        proposed_rollback: 'Restore prior release ticket status and remove agent comment.',
        lint_status: 'not_run',
        test_status: 'not_run',
        packet_complete: true,
        risk_level: 'medium',
        decision_status: 'pending',
        requested_at: '2026-04-20T09:12:10Z',
        decided_at: null,
        decision_reason: null,
    },
    {
        approval_id: 'APR-1008',
        workspace_id: 'ws_primary_001',
        bot_id: 'bot_dev_001',
        action_summary: 'Notify release channel',
        change_summary: 'Notify release channel',
        impacted_scope: 'teams:release-room',
        risk_reason: 'Action send_message is low-risk and was auto-approved by policy.',
        proposed_rollback: 'Post follow-up clarification message if notification content is wrong.',
        lint_status: 'not_run',
        test_status: 'not_run',
        packet_complete: true,
        risk_level: 'low',
        decision_status: 'approved',
        requested_at: '2026-04-20T09:08:10Z',
        decided_at: '2026-04-20T09:08:11Z',
        decision_reason: 'Low-risk action auto-approved by policy',
    },
];

const fallbackActivity: AuditEvent[] = [
    {
        event_id: 'evt_001',
        tenant_id: 'tenant_acme_001',
        workspace_id: 'ws_primary_001',
        bot_id: 'bot_dev_001',
        event_type: 'provisioning.requested',
        severity: 'info',
        summary: 'Default workspace provisioning requested after signup',
        source_system: 'signup-service',
        created_at: '2026-04-20T09:05:11Z',
        correlation_id: 'corr_signup_001',
    },
    {
        event_id: 'evt_002',
        tenant_id: 'tenant_acme_001',
        workspace_id: 'ws_primary_001',
        bot_id: 'bot_dev_001',
        event_type: 'runtime.bootstrap.started',
        severity: 'info',
        summary: 'Runtime bootstrap started on isolated VM',
        source_system: 'provisioning-service',
        created_at: '2026-04-20T09:08:04Z',
        correlation_id: 'corr_prov_001',
    },
    {
        event_id: 'evt_003',
        tenant_id: 'tenant_acme_001',
        workspace_id: 'ws_primary_001',
        bot_id: 'bot_dev_001',
        event_type: 'approval.required',
        severity: 'warn',
        summary: 'High-risk merge action requires human approval',
        source_system: 'policy-engine',
        created_at: '2026-04-20T09:11:39Z',
        correlation_id: 'corr_approval_1009',
    },
];

type ApiSource = 'live' | 'fallback';

type ApiRequestContext = {
    apiBaseUrl: string;
    headers: HeadersInit;
};

const getApiRequestContext = async (): Promise<ApiRequestContext> => {
    const apiBaseUrl = process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

    // 1. Prefer real session cookie (set by /auth/login or /auth/signup)
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get('agentfarm_internal_session');
    if (sessionCookie?.value) {
        const token = decodeURIComponent(sessionCookie.value);
        if (!isInternalSessionToken(token)) {
            return { apiBaseUrl, headers: {} };
        }
        return {
            apiBaseUrl,
            headers: { Authorization: `Bearer ${token}` },
        };
    }

    // 2. Explicit env token (CI, integration tests)
    const explicitToken = process.env.DASHBOARD_API_TOKEN;
    if (explicitToken && isInternalSessionToken(explicitToken)) {
        return { apiBaseUrl, headers: { Authorization: `Bearer ${explicitToken}` } };
    }

    return { apiBaseUrl, headers: {} };
};

const getTenantSummary = async (context: ApiRequestContext): Promise<{
    summary: TenantSummary;
    workspaceSummaries: WorkspaceBotSummary[];
    usageSummary: UsageSummary;
    source: ApiSource;
}> => {
    try {
        const response = await fetch(`${context.apiBaseUrl}/v1/dashboard/summary`, {
            cache: 'no-store',
            headers: context.headers,
        });

        if (!response.ok) {
            return {
                summary: fallbackTenantSummary,
                workspaceSummaries: fallbackWorkspaceBotSummaries,
                usageSummary: fallbackUsageSummary,
                source: 'fallback',
            };
        }

        const data = (await response.json()) as {
            tenantSummary?: TenantSummary;
            workspaceBotSummaries?: WorkspaceBotSummary[];
            usageSummary?: UsageSummary;
        };
        if (!data.tenantSummary) {
            return {
                summary: fallbackTenantSummary,
                workspaceSummaries: fallbackWorkspaceBotSummaries,
                usageSummary: fallbackUsageSummary,
                source: 'fallback',
            };
        }

        return {
            summary: data.tenantSummary,
            workspaceSummaries: data.workspaceBotSummaries ?? fallbackWorkspaceBotSummaries,
            usageSummary: data.usageSummary ?? fallbackUsageSummary,
            source: 'live',
        };
    } catch {
        return {
            summary: fallbackTenantSummary,
            workspaceSummaries: fallbackWorkspaceBotSummaries,
            usageSummary: fallbackUsageSummary,
            source: 'fallback',
        };
    }
};

const getDashboardWorkspaceSlice = async (
    context: ApiRequestContext,
    workspaceId: string,
): Promise<{
    provisioning: ProvisioningStatus;
    connectors: ConnectorHealth[];
    pendingApprovals: ApprovalItem[];
    recentDecisions: ApprovalItem[];
    approvalMetrics: ApprovalMetrics;
    events: AuditEvent[];
    source: ApiSource;
}> => {
    try {
        const response = await fetch(`${context.apiBaseUrl}/v1/dashboard/workspace/${workspaceId}`, {
            cache: 'no-store',
            headers: context.headers,
        });

        if (!response.ok) {
            return {
                provisioning: fallbackProvisioning,
                connectors: fallbackConnectors,
                pendingApprovals: fallbackApprovals.filter((item) => item.decision_status === 'pending'),
                recentDecisions: fallbackApprovals.filter((item) => item.decision_status !== 'pending'),
                approvalMetrics: {
                    pending_count: fallbackApprovals.filter((item) => item.decision_status === 'pending').length,
                    decision_count: fallbackApprovals.filter((item) => item.decision_status !== 'pending').length,
                    p95_decision_latency_seconds: null,
                },
                events: fallbackActivity,
                source: 'fallback',
            };
        }

        const payload = (await response.json()) as {
            provisioning?: ProvisioningStatus;
            connectors?: ConnectorHealth[];
            pending_approvals?: ApprovalItem[];
            recent_decisions?: ApprovalItem[];
            approval_metrics?: ApprovalMetrics;
            events?: AuditEvent[];
        };

        const pendingApprovals = payload.pending_approvals ?? fallbackApprovals.filter((item) => item.decision_status === 'pending');
        const recentDecisions = payload.recent_decisions ?? fallbackApprovals.filter((item) => item.decision_status !== 'pending');

        return {
            provisioning: payload.provisioning ?? fallbackProvisioning,
            connectors: payload.connectors ?? fallbackConnectors,
            pendingApprovals,
            recentDecisions,
            approvalMetrics: payload.approval_metrics ?? {
                pending_count: pendingApprovals.length,
                decision_count: recentDecisions.length,
                p95_decision_latency_seconds: null,
            },
            events: payload.events ?? fallbackActivity,
            source: 'live',
        };
    } catch {
        return {
            provisioning: fallbackProvisioning,
            connectors: fallbackConnectors,
            pendingApprovals: fallbackApprovals.filter((item) => item.decision_status === 'pending'),
            recentDecisions: fallbackApprovals.filter((item) => item.decision_status !== 'pending'),
            approvalMetrics: {
                pending_count: fallbackApprovals.filter((item) => item.decision_status === 'pending').length,
                decision_count: fallbackApprovals.filter((item) => item.decision_status !== 'pending').length,
                p95_decision_latency_seconds: null,
            },
            events: fallbackActivity,
            source: 'fallback',
        };
    }
};


const getRuntimeObservabilityData = async (_botId: string): Promise<RuntimeObservabilityData> => {
    const runtimeBaseUrl = process.env.AGENT_RUNTIME_BASE_URL ?? 'http://localhost:8080';
    const runtimeToken = process.env.AGENT_RUNTIME_TOKEN;
    const headers: Record<string, string> = {};
    if (runtimeToken) {
        headers['Authorization'] = `Bearer ${runtimeToken}`;
    }

    try {
        const [logsRes, stateRes, healthRes, transcriptsRes, interviewEventsRes] = await Promise.all([
            fetch(`${runtimeBaseUrl}/logs?limit=50`, { headers, cache: 'no-store' }),
            fetch(`${runtimeBaseUrl}/state/history?limit=20`, { headers, cache: 'no-store' }),
            fetch(`${runtimeBaseUrl}/health/live`, { headers, cache: 'no-store' }),
            fetch(`${runtimeBaseUrl}/runtime/transcripts?limit=50`, { headers, cache: 'no-store' }),
            fetch(`${runtimeBaseUrl}/runtime/interview-events?limit=200`, { headers, cache: 'no-store' }),
        ]);

        if (!logsRes.ok || !stateRes.ok || !healthRes.ok || !transcriptsRes.ok || !interviewEventsRes.ok) {
            return { ...fallbackRuntimeObservability, source: 'fallback' };
        }

        const logsData = (await logsRes.json()) as { logs?: RuntimeLogEntry[] };
        const stateData = (await stateRes.json()) as { transitions?: RuntimeStateTransition[]; current_state?: string };
        const healthData = (await healthRes.json()) as RuntimeHealthSnapshot;
        const transcriptsData = (await transcriptsRes.json()) as { transcripts?: RuntimeTranscriptEntry[] };
        const interviewEventsData = (await interviewEventsRes.json()) as { events?: RuntimeInterviewEventEntry[] };

        return {
            logs: logsData.logs ?? [],
            transitions: stateData.transitions ?? [],
            transcripts: transcriptsData.transcripts ?? [],
            interviewEvents: interviewEventsData.events ?? [],
            currentState: stateData.current_state ?? 'unknown',
            health: healthData,
            source: 'live',
        };
    } catch {
        return { ...fallbackRuntimeObservability, source: 'fallback' };
    }
};

const getWorkspaceBudgetState = async (
    context: ApiRequestContext,
    workspaceId: string,
): Promise<{ budget: WorkspaceBudgetSnapshot; source: ApiSource }> => {
    try {
        const response = await fetch(`${context.apiBaseUrl}/v1/workspaces/${workspaceId}/budget/state`, {
            cache: 'no-store',
            headers: context.headers,
        });

        if (!response.ok) {
            return {
                budget: {
                    ...fallbackBudgetState,
                    workspaceId,
                },
                source: 'fallback',
            };
        }

        const payload = (await response.json()) as {
            workspaceId?: string;
            dailySpent?: number;
            dailyLimit?: number;
            monthlySpent?: number;
            monthlyLimit?: number;
            isHardStopActive?: boolean;
            lastResetDaily?: string;
        };

        return {
            budget: {
                workspaceId: payload.workspaceId ?? workspaceId,
                dailySpent: payload.dailySpent ?? 0,
                dailyLimit: payload.dailyLimit ?? fallbackBudgetState.dailyLimit,
                monthlySpent: payload.monthlySpent ?? 0,
                monthlyLimit: payload.monthlyLimit ?? fallbackBudgetState.monthlyLimit,
                isHardStopActive: payload.isHardStopActive ?? false,
                lastResetDaily: payload.lastResetDaily ?? fallbackBudgetState.lastResetDaily,
            },
            source: 'live',
        };
    } catch {
        return {
            budget: {
                ...fallbackBudgetState,
                workspaceId,
            },
            source: 'fallback',
        };
    }
};

const getInternalLoginPolicySnapshot = async (context: ApiRequestContext): Promise<InternalLoginPolicySnapshot> => {
    try {
        const response = await fetch(`${context.apiBaseUrl}/v1/auth/internal-login-policy`, {
            cache: 'no-store',
            headers: context.headers,
        });

        if (!response.ok) {
            return fallbackInternalLoginPolicy;
        }

        const payload = (await response.json()) as {
            policy?: {
                allowed_domains_count?: number;
                admin_roles_count?: number;
                deny_all_mode?: boolean;
            };
        };

        return {
            allowed_domains_count: payload.policy?.allowed_domains_count ?? 0,
            admin_roles_count: payload.policy?.admin_roles_count ?? 0,
            deny_all_mode: payload.policy?.deny_all_mode ?? true,
            source: 'live',
            fetched_at: new Date().toISOString(),
        };
    } catch {
        return fallbackInternalLoginPolicy;
    }
};

const getStatusBadgeClass = (status: string): string => {
    if (status === 'connected' || status === 'active' || status === 'ready') {
        return 'low';
    }

    if (status === 'degraded' || status === 'token_expired' || status === 'provisioning') {
        return 'warn';
    }

    return 'neutral';
};

const toConnectorConfigType = (value: string): ConnectorConfigType => {
    if (value === 'jira' || value === 'teams' || value === 'github' || value === 'email' || value === 'custom_api') {
        return value;
    }

    return 'custom_api';
};

const mapConnectorForConfig = (connector: ConnectorHealth): ConnectorConfigSummary => {
    const needsReauth =
        connector.status === 'degraded' || connector.status === 'token_expired' || connector.status === 'permission_invalid';

    return {
        connector_id: connector.connector_id,
        connector_type: toConnectorConfigType(connector.connector_type),
        status: connector.status,
        scope_status: null,
        last_error_class: connector.last_error_code,
        last_healthcheck_at: connector.last_healthcheck_at,
        remediation: needsReauth ? 're_auth_or_reconsent' : 'none',
    };
};

const normalizeTab = (tab: string | undefined): DashboardTab => {
    if (tab === 'approvals' || tab === 'observability' || tab === 'audit' || tab === 'marketplace') {
        return tab;
    }

    return 'overview';
};

const formatMinutes = (seconds: number | null | undefined): string => {
    if (!seconds || seconds <= 0) {
        return 'Auto';
    }

    return `${Math.ceil(seconds / 60)}m`;
};

const getWorkspaceHistoricalMetrics = async (
    context: ApiRequestContext,
    workspaceId: string,
): Promise<HistoricalMetricsSnapshot> => {
    try {
        const response = await fetch(
            `${context.apiBaseUrl}/v1/dashboard/workspace/${encodeURIComponent(workspaceId)}/historical-metrics?window=12h&bucket=1h`,
            {
                headers: context.headers,
                cache: 'no-store',
            },
        );

        if (!response.ok) {
            return { points: [], source: 'fallback' };
        }

        const payload = (await response.json()) as {
            points?: HistoricalMetricSample[];
            metrics?: HistoricalMetricSample[];
            timeline?: HistoricalMetricSample[];
        };

        const inputPoints = payload.points ?? payload.metrics ?? payload.timeline ?? [];
        const points = inputPoints
            .map((sample) => {
                const timestamp = new Date(sample.at).getTime();
                if (!Number.isFinite(timestamp)) {
                    return null;
                }

                return {
                    label: new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
                    value: Math.max(0, Math.round(Number(sample.signal_count) || 0)),
                    timestamp,
                };
            })
            .filter((point): point is OperationalSignalTimelinePoint => point !== null)
            .sort((left, right) => left.timestamp - right.timestamp);

        return { points, source: 'live' };
    } catch {
        return { points: [], source: 'fallback' };
    }
};

const getPendingAgentQuestions = async (
    context: ApiRequestContext,
    workspaceId: string,
    tenantId: string,
): Promise<AgentQuestionItem[]> => {
    try {
        const response = await fetch(
            `${context.apiBaseUrl}/api/v1/workspaces/${encodeURIComponent(workspaceId)}/questions/pending`,
            {
                headers: context.headers,
                cache: 'no-store',
            },
        );

        if (!response.ok) {
            return [];
        }

        const payload = (await response.json()) as {
            questions?: Array<{
                id: string;
                tenantId: string;
                workspaceId: string;
                taskId: string;
                question: string;
                status: 'pending' | 'answered' | 'timed_out';
                createdAt: string;
                answeredAt?: string;
                expiresAt: string;
                answer?: string;
            }>;
        };

        return Array.isArray(payload.questions)
            ? payload.questions.map((question) => ({
                id: question.id,
                tenantId: question.tenantId,
                workspaceId: question.workspaceId,
                taskId: question.taskId,
                questionText: question.question,
                status: question.status,
                askedAt: question.createdAt,
                answeredAt: question.answeredAt ?? null,
                expiresAt: question.expiresAt,
                answer: question.answer ?? null,
            }))
            : [];
    } catch {
        return [];
    }
};

const getDashboardLanguage = async (
    workspaceId: string,
    authHeader: string,
): Promise<{ tenantLanguage: string; workspaceLanguage: string | null }> => {
    const apiBaseUrl = process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';
    try {
        const [tenantRes, wsRes] = await Promise.all([
            fetch(`${apiBaseUrl}/v1/language/tenant`, {
                headers: { Authorization: authHeader },
                cache: 'no-store',
            }),
            fetch(`${apiBaseUrl}/v1/language/workspace/${encodeURIComponent(workspaceId)}`, {
                headers: { Authorization: authHeader },
                cache: 'no-store',
            }),
        ]);
        const tenantConfig = (await tenantRes.json().catch(() => null)) as { defaultLanguage?: string } | null;
        const wsConfig = (await wsRes.json().catch(() => null)) as { preferredLanguage?: string | null } | null;
        return {
            tenantLanguage: tenantConfig?.defaultLanguage ?? 'en',
            workspaceLanguage: wsConfig?.preferredLanguage ?? null,
        };
    } catch {
        return { tenantLanguage: 'en', workspaceLanguage: null };
    }
};

const getLearnedPatterns = async (
    context: ApiRequestContext,
    workspaceId: string,
): Promise<LearnedPattern[]> => {
    try {
        const response = await fetch(
            `${context.apiBaseUrl}/api/v1/workspaces/${encodeURIComponent(workspaceId)}/memory/patterns?minConfidence=0.55`,
            {
                headers: context.headers,
                cache: 'no-store',
            },
        );

        if (!response.ok) {
            return [];
        }

        const payload = (await response.json()) as {
            patterns?: Array<{
                id: string;
                pattern: string;
                confidence: number;
                observedCount: number;
                lastSeen: string;
            }>;
        };

        return Array.isArray(payload.patterns) ? payload.patterns : [];
    } catch {
        return [];
    }
};

export default async function HomePage({
    searchParams,
}: {
    searchParams?: Promise<{ tab?: string; workspaceId?: string; approvalId?: string; correlationId?: string; view?: string; density?: string; mode?: string }>;
}) {
    const resolvedSearchParams = searchParams ? await searchParams : {};
    const activeTab = normalizeTab(resolvedSearchParams.tab);
    const unifiedView = resolvedSearchParams.view === 'all';
    const compactMode = resolvedSearchParams.density === 'compact';
    const presentationMode = resolvedSearchParams.mode === 'present';
    const requestedWorkspaceId = resolvedSearchParams.workspaceId;
    const focusedApprovalId = resolvedSearchParams.approvalId;
    const focusedCorrelationId = resolvedSearchParams.correlationId;

    const context = await getApiRequestContext();

    // If no auth context, redirect to login
    const hasAuth =
        Object.keys(context.headers).length > 0 &&
        (context.headers as Record<string, string>)['Authorization'] !== undefined;

    if (!hasAuth && process.env.API_REQUIRE_AUTH === 'true') {
        redirect('/login');
    }
    const { summary, workspaceSummaries, usageSummary, source: summarySource } = await getTenantSummary(context);
    const workspace =
        workspaceSummaries.find((item) => item.workspace_id === requestedWorkspaceId) ??
        workspaceSummaries[0] ??
        fallbackWorkspaceBotSummaries[0];
    const workspaceOptions = workspaceSummaries.length > 0 ? workspaceSummaries : [workspace];

    const dashboardSlice = await getDashboardWorkspaceSlice(context, workspace.workspace_id);
    const workspaceBudget = await getWorkspaceBudgetState(context, workspace.workspace_id);
    const runtimeObs = await getRuntimeObservabilityData(workspace.bot_id);
    const internalPolicy = await getInternalLoginPolicySnapshot(context);
    const historicalMetrics = await getWorkspaceHistoricalMetrics(context, workspace.workspace_id);
    const pendingAgentQuestions = await getPendingAgentQuestions(context, workspace.workspace_id, workspace.tenant_id);
    const learnedPatterns = await getLearnedPatterns(context, workspace.workspace_id);
    const authHeaderStr = (context.headers as Record<string, string>)['Authorization'] ?? '';
    const dashboardLanguage = await getDashboardLanguage(workspace.workspace_id, authHeaderStr);

    const source = summarySource === 'live' && dashboardSlice.source === 'live' ? 'live' : 'fallback';

    const degradedWorkspaceCount = workspaceOptions.filter(
        (item) => item.workspace_status === 'degraded' || item.bot_status === 'degraded',
    ).length;
    const unhealthyConnectorCount = dashboardSlice.connectors.filter((connector) => getStatusBadgeClass(connector.status) !== 'low').length;
    const highSeverityAuditCount = dashboardSlice.events.filter((event) => event.severity === 'high' || event.severity === 'critical').length;
    const approvalP95Minutes = formatMinutes(dashboardSlice.approvalMetrics.p95_decision_latency_seconds);
    const runtimeFailedTasks = runtimeObs.health.failed_tasks ?? 0;
    const runtimeRestarts = usageSummary.runtime_restart_count;
    const provisioningLatencyLabel = `${Math.ceil(dashboardSlice.provisioning.provisioning_latency_ms / 60_000)}m / ${Math.ceil(dashboardSlice.provisioning.sla_target_ms / 60_000)}m`;
    const baseWorkspaceQuery = `workspaceId=${encodeURIComponent(workspace.workspace_id)}`;
    const tabbedHref = compactMode ? `/?${baseWorkspaceQuery}&tab=overview&density=compact` : `/?${baseWorkspaceQuery}&tab=overview`;
    const oneViewHref = compactMode ? `/?${baseWorkspaceQuery}&view=all&density=compact` : `/?${baseWorkspaceQuery}&view=all`;
    const compactToggleHref = compactMode
        ? `/?${baseWorkspaceQuery}${unifiedView ? '&view=all' : `&tab=${activeTab}`}`
        : `/?${baseWorkspaceQuery}${unifiedView ? '&view=all' : `&tab=${activeTab}`}&density=compact`;
    const presentationToggleHref = presentationMode
        ? `/?${baseWorkspaceQuery}&view=all`
        : `/?${baseWorkspaceQuery}&view=all&mode=present`;

    // Health ring percentages
    const systemHealthPct = Math.round(((summary.total_workspaces - degradedWorkspaceCount) / Math.max(summary.total_workspaces, 1)) * 100);
    const approvalHealthPct = dashboardSlice.approvalMetrics.p95_decision_latency_seconds === null || dashboardSlice.approvalMetrics.p95_decision_latency_seconds <= 900 ? 100 : Math.max(20, Math.round((900 / dashboardSlice.approvalMetrics.p95_decision_latency_seconds) * 100));
    const connectorHealthPct = Math.round(((dashboardSlice.connectors.length - unhealthyConnectorCount) / Math.max(dashboardSlice.connectors.length, 1)) * 100);
    const missionSections = [
        { id: 'dashboard-panel-overview', label: 'Overview' },
        { id: 'dashboard-panel-approvals', label: 'Approvals' },
        { id: 'dashboard-panel-observability', label: 'Observability' },
        { id: 'dashboard-panel-audit', label: 'Audit' },
        { id: 'dashboard-panel-marketplace', label: 'Marketplace' },
    ];

    const targetKpis: KpiCard[] = [
        {
            label: 'Active Workspaces',
            value: String(summary.total_workspaces),
            trend: `${summary.active_bots} bots active`,
            delta: degradedWorkspaceCount === 0 ? 'No degraded workspaces' : `${degradedWorkspaceCount} degraded`,
            deltaTone: degradedWorkspaceCount === 0 ? 'low' : 'warn',
            status: source === 'live' ? 'Live sync' : 'Fallback mode',
            statusTone: source === 'live' ? 'low' : 'warn',
            sparkData: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, summary.total_workspaces],
            sparkTone: 'brand' as SparkTone,
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="2" y="3" width="7" height="7" rx="1" /><rect x="15" y="3" width="7" height="7" rx="1" /><rect x="15" y="14" width="7" height="7" rx="1" /><rect x="2" y="14" width="7" height="7" rx="1" />
                </svg>
            ),
        },
        {
            label: 'Approval SLA (P95)',
            value: approvalP95Minutes,
            trend: `${dashboardSlice.pendingApprovals.length} approvals waiting`,
            delta: dashboardSlice.pendingApprovals.length === 0 ? 'Queue clear' : `+${dashboardSlice.pendingApprovals.length} pending`,
            deltaTone: dashboardSlice.pendingApprovals.length === 0 ? 'low' : 'warn',
            status:
                dashboardSlice.approvalMetrics.p95_decision_latency_seconds === null ||
                    dashboardSlice.approvalMetrics.p95_decision_latency_seconds <= 900
                    ? 'Within SLA'
                    : 'Needs attention',
            statusTone:
                dashboardSlice.approvalMetrics.p95_decision_latency_seconds === null ||
                    dashboardSlice.approvalMetrics.p95_decision_latency_seconds <= 900
                    ? 'low'
                    : 'warn',
            sparkData: [4, 5, 3, 4, 6, 3, 5, 4, 3, 5, 4, dashboardSlice.pendingApprovals.length + 2],
            sparkTone: 'sky' as SparkTone,
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
            ),
        },
        {
            label: 'Bot Runtime Status',
            value: workspace.bot_status === 'active' ? 'Healthy' : workspace.bot_status,
            trend: `${runtimeObs.health.heartbeat_sent ?? 0} heartbeats sent`,
            delta: runtimeFailedTasks === 0 ? 'No failed tasks' : `${runtimeFailedTasks} failed tasks`,
            deltaTone: runtimeFailedTasks === 0 ? 'low' : 'high',
            status: runtimeRestarts === 0 ? 'No restarts' : `${runtimeRestarts} restarts`,
            statusTone: runtimeRestarts === 0 ? 'low' : 'warn',
            sparkData: [6, 7, 7, 6, 7, 8, 7, 7, 6, 7, 8, runtimeObs.health.heartbeat_sent ?? 7],
            sparkTone: 'emerald' as SparkTone,
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><line x1="9" y1="1" x2="9" y2="4" /><line x1="15" y1="1" x2="15" y2="4" /><line x1="9" y1="20" x2="9" y2="23" /><line x1="15" y1="20" x2="15" y2="23" /><line x1="20" y1="9" x2="23" y2="9" /><line x1="20" y1="14" x2="23" y2="14" /><line x1="1" y1="9" x2="4" y2="9" /><line x1="1" y1="14" x2="4" y2="14" />
                </svg>
            ),
        },
        {
            label: 'Provisioning SLA',
            value: dashboardSlice.provisioning.sla_breached ? 'Breached' : 'Within target',
            trend: provisioningLatencyLabel,
            delta: dashboardSlice.provisioning.is_stuck
                ? 'Stuck alert active'
                : dashboardSlice.provisioning.current_step.replace(/_/g, ' '),
            deltaTone: dashboardSlice.provisioning.is_stuck ? 'high' : 'low',
            status: dashboardSlice.provisioning.job_status.replace(/_/g, ' '),
            statusTone:
                dashboardSlice.provisioning.job_status === 'completed'
                    ? 'low'
                    : dashboardSlice.provisioning.job_status === 'failed'
                        ? 'high'
                        : 'warn',
            sparkData: [9, 8, 8, 7, 7, 7, 6, 7, 6, 6, 6, 6],
            sparkTone: 'amber' as SparkTone,
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" /><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                </svg>
            ),
        },
        {
            label: 'Audit Coverage',
            value: dashboardSlice.events.length > 0 ? 'Tracked' : 'Pending',
            trend: `${dashboardSlice.events.length} recent events`,
            delta: highSeverityAuditCount === 0 ? 'No critical findings' : `${highSeverityAuditCount} high severity`,
            deltaTone: highSeverityAuditCount === 0 ? 'low' : 'high',
            status: internalPolicy.deny_all_mode ? 'Deny-all default' : 'Scoped access',
            statusTone: internalPolicy.deny_all_mode ? 'neutral' : 'low',
            sparkData: [2, 3, 3, 4, 3, 4, 4, 5, 4, 5, 5, dashboardSlice.events.length],
            sparkTone: 'violet' as SparkTone,
            icon: (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
                </svg>
            ),
        },
    ];

    return (
        <Suspense fallback={<div className="dashboard-loading-shell" aria-busy="true" />}>
            <DashboardMobileShell
                workspaceName={workspace.workspace_name}
                sidebar={(
                    <>
                        <p className="eyebrow">AgentFarm Internal</p>
                        <h2 className="dashboard-sidebar-title">Operations Console</h2>
                        <p className="sidebar-current-workspace">
                            Current workspace: <strong>{workspace.workspace_name}</strong>
                        </p>
                        <DashboardWorkspaceSwitcher
                            variant="sidebar"
                            activeWorkspaceId={workspace.workspace_id}
                            activeTab={activeTab}
                            workspaces={workspaceOptions.map((item) => ({
                                workspaceId: item.workspace_id,
                                workspaceName: item.workspace_name,
                            }))}
                            syncFromStorage
                        />
                        <Suspense fallback={null}>
                            <DashboardTabNav
                                activeTab={activeTab}
                                variant="sidebar"
                                syncFromStorage
                                workspaceId={workspace.workspace_id}
                                pendingQuestionCount={pendingAgentQuestions.length}
                            />
                        </Suspense>
                    </>
                )}
            >
                <div className={`mission-control ${unifiedView ? 'mission-control-all' : ''} ${compactMode ? 'mission-control-compact' : ''} ${presentationMode ? 'mission-control-present' : ''}`}>
                    <header className="topbar">
                        <div>
                            <p className="eyebrow topbar-eyebrow">
                                Company Dashboard
                            </p>
                            <h1 className="topbar-title">Internal Command Center</h1>
                        </div>
                        <div className="topbar-meta">
                            <DashboardWorkspaceSwitcher
                                variant="topbar"
                                activeWorkspaceId={workspace.workspace_id}
                                activeTab={activeTab}
                                workspaces={workspaceOptions.map((item) => ({
                                    workspaceId: item.workspace_id,
                                    workspaceName: item.workspace_name,
                                }))}
                                syncFromStorage
                            />
                            <span className={`badge ${source === 'live' ? 'low' : 'warn'}`}>
                                {source === 'live' ? 'Live Data' : 'Fallback Data'}
                            </span>
                            <span className={`badge ${unifiedView ? 'info' : 'neutral'}`}>
                                {unifiedView ? 'One View' : 'Tabbed View'}
                            </span>
                            <span className="badge neutral">{summary.tenant_name}</span>
                            <span className="badge neutral" title="Press Ctrl+K or ⌘K to open command palette">⌘K</span>
                        </div>
                    </header>

                    <Suspense fallback={null}>
                        <DashboardTabNav
                            activeTab={activeTab}
                            variant="top"
                            syncFromStorage
                            workspaceId={workspace.workspace_id}
                            pendingQuestionCount={pendingAgentQuestions.length}
                        />
                    </Suspense>
                    <Suspense fallback={null}>
                        <DashboardDeepLinkBar activeTab={activeTab} workspaceId={workspace.workspace_id} />
                    </Suspense>

                    <section className="card" data-chrome="view-mode" style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
                            View mode:
                        </p>
                        {unifiedView ? (
                            <Link
                                href={tabbedHref}
                                className="secondary-action"
                                style={{ textDecoration: 'none' }}
                            >
                                Switch to Tabbed View
                            </Link>
                        ) : (
                            <Link
                                href={oneViewHref}
                                className="secondary-action"
                                style={{ textDecoration: 'none' }}
                            >
                                Open One View (All Dashboards)
                            </Link>
                        )}
                        <Link href={compactToggleHref} className="secondary-action" style={{ textDecoration: 'none' }}>
                            {compactMode ? 'Use Comfortable Density' : 'Use Compact Density'}
                        </Link>
                        <Link href={presentationToggleHref} className="secondary-action" style={{ textDecoration: 'none' }}>
                            {presentationMode ? 'Exit Presentation' : 'Presentation Mode'}
                        </Link>
                    </section>

                    {unifiedView && <MissionMiniNav items={missionSections} />}

                    <section className="card" data-chrome="skill-catalog" style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
                            Internal skill catalog manager:
                        </p>
                        <Link
                            href={`/internal/skills?workspaceId=${encodeURIComponent(workspace.workspace_id)}&botId=${encodeURIComponent(workspace.bot_id)}`}
                            className="secondary-action"
                            style={{ textDecoration: 'none' }}
                        >
                            Open Internal Skill Manager
                        </Link>
                    </section>

                    <section className="card" data-chrome="platform-tools" style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--ink-soft)' }}>
                            Platform tools:
                        </p>
                        <Link href="/webhooks" className="secondary-action" style={{ textDecoration: 'none' }}>
                            Webhook Manager
                        </Link>
                        <Link href="/knowledge-graph" className="secondary-action" style={{ textDecoration: 'none' }}>
                            Knowledge Graph
                        </Link>
                        <Link href="/connector-marketplace" className="secondary-action" style={{ textDecoration: 'none' }}>
                            Connector Marketplace
                        </Link>
                        <Link href="/analytics" className="secondary-action" style={{ textDecoration: 'none' }}>
                            Analytics
                        </Link>
                    </section>

                    {(unifiedView || activeTab === 'overview') && (
                        <section id="dashboard-panel-overview" role="tabpanel" aria-labelledby="dashboard-tab-overview" className="dashboard-panel mission-section" style={{ '--stagger-index': '0' } as React.CSSProperties}>
                            {unifiedView && <p className="mission-section-label">Section 01 · Operations Overview</p>}
                            <header className="hero">
                                <p className="eyebrow">Overview</p>
                                <h1>Workspace Operations Summary</h1>
                                <p>
                                    Monitor provisioning progress, connector health, and runtime readiness from one operational view.
                                </p>
                            </header>

                            <div className="card health-rings-row">
                                <p className="eyebrow">System Health</p>
                                <HealthRing
                                    value={systemHealthPct}
                                    tone={systemHealthPct >= 80 ? 'ok' : systemHealthPct >= 50 ? 'warn' : 'danger'}
                                    label="Workspaces"
                                />
                                <HealthRing
                                    value={approvalHealthPct}
                                    tone={approvalHealthPct >= 80 ? 'ok' : approvalHealthPct >= 50 ? 'warn' : 'danger'}
                                    label="Approvals"
                                />
                                <HealthRing
                                    value={connectorHealthPct}
                                    tone={connectorHealthPct >= 80 ? 'ok' : connectorHealthPct >= 50 ? 'warn' : 'danger'}
                                    label="Connectors"
                                />
                            </div>

                            <section className="metric-row">
                                {targetKpis.map((kpi, i) => (
                                    <article key={kpi.label} className="card metric-card" style={{ '--card-index': String(i) } as React.CSSProperties}>
                                        <div className="metric-card-header">
                                            <span className="metric-card-icon">{kpi.icon}</span>
                                            <h2>{kpi.label}</h2>
                                        </div>
                                        <div className="metric-card-body">
                                            <KpiAnimatedCounter value={kpi.value} />
                                            <MetricSparkline data={kpi.sparkData} tone={kpi.sparkTone} />
                                            <p className="metric-trend">{kpi.trend}</p>
                                        </div>
                                        <div className="metric-card-footer">
                                            <span className={`metric-indicator ${kpi.deltaTone}`}>{kpi.delta}</span>
                                            <span className={`metric-indicator ${kpi.statusTone}`}>{kpi.status}</span>
                                        </div>
                                    </article>
                                ))}
                            </section>

                            <OperationalSignalTimeline points={historicalMetrics.points} source={historicalMetrics.source} />

                            <section className="grid-two">
                                <article className="card">
                                    <h2>Tenant Summary</h2>
                                    <ul className="kv-list">
                                        <li>
                                            <span>Tenant</span>
                                            <strong>{summary.tenant_name}</strong>
                                        </li>
                                        <li>
                                            <span>Plan</span>
                                            <strong>{summary.plan_name}</strong>
                                        </li>
                                        <li>
                                            <span>Tenant Status</span>
                                            <strong className="badge warn">{summary.tenant_status}</strong>
                                        </li>
                                        <li>
                                            <span>Pending Approvals</span>
                                            <strong>{summary.pending_approvals}</strong>
                                        </li>
                                        <li>
                                            <span>Total Workspaces</span>
                                            <strong>{summary.total_workspaces}</strong>
                                        </li>
                                        <li>
                                            <span>Estimated Monthly Cost</span>
                                            <strong>${usageSummary.estimated_cost.toFixed(1)}</strong>
                                        </li>
                                    </ul>
                                </article>

                                <article className="card">
                                    <h2>Workspace and Bot</h2>
                                    <ul className="kv-list">
                                        <li>
                                            <span>Workspace</span>
                                            <strong>{workspace.workspace_name}</strong>
                                        </li>
                                        <li>
                                            <span>Role</span>
                                            <strong>{workspace.role_type}</strong>
                                        </li>
                                        <li>
                                            <span>Workspace Status</span>
                                            <strong className={`badge ${getStatusBadgeClass(workspace.workspace_status)}`}>
                                                {workspace.workspace_status}
                                            </strong>
                                        </li>
                                        <li>
                                            <span>Bot Status</span>
                                            <strong className={`badge ${getStatusBadgeClass(workspace.bot_status)}`}>{workspace.bot_status}</strong>
                                        </li>
                                        <li>
                                            <span>Runtime Tier</span>
                                            <strong>{workspace.runtime_tier}</strong>
                                        </li>
                                        <li>
                                            <span>Latest Incident Level</span>
                                            <strong>{workspace.latest_incident_level}</strong>
                                        </li>
                                    </ul>
                                </article>
                            </section>

                            <WorkspaceBudgetPanel budget={workspaceBudget.budget} source={workspaceBudget.source} />

                            <section className="card">
                                <h2>Provisioning Progress</h2>
                                <p className="provisioning-job-meta">
                                    Job{' '}
                                    <code style={{ background: '#ece6dc', padding: '0.1rem 0.3rem', borderRadius: 4 }}>
                                        {dashboardSlice.provisioning.job_id ?? 'pending'}
                                    </code>{' '}
                                    — started{' '}
                                    {dashboardSlice.provisioning.started_at
                                        ? new Date(dashboardSlice.provisioning.started_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
                                        : 'not yet'}
                                </p>

                                <div className="provisioning-badge-row">
                                    <span className={`badge ${dashboardSlice.provisioning.sla_breached ? 'high' : 'low'}`}>
                                        latency {Math.ceil(dashboardSlice.provisioning.provisioning_latency_ms / 60_000)}m / target {Math.ceil(dashboardSlice.provisioning.sla_target_ms / 60_000)}m
                                    </span>
                                    <span className={`badge ${dashboardSlice.provisioning.is_stuck ? 'high' : 'neutral'}`}>
                                        stuck alert {Math.ceil(dashboardSlice.provisioning.stuck_alert_threshold_ms / 60_000)}m: {dashboardSlice.provisioning.is_stuck ? 'active' : 'clear'}
                                    </span>
                                    {dashboardSlice.provisioning.timeout_at && (
                                        <span className="badge warn">
                                            timeout at {new Date(dashboardSlice.provisioning.timeout_at).toLocaleString('en-US')}
                                        </span>
                                    )}
                                </div>

                                <div className="state-row provisioning-steps">
                                    {dashboardSlice.provisioning.step_history.length > 0
                                        ? dashboardSlice.provisioning.step_history.map((stage, i) => {
                                            const stateClass =
                                                stage.status === 'completed' ? 'done' : stage.status === 'active' ? 'active' : 'pending';
                                            return (
                                                <div key={stage.step} className={`state-pill ${stateClass}`}>
                                                    <span className="provisioning-step-index">{i + 1}.</span>
                                                    {stage.step.replace(/_/g, ' ')}
                                                </div>
                                            );
                                        })
                                        : (['queued', 'validating', 'creating_resources', 'bootstrapping_vm', 'starting_container', 'registering_runtime', 'healthchecking', 'completed'] as const).map(
                                            (step, i) => {
                                                const currentStep = dashboardSlice.provisioning.current_step;
                                                const orderedSteps = ['queued', 'validating', 'creating_resources', 'bootstrapping_vm', 'starting_container', 'registering_runtime', 'healthchecking', 'completed'];
                                                const currentIndex = orderedSteps.indexOf(currentStep);
                                                const stepIndex = orderedSteps.indexOf(step);
                                                const stateClass = stepIndex < currentIndex ? 'done' : stepIndex === currentIndex ? 'active' : 'pending';
                                                return (
                                                    <div key={step} className={`state-pill ${stateClass}`}>
                                                        <span className="provisioning-step-index">{i + 1}.</span>
                                                        {step.replace(/_/g, ' ')}
                                                    </div>
                                                );
                                            },
                                        )}
                                </div>

                                {['failed', 'cleanup_pending', 'cleaned_up'].includes(dashboardSlice.provisioning.job_status) && (
                                    <div className={`status-panel ${dashboardSlice.provisioning.job_status === 'cleaned_up' ? 'warning' : 'error'}`}>
                                        <p style={{ margin: '0 0 0.25rem', fontWeight: 700, color: dashboardSlice.provisioning.job_status === 'cleaned_up' ? '#92400e' : '#991b1b', fontSize: '0.88rem' }}>
                                            {dashboardSlice.provisioning.job_status === 'failed' && 'Provisioning failed'}
                                            {dashboardSlice.provisioning.job_status === 'cleanup_pending' && 'Provisioning failed — cleanup in progress'}
                                            {dashboardSlice.provisioning.job_status === 'cleaned_up' && 'Provisioning failed — resources cleaned up'}
                                        </p>
                                        {dashboardSlice.provisioning.error_code && (
                                            <p style={{ margin: '0 0 0.2rem', fontSize: '0.82rem', color: dashboardSlice.provisioning.job_status === 'cleaned_up' ? '#78350f' : '#7f1d1d' }}>
                                                Error: <code>{dashboardSlice.provisioning.error_code}</code>
                                            </p>
                                        )}
                                        {dashboardSlice.provisioning.error_message && (
                                            <p style={{ margin: 0, fontSize: '0.82rem', color: dashboardSlice.provisioning.job_status === 'cleaned_up' ? '#78350f' : '#7f1d1d' }}>
                                                Hint: {dashboardSlice.provisioning.error_message}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {dashboardSlice.provisioning.job_status === 'completed' && (
                                    <div className="status-panel success">
                                        Bot provisioned and ready.{' '}
                                        {dashboardSlice.provisioning.completed_at &&
                                            `Completed at ${new Date(dashboardSlice.provisioning.completed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}.`}
                                    </div>
                                )}
                            </section>

                            <section className="card">
                                <h2>Connector Health Snapshot</h2>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>Connector</th>
                                            <th>Status</th>
                                            <th>Last Error</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dashboardSlice.connectors.map((connector) => (
                                            <tr key={connector.connector_id}>
                                                <td>{connector.connector_type}</td>
                                                <td>
                                                    <span className={`badge ${getStatusBadgeClass(connector.status)}`}>{connector.status}</span>
                                                </td>
                                                <td>{connector.last_error_code ?? 'ok'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </section>

                            <ConnectorConfigPanel
                                workspaceId={workspace.workspace_id}
                                apiBase={context.apiBaseUrl}
                                initialConnectors={dashboardSlice.connectors.map(mapConnectorForConfig)}
                            />
                            <LlmConfigPanel workspaceId={workspace.workspace_id} />
                            <GovernanceKPIPanel
                                workspaceId={workspace.workspace_id}
                                language={dashboardLanguage.workspaceLanguage ?? dashboardLanguage.tenantLanguage}
                            />
                            <AgentPerformancePanel />
                            <AgentControlPanel botId={workspace.bot_id} />
                            <TaskRetryPanel botId={workspace.bot_id} />
                        </section>
                    )}

                    {(unifiedView || activeTab === 'approvals') && (
                        <section
                            id="dashboard-panel-approvals"
                            role="tabpanel"
                            aria-labelledby="dashboard-tab-approvals"
                            className="dashboard-panel mission-section"
                            aria-label="approval-command-center"
                            style={{ '--stagger-index': '1' } as React.CSSProperties}
                        >
                            {unifiedView && <p className="mission-section-label">Section 02 · Approval Command Center</p>}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.45rem' }}>
                                <span className={`badge ${pendingAgentQuestions.length > 0 ? 'warn' : 'low'}`}>
                                    {pendingAgentQuestions.length} pending question{pendingAgentQuestions.length === 1 ? '' : 's'}
                                </span>
                            </div>
                            <ApprovalQueuePanel
                                workspaceId={workspace.workspace_id}
                                initialPending={dashboardSlice.pendingApprovals}
                                initialRecent={dashboardSlice.recentDecisions}
                                focusedApprovalId={focusedApprovalId}
                                initialMetrics={dashboardSlice.approvalMetrics}
                            />
                            <AgentQuestionPanel
                                workspaceId={workspace.workspace_id}
                                tenantId={workspace.tenant_id}
                                initialQuestions={pendingAgentQuestions}
                            />
                            <AgentMemoryPatternPanel patterns={learnedPatterns} />
                        </section>
                    )}

                    {(unifiedView || activeTab === 'observability') && (
                        <section id="dashboard-panel-observability" role="tabpanel" aria-labelledby="dashboard-tab-observability" className="dashboard-panel mission-section" style={{ '--stagger-index': '2' } as React.CSSProperties}>
                            {unifiedView && <p className="mission-section-label">Section 03 · Runtime Observability</p>}
                            <RuntimeObservabilityPanel
                                botId={workspace.bot_id}
                                connectors={dashboardSlice.connectors}
                                internalPolicy={internalPolicy}
                                initialLogs={runtimeObs.logs}
                                initialTransitions={runtimeObs.transitions}
                                initialTranscripts={runtimeObs.transcripts}
                                initialInterviewEvents={runtimeObs.interviewEvents}
                                initialCurrentState={runtimeObs.currentState}
                                initialHealth={runtimeObs.health}
                            />
                            <ConnectorConfigPanel
                                workspaceId={workspace.workspace_id}
                                apiBase={context.apiBaseUrl}
                                initialConnectors={dashboardSlice.connectors.map(mapConnectorForConfig)}
                            />
                            <LlmConfigPanel workspaceId={workspace.workspace_id} />
                        </section>
                    )}

                    {(unifiedView || activeTab === 'audit') && (
                        <section id="dashboard-panel-audit" role="tabpanel" aria-labelledby="dashboard-tab-audit" className="dashboard-panel mission-section" style={{ '--stagger-index': '3' } as React.CSSProperties}>
                            {unifiedView && <p className="mission-section-label">Section 04 · Evidence and Compliance</p>}
                            <EvidenceCompliancePanel
                                workspaceId={workspace.workspace_id}
                                initialEvents={dashboardSlice.events}
                                focusedCorrelationId={focusedCorrelationId}
                            />
                        </section>
                    )}

                    {(unifiedView || activeTab === 'marketplace') && (
                        <section id="dashboard-panel-marketplace" role="tabpanel" aria-labelledby="dashboard-tab-marketplace" className="dashboard-panel mission-section" style={{ '--stagger-index': '4' } as React.CSSProperties}>
                            {unifiedView && <p className="mission-section-label">Section 05 · Skill Marketplace</p>}
                            <header className="hero">
                                <p className="eyebrow">Marketplace</p>
                                <h1>Skill Marketplace</h1>
                                <p>
                                    Install and manage skills for your agent bot. Entitlements control which skills are available to install.
                                </p>
                            </header>
                            <SkillMarketplacePanel workspaceId={workspace.workspace_id} botId={workspace.bot_id} />
                        </section>
                    )}
                </div>
                <CommandPalette
                    sections={missionSections}
                    workspaceId={workspace.workspace_id}
                    isUnifiedView={unifiedView}
                />
                {presentationMode && (
                    <Link href={presentationToggleHref} className="presentation-exit-btn">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" /><path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" /></svg>
                        Exit Presentation
                    </Link>
                )}
            </DashboardMobileShell>
        </Suspense>
    );
}