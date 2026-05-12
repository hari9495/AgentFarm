'use client';

import { useCallback, useEffect, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type TemplateStub = {
    template_id: string;
    template_name: string;
    policy_pack_version: string;
    stage_count: number;
};

type TemplateDetail = {
    id: string;
    templateName: string;
    policyPackVersion: string;
    tenantId: string;
    stages: Array<{
        stageId: string;
        stageName: string;
        minApprovers: number;
        escalationTimeoutSeconds: number;
    }>;
    routingRules: Array<{
        id: string;
        riskLevel?: string;
        actionTypePrefix?: string;
        approverIds: string[];
    }>;
    createdAt: string;
    updatedAt: string;
};

type WorkflowInstance = {
    id: string;
    templateId: string;
    actionSummary: string;
    riskLevel: string;
    status: string;
    currentStageId: string;
    assignedApproverIds: string[];
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
};

type GovernanceDiagnostics = {
    tenantId: string;
    workspaceId: string;
    generatedAt: string;
    workflowSlaSeconds: number;
    pendingWorkflows: number;
    overdueWorkflows: number;
    bottleneckStageId?: string;
    bottleneckStagePendingCount: number;
    avgStageLatencySeconds: number;
};

type StepForm = {
    stageName: string;
    minApprovers: number;
    escalationTimeoutSeconds: number;
};

type RoutingRuleForm = {
    riskLevel: '' | 'low' | 'medium' | 'high';
    actionTypePrefix: string;
    approverIds: string;
};

// ── Badge helpers ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    pending: { bg: '#fef9c3', color: '#854d0e' },
    in_review: { bg: '#dbeafe', color: '#1d4ed8' },
    approved: { bg: '#dcfce7', color: '#166534' },
    rejected: { bg: '#fee2e2', color: '#991b1b' },
    timed_out: { bg: '#f1f5f9', color: '#475569' },
};

const RISK_BADGE: Record<string, { bg: string; color: string }> = {
    low: { bg: '#dcfce7', color: '#166534' },
    medium: { bg: '#fef9c3', color: '#854d0e' },
    high: { bg: '#fee2e2', color: '#991b1b' },
};

