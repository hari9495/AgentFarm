import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { ApprovalQueuePanel } from './components/approval-queue-panel';
import { EvidenceCompliancePanel } from './components/evidence-compliance-panel';

type Step = {
    title: string;
    check: string;
    expected: string;
};

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

type ApprovalItem = {
    approval_id: string;
    workspace_id: string;
    bot_id: string;
    task_id?: string;
    action_summary: string;
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

const manualSteps: Step[] = [
    {
        title: 'Step 1: Confirm tenant lifecycle status',
        check: 'Read the Tenant card and verify the status badge.',
        expected: 'Tenant status should move from pending to provisioning after signup handoff.',
    },
    {
        title: 'Step 2: Confirm provisioning pipeline visibility',
        check: 'Follow the provisioning stages timeline left to right.',
        expected: 'Current stage should be highlighted, and previous stages should be complete.',
    },
    {
        title: 'Step 3: Confirm bot readiness',
        check: 'Review bot status and connector readiness in the Workspace panel.',
        expected: 'Bot status should be created or bootstrapping until runtime is healthy.',
    },
    {
        title: 'Step 4: Confirm approval queue behavior',
        check: 'Inspect approval entries and their risk level tags.',
        expected: 'Medium and high risk actions should appear as pending approval.',
    },
    {
        title: 'Step 5: Confirm audit and evidence completeness',
        check: 'Read the Evidence feed to verify actor, action, timestamp, and reason fields.',
        expected: 'Every important action should have an auditable record entry.',
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
    const sessionCookie = cookieStore.get('agentfarm_session');
    if (sessionCookie?.value) {
        return {
            apiBaseUrl,
            headers: { Authorization: `Bearer ${decodeURIComponent(sessionCookie.value)}` },
        };
    }

    // 2. Explicit env token (CI, integration tests)
    const explicitToken = process.env.DASHBOARD_API_TOKEN;
    if (explicitToken) {
        return { apiBaseUrl, headers: { Authorization: `Bearer ${explicitToken}` } };
    }

    // 3. Dev-only session endpoint (development without a real login)
    try {
        const response = await fetch(`${apiBaseUrl}/v1/auth/dev-session`, { cache: 'no-store' });
        if (!response.ok) {
            return { apiBaseUrl, headers: {} };
        }
        const payload = (await response.json()) as { token?: string };
        if (!payload.token) {
            return { apiBaseUrl, headers: {} };
        }
        return { apiBaseUrl, headers: { Authorization: `Bearer ${payload.token}` } };
    } catch {
        return { apiBaseUrl, headers: {} };
    }
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

const getStatusBadgeClass = (status: string): string => {
    if (status === 'connected' || status === 'active' || status === 'ready') {
        return 'low';
    }

    if (status === 'degraded' || status === 'token_expired' || status === 'provisioning') {
        return 'warn';
    }

    return 'neutral';
};

export default async function HomePage() {
    const context = await getApiRequestContext();

    // If no auth context, redirect to login
    const hasAuth =
        Object.keys(context.headers).length > 0 &&
        (context.headers as Record<string, string>)['Authorization'] !== undefined;

    if (!hasAuth && process.env.API_REQUIRE_AUTH === 'true') {
        redirect('/login');
    }
    const { summary, workspaceSummaries, usageSummary, source: summarySource } = await getTenantSummary(context);
    const workspace = workspaceSummaries[0] ?? fallbackWorkspaceBotSummaries[0];

    const dashboardSlice = await getDashboardWorkspaceSlice(context, workspace.workspace_id);

    const source = summarySource === 'live' && dashboardSlice.source === 'live' ? 'live' : 'fallback';

    const targetKpis = [
        { label: 'Active Workspaces', value: String(summary.total_workspaces), trend: source === 'live' ? 'live' : 'fallback' },
        {
            label: 'Approval SLA (P95)',
            value: dashboardSlice.pendingApprovals.length === 0 ? 'Auto' : `${dashboardSlice.pendingApprovals.length} pending`,
            trend: 'approval queue visibility',
        },
        {
            label: 'Bot Task Success',
            value: workspace.bot_status === 'active' ? 'Healthy' : workspace.bot_status,
            trend: 'runtime contract aligned',
        },
        {
            label: 'Provisioning SLA',
            value: dashboardSlice.provisioning.sla_breached ? 'Breached' : 'Within target',
            trend: `${Math.ceil(dashboardSlice.provisioning.provisioning_latency_ms / 60_000)}m / ${Math.ceil(dashboardSlice.provisioning.sla_target_ms / 60_000)}m`,
        },
        {
            label: 'Evidence Completeness',
            value: dashboardSlice.events.length > 0 ? 'Tracked' : 'Pending',
            trend: 'audit feed wired',
        },
    ];

    return (
        <main className="page-shell">
            <header className="hero">
                <p className="eyebrow">AgentFarm MVP Manual Visualization</p>
                <h1>Operations Command Dashboard</h1>
                <p>
                    Validate provisioning, approval, and evidence workflows end-to-end with one operator-facing view.
                    This screen mirrors the MVP contract while exposing decision latency and remediation controls.
                </p>
            </header>

            <section className="grid-two">
                {targetKpis.map((kpi) => (
                    <article key={kpi.label} className="card">
                        <h2>{kpi.label}</h2>
                        <p style={{ fontSize: '1.8rem', margin: '0.2rem 0 0.3rem', fontWeight: 700 }}>{kpi.value}</p>
                        <p style={{ margin: 0, color: '#57534e' }}>{kpi.trend}</p>
                    </article>
                ))}
            </section>

            <section className="grid-two">
                <article className="card">
                    <h2>Tenant Summary</h2>
                    <p style={{ marginTop: '-0.25rem', marginBottom: '0.6rem', color: '#57534e', fontSize: '0.82rem' }}>
                        Data source:{' '}
                        <strong className={`badge ${source === 'live' ? 'low' : 'warn'}`}>
                            {source === 'live' ? 'all live API' : 'mixed with fallback'}
                        </strong>
                    </p>
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

            <section className="card">
                <h2>Provisioning Progress</h2>
                <p style={{ margin: '-0.5rem 0 0.8rem', fontSize: '0.82rem', color: '#57534e' }}>
                    Job{' '}
                    <code style={{ background: '#ece6dc', padding: '0.1rem 0.3rem', borderRadius: 4 }}>
                        {dashboardSlice.provisioning.job_id ?? 'pending'}
                    </code>{' '}
                    — started{' '}
                    {dashboardSlice.provisioning.started_at
                        ? new Date(dashboardSlice.provisioning.started_at).toLocaleTimeString()
                        : 'not yet'}
                </p>

                <div
                    style={{
                        display: 'flex',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                        marginBottom: '0.7rem',
                    }}
                >
                    <span className={`badge ${dashboardSlice.provisioning.sla_breached ? 'high' : 'low'}`}>
                        latency {Math.ceil(dashboardSlice.provisioning.provisioning_latency_ms / 60_000)}m / target {Math.ceil(dashboardSlice.provisioning.sla_target_ms / 60_000)}m
                    </span>
                    <span className={`badge ${dashboardSlice.provisioning.is_stuck ? 'high' : 'neutral'}`}>
                        stuck alert {Math.ceil(dashboardSlice.provisioning.stuck_alert_threshold_ms / 60_000)}m: {dashboardSlice.provisioning.is_stuck ? 'active' : 'clear'}
                    </span>
                    {dashboardSlice.provisioning.timeout_at && (
                        <span className="badge warn">
                            timeout at {new Date(dashboardSlice.provisioning.timeout_at).toLocaleString()}
                        </span>
                    )}
                </div>

                {/* Step pipeline */}
                <div className="state-row" style={{ marginBottom: '0.6rem' }}>
                    {dashboardSlice.provisioning.step_history.length > 0
                        ? dashboardSlice.provisioning.step_history.map((stage, i) => {
                            const stateClass =
                                stage.status === 'completed' ? 'done' : stage.status === 'active' ? 'active' : 'pending';
                            return (
                                <div key={stage.step} className={`state-pill ${stateClass}`}>
                                    <span style={{ opacity: 0.5, marginRight: '0.25rem', fontSize: '0.72rem' }}>{i + 1}.</span>
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
                                        <span style={{ opacity: 0.5, marginRight: '0.25rem', fontSize: '0.72rem' }}>{i + 1}.</span>
                                        {step.replace(/_/g, ' ')}
                                    </div>
                                );
                            },
                        )}
                </div>

                {/* Error / remediation hint */}
                {['failed', 'cleanup_pending', 'cleaned_up'].includes(dashboardSlice.provisioning.job_status) && (
                    <div
                        style={{
                            background: dashboardSlice.provisioning.job_status === 'cleaned_up' ? '#fef3c7' : '#fee2e2',
                            border: dashboardSlice.provisioning.job_status === 'cleaned_up' ? '1px solid #fcd34d' : '1px solid #fca5a5',
                            borderRadius: 8,
                            padding: '0.6rem 0.8rem',
                            marginTop: '0.4rem',
                        }}
                    >
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

                {/* Completed banner */}
                {dashboardSlice.provisioning.job_status === 'completed' && (
                    <div
                        style={{
                            background: '#dcfce7',
                            border: '1px solid #86efac',
                            borderRadius: 8,
                            padding: '0.5rem 0.8rem',
                            marginTop: '0.4rem',
                            color: '#166534',
                            fontSize: '0.88rem',
                            fontWeight: 700,
                        }}
                    >
                        Bot provisioned and ready.{' '}
                        {dashboardSlice.provisioning.completed_at &&
                            `Completed at ${new Date(dashboardSlice.provisioning.completed_at).toLocaleTimeString()}.`}
                    </div>
                )}
            </section>

            <section className="grid-two">
                <article className="card">
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
                </article>
                <section aria-label="approval-command-center">
                    <ApprovalQueuePanel
                        workspaceId={workspace.workspace_id}
                        initialPending={dashboardSlice.pendingApprovals}
                        initialRecent={dashboardSlice.recentDecisions}
                        initialMetrics={dashboardSlice.approvalMetrics}
                    />
                </section>
            </section>

            <section>
                <EvidenceCompliancePanel
                    workspaceId={workspace.workspace_id}
                    initialEvents={dashboardSlice.events}
                />
            </section>

            <section className="card">
                <h2>Manual Validation Steps</h2>
                <ol className="steps-list">
                    {manualSteps.map((step) => (
                        <li key={step.title}>
                            <h3>{step.title}</h3>
                            <p>
                                <span>Check:</span> {step.check}
                            </p>
                            <p>
                                <span>Expected:</span> {step.expected}
                            </p>
                        </li>
                    ))}
                </ol>
            </section>
        </main>
    );
}