function Pill({ label, style }: { label: string; style: { bg: string; color: string } }) {
    return (
        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: style.bg, color: style.color }}>
            {label}
        </span>
    );
}

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
    workspaceId: string;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkflowBuilderPanel({ workspaceId }: Props) {
    const [activeTab, setActiveTab] = useState<'templates' | 'active' | 'diagnostics'>('templates');

    // ── Templates tab state ────────────────────────────────────────────────
    const [templates, setTemplates] = useState<TemplateStub[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [templatesError, setTemplatesError] = useState<string | null>(null);
    const [showTemplateForm, setShowTemplateForm] = useState(false);
    const [templateName, setTemplateName] = useState('');
    const [policyPackVersion, setPolicyPackVersion] = useState('1.0.0');
    const [steps, setSteps] = useState<StepForm[]>([
        { stageName: 'Review', minApprovers: 1, escalationTimeoutSeconds: 300 },
    ]);
    const [routingRule, setRoutingRule] = useState<RoutingRuleForm>({
        riskLevel: 'medium',
        actionTypePrefix: '',
        approverIds: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

    // ── Active workflows tab state ─────────────────────────────────────────
    const [workflows, setWorkflows] = useState<WorkflowInstance[]>([]);
    const [workflowsLoading, setWorkflowsLoading] = useState(false);
    const [workflowsError, setWorkflowsError] = useState<string | null>(null);
    const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
    const [decisionForm, setDecisionForm] = useState({
        decision: 'approved' as 'approved' | 'rejected',
        reason_code: 'approved_with_controls' as string,
        reason_text: '',
        evidence_links: '',
    });
    const [decidingId, setDecidingId] = useState<string | null>(null);
    const [decisionError, setDecisionError] = useState<string | null>(null);
    const [decisionSuccess, setDecisionSuccess] = useState<string | null>(null);

    // ── Diagnostics tab state ──────────────────────────────────────────────
    const [diagnostics, setDiagnostics] = useState<GovernanceDiagnostics | null>(null);
    const [diagLoading, setDiagLoading] = useState(false);
    const [diagError, setDiagError] = useState<string | null>(null);

    // ── Data fetchers ────────────────────────────────────────────────────────

    const loadTemplates = useCallback(async () => {
        setTemplatesLoading(true);
        setTemplatesError(null);
        try {
            const res = await fetch('/api/governance/templates', { cache: 'no-store' });
            const data = (await res.json().catch(() => ({}))) as { templates?: TemplateDetail[]; error?: string; message?: string };
            if (!res.ok) {
                setTemplatesError(data.message ?? data.error ?? 'Failed to load templates.');
            } else {
                // Map full templates to stubs for the list
                const raw = data.templates ?? [];
                setTemplates(
                    raw.map((t) => ({
                        template_id: t.id,
                        template_name: t.templateName,
                        policy_pack_version: t.policyPackVersion,
                        stage_count: Array.isArray(t.stages) ? t.stages.length : 0,
                    })),
                );
            }
        } catch {
            setTemplatesError('Network error loading templates.');
        } finally {
            setTemplatesLoading(false);
        }
    }, []);

    const loadWorkflows = useCallback(async () => {
        setWorkflowsLoading(true);
        setWorkflowsError(null);
        try {
            const res = await fetch(`/api/governance/workflows?workspace_id=${encodeURIComponent(workspaceId)}`, { cache: 'no-store' });
            const data = (await res.json().catch(() => ({}))) as { workflows?: WorkflowInstance[]; error?: string; message?: string };
            if (!res.ok) {
                setWorkflowsError(data.message ?? data.error ?? 'Failed to load workflows.');
            } else {
                setWorkflows(data.workflows ?? []);
            }
        } catch {
            setWorkflowsError('Network error loading workflows.');
        } finally {
            setWorkflowsLoading(false);
        }
    }, [workspaceId]);

    const loadDiagnostics = useCallback(async () => {
        setDiagLoading(true);
        setDiagError(null);
        try {
            const res = await fetch(`/api/governance/diagnostics?workspace_id=${encodeURIComponent(workspaceId)}`, { cache: 'no-store' });
            const data = (await res.json().catch(() => ({}))) as GovernanceDiagnostics & { error?: string; message?: string };
            if (!res.ok) {
                setDiagError((data as { message?: string }).message ?? (data as { error?: string }).error ?? 'Failed to load diagnostics.');
            } else {
                setDiagnostics(data);
            }
        } catch {
            setDiagError('Network error loading diagnostics.');
        } finally {
            setDiagLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => {
        if (activeTab === 'templates') void loadTemplates();
        if (activeTab === 'active') void loadWorkflows();
        if (activeTab === 'diagnostics') void loadDiagnostics();
    }, [activeTab, loadTemplates, loadWorkflows, loadDiagnostics]);

    // ── Template form submit ──────────────────────────────────────────────

    const submitTemplate = async () => {
        if (!templateName.trim() || !policyPackVersion.trim()) {
            setSubmitError('Template name and policy pack version are required.');
            return;
        }
        if (steps.length === 0) {
            setSubmitError('At least one review stage is required.');
            return;
        }
        const approverIdsArr = routingRule.approverIds
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (approverIdsArr.length === 0) {
            setSubmitError('At least one approver ID is required in the routing rule.');
            return;
        }

        setSubmitting(true);
        setSubmitError(null);
        setSubmitSuccess(null);

        const payload = {
            template_name: templateName.trim(),
            policy_pack_version: policyPackVersion.trim(),
            workspace_id: workspaceId,
            stages: steps.map((s, i) => ({
                stage_id: `stage-${i + 1}`,
                stage_name: s.stageName,
                min_approvers: s.minApprovers,
                escalation_timeout_seconds: s.escalationTimeoutSeconds,
            })),
            routing_rules: [
                {
                    id: 'rule-1',
                    risk_level: routingRule.riskLevel || undefined,
                    action_type_prefix: routingRule.actionTypePrefix.trim() || undefined,
                    approver_ids: approverIdsArr,
                },
            ],
        };

        try {
            const res = await fetch('/api/governance/templates', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = (await res.json().catch(() => ({}))) as { template_id?: string; template_name?: string; message?: string; error?: string };
            if (!res.ok) {
                setSubmitError(data.message ?? data.error ?? 'Failed to create template.');
            } else {
                setSubmitSuccess(`Template "${data.template_name ?? templateName}" created.`);
                setTemplateName('');
                setPolicyPackVersion('1.0.0');
                setSteps([{ stageName: 'Review', minApprovers: 1, escalationTimeoutSeconds: 300 }]);
                setRoutingRule({ riskLevel: 'medium', actionTypePrefix: '', approverIds: '' });
                setShowTemplateForm(false);
                await loadTemplates();
            }
        } catch {
            setSubmitError('Network error creating template.');
        } finally {
            setSubmitting(false);
        }
    };

    // ── Decision submit ───────────────────────────────────────────────────

    const submitDecision = async (workflowId: string) => {
        if (!decisionForm.reason_text.trim() || !decisionForm.evidence_links.trim()) {
            setDecisionError('Reason text and at least one evidence link are required.');
            return;
        }
        setDecidingId(workflowId);
        setDecisionError(null);
        setDecisionSuccess(null);

        const payload = {
            decision: decisionForm.decision,
            reason_code: decisionForm.reason_code,
            reason_text: decisionForm.reason_text.trim(),
            evidence_links: decisionForm.evidence_links
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
        };

        try {
            const res = await fetch(`/api/governance/workflows/${encodeURIComponent(workflowId)}/decision`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = (await res.json().catch(() => ({}))) as { status?: string; message?: string; error?: string };
            if (!res.ok) {
                setDecisionError(data.message ?? data.error ?? 'Failed to submit decision.');
            } else {
                setDecisionSuccess(`Decision submitted. Workflow status: ${data.status ?? 'updated'}.`);
                setSelectedWorkflowId(null);
                setDecisionForm({ decision: 'approved', reason_code: 'approved_with_controls', reason_text: '', evidence_links: '' });
                await loadWorkflows();
            }
        } catch {
            setDecisionError('Network error submitting decision.');
        } finally {
            setDecidingId(null);
        }
    };

    // ── Shared styles ─────────────────────────────────────────────────────

    const TAB_STYLE = (active: boolean): React.CSSProperties => ({
        padding: '0.45rem 1rem',
        fontSize: '0.85rem',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        background: 'transparent',
        color: active ? 'var(--ink)' : 'var(--ink-muted)',
        outline: 'none',
    });

    const INPUT_STYLE: React.CSSProperties = {
        padding: '0.4rem 0.6rem',
        fontSize: '0.85rem',
        border: '1px solid var(--line)',
        borderRadius: 4,
        background: 'var(--bg)',
        color: 'var(--ink)',
    };

    const TH: React.CSSProperties = {
        padding: '0.5rem 0.75rem',
        color: 'var(--ink-muted)',
        fontWeight: 500,
        textAlign: 'left',
        fontSize: '0.78rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        borderBottom: '1px solid var(--line)',
        whiteSpace: 'nowrap',
    };

    const TD: React.CSSProperties = {
        padding: '0.55rem 0.75rem',
        fontSize: '0.85rem',
        borderBottom: '1px solid var(--line)',
        verticalAlign: 'middle',
    };

    // ── Render ────────────────────────────────────────────────────────────

    return (
        <section className="card" style={{ display: 'grid', gap: '0.85rem' }}>
            {/* Header */}
            <header>
                <h2 style={{ marginBottom: '0.4rem' }}>Workflow Builder</h2>
                <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.86rem' }}>
                    Create and manage approval workflow templates, monitor active workflows, and review governance diagnostics.
                </p>
            </header>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--line)', marginBottom: '0.25rem' }}>
                <button type="button" style={TAB_STYLE(activeTab === 'templates')} onClick={() => setActiveTab('templates')}>
                    Templates
                </button>
                <button type="button" style={TAB_STYLE(activeTab === 'active')} onClick={() => setActiveTab('active')}>
                    Active Workflows
                </button>
                <button type="button" style={TAB_STYLE(activeTab === 'diagnostics')} onClick={() => setActiveTab('diagnostics')}>
                    Diagnostics
                </button>
            </div>

            {/* ── Templates Tab ──────────────────────────────────────────── */}
            {activeTab === 'templates' && (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Workflow Templates</h3>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button type="button" className="secondary-action" onClick={() => void loadTemplates()}>Refresh</button>
                            <button
                                type="button"
                                className="primary-action"
                                onClick={() => { setShowTemplateForm((v) => !v); setSubmitError(null); setSubmitSuccess(null); }}
                            >
                                {showTemplateForm ? 'Cancel' : '+ New template'}
                            </button>
                        </div>
                    </div>

                    {submitSuccess && (
                        <p className="message-inline" style={{ borderColor: 'var(--ok-border)', background: 'var(--ok-bg)', color: 'var(--ok)' }}>
                            {submitSuccess}
                        </p>
                    )}
                    {submitError && <p className="message-inline">{submitError}</p>}

                    {/* New template form */}
                    {showTemplateForm && (
                        <div className="card" style={{ margin: 0, padding: '1rem', display: 'grid', gap: '0.75rem' }}>
                            <h4 style={{ margin: 0, fontSize: '0.9rem' }}>Template editor</h4>

                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <div style={{ display: 'grid', gap: '0.3rem', flex: '1 1 200px' }}>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        Template name *
                                    </label>
                                    <input
                                        type="text"
                                        value={templateName}
                                        onChange={(e) => setTemplateName(e.target.value)}
                                        placeholder="e.g. Standard code review"
                                        style={{ ...INPUT_STYLE }}
                                    />
                                </div>
                                <div style={{ display: 'grid', gap: '0.3rem', flex: '0 1 140px' }}>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        Policy version *
                                    </label>
                                    <input
                                        type="text"
                                        value={policyPackVersion}
                                        onChange={(e) => setPolicyPackVersion(e.target.value)}
                                        placeholder="1.0.0"
                                        style={{ ...INPUT_STYLE }}
                                    />
                                </div>
                            </div>

                            {/* Stages editor */}
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        Review stages
                                    </label>
                                    <button
                                        type="button"
                                        className="secondary-action"
                                        style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                                        onClick={() => setSteps((s) => [...s, { stageName: `Stage ${s.length + 1}`, minApprovers: 1, escalationTimeoutSeconds: 300 }])}
                                    >
                                        + Add stage
                                    </button>
                                </div>
                                {steps.map((step, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap', background: 'var(--surface)', padding: '0.6rem', borderRadius: 4, border: '1px solid var(--line)' }}>
                                        <div style={{ display: 'grid', gap: '0.2rem', flex: '1 1 140px' }}>
                                            <label style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>Stage name</label>
                                            <input
                                                type="text"
                                                value={step.stageName}
                                                onChange={(e) => setSteps((s) => s.map((r, idx) => idx === i ? { ...r, stageName: e.target.value } : r))}
                                                style={{ ...INPUT_STYLE, fontSize: '0.82rem' }}
                                            />
                                        </div>
                                        <div style={{ display: 'grid', gap: '0.2rem', flex: '0 1 100px' }}>
                                            <label style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>Min approvers</label>
                                            <input
                                                type="number"
                                                min={1}
                                                value={step.minApprovers}
                                                onChange={(e) => setSteps((s) => s.map((r, idx) => idx === i ? { ...r, minApprovers: Math.max(1, parseInt(e.target.value) || 1) } : r))}
                                                style={{ ...INPUT_STYLE, fontSize: '0.82rem' }}
                                            />
                                        </div>
                                        <div style={{ display: 'grid', gap: '0.2rem', flex: '0 1 130px' }}>
                                            <label style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>Timeout (sec)</label>
                                            <input
                                                type="number"
                                                min={60}
                                                value={step.escalationTimeoutSeconds}
                                                onChange={(e) => setSteps((s) => s.map((r, idx) => idx === i ? { ...r, escalationTimeoutSeconds: Math.max(60, parseInt(e.target.value) || 300) } : r))}
                                                style={{ ...INPUT_STYLE, fontSize: '0.82rem' }}
                                            />
                                        </div>
                                        {steps.length > 1 && (
                                            <button
                                                type="button"
                                                className="secondary-action"
                                                style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem', borderColor: '#dc2626', color: '#dc2626' }}
                                                onClick={() => setSteps((s) => s.filter((_, idx) => idx !== i))}
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Routing rule */}
                            <div style={{ display: 'grid', gap: '0.5rem' }}>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Routing rule
                                </label>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', background: 'var(--surface)', padding: '0.6rem', borderRadius: 4, border: '1px solid var(--line)' }}>
                                    <div style={{ display: 'grid', gap: '0.2rem', flex: '0 1 120px' }}>
                                        <label style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>Risk level</label>
                                        <select
                                            value={routingRule.riskLevel}
                                            onChange={(e) => setRoutingRule((r) => ({ ...r, riskLevel: e.target.value as RoutingRuleForm['riskLevel'] }))}
                                            style={{ ...INPUT_STYLE, fontSize: '0.82rem' }}
                                        >
                                            <option value="">Any</option>
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                        </select>
                                    </div>
                                    <div style={{ display: 'grid', gap: '0.2rem', flex: '1 1 160px' }}>
                                        <label style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>Action type prefix</label>
                                        <input
                                            type="text"
                                            value={routingRule.actionTypePrefix}
                                            onChange={(e) => setRoutingRule((r) => ({ ...r, actionTypePrefix: e.target.value }))}
                                            placeholder="e.g. deploy:"
                                            style={{ ...INPUT_STYLE, fontSize: '0.82rem' }}
                                        />
                                    </div>
                                    <div style={{ display: 'grid', gap: '0.2rem', flex: '2 1 200px' }}>
                                        <label style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>Approver IDs (comma-separated) *</label>
                                        <input
                                            type="text"
                                            value={routingRule.approverIds}
                                            onChange={(e) => setRoutingRule((r) => ({ ...r, approverIds: e.target.value }))}
                                            placeholder="user_1, user_2"
                                            style={{ ...INPUT_STYLE, fontSize: '0.82rem' }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button type="button" className="primary-action" disabled={submitting} onClick={() => void submitTemplate()}>
                                    {submitting ? 'Creating...' : 'Create template'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Templates table */}
                    {templatesError && <p className="message-inline">{templatesError}</p>}
                    {templatesLoading ? (
                        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading templates...</p>
                    ) : (
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={TH}>Template name</th>
                                        <th style={TH}>Policy version</th>
                                        <th style={TH}>Stages</th>
                                        <th style={TH}>ID</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {templates.map((t) => (
                                        <tr key={t.template_id}>
                                            <td style={TD}>{t.template_name}</td>
                                            <td style={TD}><code style={{ fontSize: '0.8rem' }}>{t.policy_pack_version}</code></td>
                                            <td style={TD}>{t.stage_count}</td>
                                            <td style={{ ...TD, fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{t.template_id}</td>
                                        </tr>
                                    ))}
                                    {templates.length === 0 && (
                                        <tr>
                                            <td colSpan={4} style={{ ...TD, color: 'var(--ink-soft)', textAlign: 'center' }}>
                                                No templates yet. Create your first template above.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ── Active Workflows Tab ──────────────────────────────────── */}
            {activeTab === 'active' && (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Active Workflows</h3>
                        <button type="button" className="secondary-action" onClick={() => void loadWorkflows()}>Refresh</button>
                    </div>

                    {decisionSuccess && (
                        <p className="message-inline" style={{ borderColor: 'var(--ok-border)', background: 'var(--ok-bg)', color: 'var(--ok)' }}>
                            {decisionSuccess}
                        </p>
                    )}
                    {decisionError && <p className="message-inline">{decisionError}</p>}
                    {workflowsError && <p className="message-inline">{workflowsError}</p>}

                    {workflowsLoading ? (
                        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading workflows...</p>
                    ) : (
                        <div style={{ display: 'grid', gap: '0.7rem' }}>
                            {workflows.map((wf) => {
                                const statusStyle = STATUS_BADGE[wf.status] ?? { bg: 'var(--line)', color: 'var(--ink-muted)' };
                                const riskStyle = RISK_BADGE[wf.riskLevel] ?? { bg: 'var(--line)', color: 'var(--ink-muted)' };
                                const isSelected = selectedWorkflowId === wf.id;
                                const isActive = wf.status === 'pending' || wf.status === 'in_review';

                                return (
                                    <article key={wf.id} className="card" style={{ margin: 0, padding: '0.8rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', alignItems: 'flex-start' }}>
                                            <div style={{ display: 'grid', gap: '0.35rem', flex: 1 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <Pill label={wf.status} style={statusStyle} />
                                                    <Pill label={wf.riskLevel} style={riskStyle} />
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                                                        Stage: {wf.currentStageId}
                                                    </span>
                                                </div>
                                                <p style={{ margin: 0, fontSize: '0.85rem' }}>{wf.actionSummary}</p>
                                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                                                    Created {new Date(wf.createdAt).toLocaleString()}
                                                    {wf.completedAt ? ` · Completed ${new Date(wf.completedAt).toLocaleString()}` : ''}
                                                </p>
                                            </div>
                                            {isActive && (
                                                <button
                                                    type="button"
                                                    className="secondary-action"
                                                    style={{ fontSize: '0.78rem', flexShrink: 0 }}
                                                    onClick={() => {
                                                        setSelectedWorkflowId(isSelected ? null : wf.id);
                                                        setDecisionError(null);
                                                        setDecisionSuccess(null);
                                                    }}
                                                >
                                                    {isSelected ? 'Cancel' : 'Decide'}
                                                </button>
                                            )}
                                        </div>

                                        {/* Decision form inline */}
                                        {isSelected && (
                                            <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--line)', paddingTop: '0.75rem', display: 'grid', gap: '0.6rem' }}>
                                                <h4 style={{ margin: 0, fontSize: '0.85rem' }}>Submit decision</h4>
                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <div style={{ display: 'grid', gap: '0.2rem', flex: '0 1 120px' }}>
                                                        <label style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>Decision</label>
                                                        <select
                                                            value={decisionForm.decision}
                                                            onChange={(e) => setDecisionForm((f) => ({ ...f, decision: e.target.value as 'approved' | 'rejected' }))}
                                                            style={{ ...INPUT_STYLE, fontSize: '0.82rem' }}
                                                        >
                                                            <option value="approved">Approved</option>
                                                            <option value="rejected">Rejected</option>
                                                        </select>
                                                    </div>
                                                    <div style={{ display: 'grid', gap: '0.2rem', flex: '1 1 180px' }}>
                                                        <label style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>Reason code</label>
                                                        <select
                                                            value={decisionForm.reason_code}
                                                            onChange={(e) => setDecisionForm((f) => ({ ...f, reason_code: e.target.value }))}
                                                            style={{ ...INPUT_STYLE, fontSize: '0.82rem' }}
                                                        >
                                                            <option value="approved_with_controls">approved_with_controls</option>
                                                            <option value="manual_override">manual_override</option>
                                                            <option value="policy_violation">policy_violation</option>
                                                            <option value="insufficient_evidence">insufficient_evidence</option>
                                                            <option value="risk_threshold_exceeded">risk_threshold_exceeded</option>
                                                            <option value="sla_timeout">sla_timeout</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'grid', gap: '0.2rem' }}>
                                                    <label style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>Reason text *</label>
                                                    <input
                                                        type="text"
                                                        value={decisionForm.reason_text}
                                                        onChange={(e) => setDecisionForm((f) => ({ ...f, reason_text: e.target.value }))}
                                                        placeholder="Describe your decision"
                                                        style={{ ...INPUT_STYLE }}
                                                    />
                                                </div>
                                                <div style={{ display: 'grid', gap: '0.2rem' }}>
                                                    <label style={{ fontSize: '0.72rem', color: 'var(--ink-muted)' }}>Evidence links * (comma-separated)</label>
                                                    <input
                                                        type="text"
                                                        value={decisionForm.evidence_links}
                                                        onChange={(e) => setDecisionForm((f) => ({ ...f, evidence_links: e.target.value }))}
                                                        placeholder="https://ci.example.com/run/123"
                                                        style={{ ...INPUT_STYLE }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        type="button"
                                                        className="primary-action"
                                                        disabled={decidingId === wf.id}
                                                        onClick={() => void submitDecision(wf.id)}
                                                    >
                                                        {decidingId === wf.id ? 'Submitting...' : 'Submit decision'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </article>
                                );
                            })}

                            {workflows.length === 0 && (
                                <p style={{ margin: 0, color: 'var(--ink-soft)' }}>No workflows found for this workspace.</p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ── Diagnostics Tab ───────────────────────────────────────── */}
            {activeTab === 'diagnostics' && (
                <div style={{ display: 'grid', gap: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Diagnostics</h3>
                        <button type="button" className="secondary-action" onClick={() => void loadDiagnostics()}>Refresh</button>
                    </div>

                    {diagError && <p className="message-inline">{diagError}</p>}

                    {diagLoading ? (
                        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>Loading diagnostics...</p>
                    ) : diagnostics ? (
                        <>
                            {/* KPI cards */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem' }}>
                                {[
                                    { label: 'Pending', value: diagnostics.pendingWorkflows, warn: diagnostics.pendingWorkflows > 5 },
                                    { label: 'Overdue', value: diagnostics.overdueWorkflows, warn: diagnostics.overdueWorkflows > 0 },
                                    { label: 'Avg latency (s)', value: diagnostics.avgStageLatencySeconds, warn: diagnostics.avgStageLatencySeconds > diagnostics.workflowSlaSeconds * 0.8 },
                                    { label: 'SLA (s)', value: diagnostics.workflowSlaSeconds, warn: false },
                                ].map((item) => (
                                    <div
                                        key={item.label}
                                        style={{
                                            padding: '0.9rem 1rem',
                                            borderRadius: 6,
                                            border: '1px solid var(--line)',
                                            background: item.warn ? '#fef9c3' : 'var(--surface)',
                                            display: 'grid',
                                            gap: '0.2rem',
                                        }}
                                    >
                                        <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-muted)' }}>
                                            {item.label}
                                        </p>
                                        <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: item.warn ? '#854d0e' : 'var(--ink)' }}>
                                            {item.value}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            {/* Bottleneck */}
                            {diagnostics.bottleneckStageId && (
                                <div style={{ padding: '0.75rem 1rem', borderRadius: 6, border: '1px solid #fde68a', background: '#fef9c3' }}>
                                    <p style={{ margin: 0, fontSize: '0.85rem' }}>
                                        <strong>Bottleneck stage:</strong> {diagnostics.bottleneckStageId} —{' '}
                                        {diagnostics.bottleneckStagePendingCount} workflows pending
                                    </p>
                                </div>
                            )}

                            {/* Raw data */}
                            <div style={{ display: 'grid', gap: '0.3rem' }}>
                                <p style={{ margin: 0, fontSize: '0.78rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--ink-muted)' }}>
                                    Raw diagnostics
                                </p>
                                <pre
                                    style={{
                                        margin: 0,
                                        padding: '0.75rem',
                                        borderRadius: 4,
                                        border: '1px solid var(--line)',
                                        background: 'var(--surface)',
                                        fontSize: '0.75rem',
                                        overflowX: 'auto',
                                        color: 'var(--ink)',
                                    }}
                                >
                                    {JSON.stringify(diagnostics, null, 2)}
                                </pre>
                            </div>

                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--ink-muted)' }}>
                                Generated at {new Date(diagnostics.generatedAt).toLocaleString()} · Workspace {diagnostics.workspaceId}
                            </p>
                        </>
                    ) : (
                        <p style={{ margin: 0, color: 'var(--ink-soft)' }}>No diagnostics data available.</p>
                    )}
                </div>
            )}
        </section>
    );
}
