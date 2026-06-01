'use client';

import { useCallback, useEffect, useState } from 'react';
import OperatorGuide from './operator-guide';

const CI_GUIDE_ITEMS = [
    { label: 'Root cause plausibility', hint: 'Does the hypothesis match the failing job names? A "build failure" diagnosis on a test-only job is suspicious — check the job name against the category.', level: 'critical' as const },
    { label: 'Confidence score threshold', hint: 'Score ≥ 70%: act on the proposal. 50–70%: investigate further before applying. < 50%: discard and triage manually.', level: 'caution' as const },
    { label: 'Blast radius assessment', hint: 'If blast radius is "High" or "Medium-High", the patch touches shared infrastructure — require a second human review before applying.', level: 'critical' as const },
    { label: 'Patch proposal review', hint: 'Read every line of the patch. Never auto-apply. Check for: hardcoded secrets, removed safety checks, logic inversions, scope creep beyond the stated fix.', level: 'critical' as const },
    { label: 'Repro steps validation', hint: 'Can you follow the repro steps locally? If they reference environment variables or services not available in dev, flag before escalating.', level: 'caution' as const },
    { label: 'Run ID uniqueness', hint: 'Re-submitting the same runId is idempotent — the system will return the existing report. Use a new runId for each distinct CI run.', level: 'verify' as const },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type CiTriagePanelProps = { workspaceId: string };

type FailedJob = { jobName: string; step?: string; exitCode?: number; logRef?: string };

type ReproStep = string;

type CiTriageReport = {
    triageId: string;
    provider: string;
    runId: string;
    repo: string;
    branch: string;
    failedJobs: FailedJob[];
    status: string;
    rootCauseHypothesis?: string | null;
    reproSteps?: ReproStep[] | null;
    patchProposal?: string | null;
    confidence?: number | null;
    blastRadius?: string | null;
    correlationId: string;
    createdAt: string;
    updatedAt: string;
};

type IntakeResponse = {
    triageId?: string;
    status?: string;
    correlationId?: string;
    error?: string;
    message?: string;
};

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    queued: { bg: '#fef9c3', color: '#854d0e' },
    triaging: { bg: '#dbeafe', color: '#1d4ed8' },
    complete: { bg: '#dcfce7', color: '#166534' },
    failed: { bg: '#fee2e2', color: '#991b1b' },
};

function statusBadge(status: string) {
    const style = STATUS_BADGE[status] ?? { bg: 'var(--line)', color: 'var(--ink-muted)' };
    return (
        <span
            style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: 700,
                background: style.bg,
                color: style.color,
            }}
        >
            {status}
        </span>
    );
}

function formatDate(iso: string): string {
    const d = new Date(iso);
    return (
        d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ', ' +
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CiTriagePanel({ workspaceId }: CiTriagePanelProps) {
    const [reports, setReports] = useState<CiTriageReport[]>([]);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [selectedTriageId, setSelectedTriageId] = useState<string | null>(null);
    const [selectedReport, setSelectedReport] = useState<CiTriageReport | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Intake form
    const [intakeProvider, setIntakeProvider] = useState('');
    const [intakeRunId, setIntakeRunId] = useState('');
    const [intakeRepo, setIntakeRepo] = useState('');
    const [intakeBranch, setIntakeBranch] = useState('');
    const [intakeJobsRaw, setIntakeJobsRaw] = useState('');
    const [intakeSubmitting, setIntakeSubmitting] = useState(false);
    const [intakeError, setIntakeError] = useState<string | null>(null);
    const [intakeSuccess, setIntakeSuccess] = useState<string | null>(null);

    // Load history on mount
    const loadHistory = useCallback(async () => {
        setHistoryLoading(true);
        try {
            const res = await fetch(`/api/ci/${workspaceId}?limit=50`);
            if (res.ok) {
                const data = await res.json() as { runs?: CiTriageReport[] } | CiTriageReport[];
                const runs = Array.isArray(data) ? data : (data.runs ?? []);
                setReports(runs);
            }
        } catch {
            // silently fall back to empty list
        } finally {
            setHistoryLoading(false);
        }
    }, [workspaceId]);

    useEffect(() => { void loadHistory(); }, [loadHistory]);

    async function submitIntake() {
        if (!intakeProvider) { setIntakeError('Please select a CI provider from the dropdown.'); return; }
        if (!intakeRunId.trim()) { setIntakeError('Run ID is required. Find it in the URL of your CI run page.'); return; }
        if (!intakeRepo.trim()) { setIntakeError('Repository is required. Use the format owner/repo-name.'); return; }
        if (!intakeRepo.includes('/')) { setIntakeError('Repository must be in the format owner/repo-name (e.g. acme-corp/backend-api).'); return; }
        if (!intakeBranch.trim()) { setIntakeError('Branch is required. Enter the branch name shown in your CI run summary.'); return; }

        // Bug fix: API expects { jobName } objects, not plain strings
        const failedJobs = intakeJobsRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((jobName) => ({ jobName }));

        setIntakeSubmitting(true);
        setIntakeError(null);
        setIntakeSuccess(null);

        try {
            const res = await fetch(`/api/ci/${workspaceId}/intake`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: intakeProvider.trim(),
                    runId: intakeRunId.trim(),
                    repo: intakeRepo.trim(),
                    branch: intakeBranch.trim(),
                    failedJobs,
                    logRefs: [],
                }),
            });
            const data = (await res.json()) as IntakeResponse;
            if (!res.ok) {
                setIntakeError(data.message ?? data.error ?? 'Intake failed.');
            } else {
                const triageId = data.triageId ?? '';
                setIntakeSuccess(`Submitted — triageId: ${triageId}`);
                setIntakeProvider('');
                setIntakeRunId('');
                setIntakeRepo('');
                setIntakeBranch('');
                setIntakeJobsRaw('');
                // Bug fix: reload history to get actual status from server
                // (intake response hardcodes 'queued'; triage runs synchronously so
                // the DB already has 'complete' by the time we reload)
                await loadHistory();
            }
        } catch {
            setIntakeError('Network error during intake.');
        } finally {
            setIntakeSubmitting(false);
        }
    }

    async function viewReport(triageId: string) {
        setSelectedTriageId(triageId);
        setSelectedReport(null);
        setDetailLoading(true);

        try {
            const res = await fetch(`/api/ci/${workspaceId}/${triageId}`);
            if (!res.ok) {
                setSelectedReport(null);
            } else {
                const data = (await res.json()) as CiTriageReport;
                setSelectedReport(data);
            }
        } catch {
            setSelectedReport(null);
        } finally {
            setDetailLoading(false);
        }
    }

    function closeDetail() {
        setSelectedTriageId(null);
        setSelectedReport(null);
    }

    return (
        <div>
        <OperatorGuide
            title="CI Triage — Operator Review Guide"
            intro="Each triage report is AI-generated from job names and log hints. Before acting on a patch proposal, verify each item below."
            items={CI_GUIDE_ITEMS}
        />
        <div style={{ display: 'grid', gridTemplateColumns: selectedTriageId ? '1fr 1.4fr' : '1fr', gap: '24px', alignItems: 'start' }}>
            {/* Left column */}
            <div>

                {/* Intake form */}
                <div
                    style={{
                        background: 'var(--bg)',
                        border: '1px solid var(--line)',
                        borderRadius: '10px',
                        padding: '18px',
                        marginBottom: '24px',
                    }}
                >
                    {/* Form header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            Submit CI Failure
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                setIntakeProvider('github');
                                setIntakeRunId('12345678');
                                setIntakeRepo('acme-corp/backend-api');
                                setIntakeBranch('main');
                                setIntakeJobsRaw('typecheck, test:integration');
                            }}
                            style={{ fontSize: '11px', color: '#6366f1', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '5px', padding: '3px 9px', cursor: 'pointer', fontWeight: 600 }}
                        >
                            ✦ Use example data
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                        {/* Provider */}
                        <div>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-muted)', display: 'block', marginBottom: '4px' }}>
                                CI Provider <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <select
                                value={intakeProvider}
                                onChange={(e) => setIntakeProvider(e.target.value)}
                                style={{ ...inputStyle, appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%2394a3b8\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: '28px' }}
                            >
                                <option value="">— Select provider —</option>
                                <option value="github">GitHub Actions</option>
                                <option value="gitlab">GitLab CI</option>
                                <option value="bitbucket">Bitbucket Pipelines</option>
                                <option value="jenkins">Jenkins</option>
                                <option value="circleci">CircleCI</option>
                                <option value="azure">Azure DevOps</option>
                                <option value="buildkite">Buildkite</option>
                            </select>
                            <p style={{ fontSize: '10px', color: '#94a3b8', margin: '3px 0 0' }}>
                                Which CI system ran the failing pipeline?
                            </p>
                        </div>

                        {/* Run ID */}
                        <div>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-muted)', display: 'block', marginBottom: '4px' }}>
                                Run ID <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. 12345678"
                                value={intakeRunId}
                                onChange={(e) => setIntakeRunId(e.target.value)}
                                style={inputStyle}
                            />
                            <p style={{ fontSize: '10px', color: '#94a3b8', margin: '3px 0 0' }}>
                                The numeric ID in the CI run URL. GitHub: <em>…/actions/runs/<strong>12345678</strong></em>
                            </p>
                        </div>

                        {/* Repository */}
                        <div>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-muted)', display: 'block', marginBottom: '4px' }}>
                                Repository <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. acme-corp/backend-api"
                                value={intakeRepo}
                                onChange={(e) => setIntakeRepo(e.target.value)}
                                style={{ ...inputStyle, borderColor: intakeRepo && !intakeRepo.includes('/') ? '#fca5a5' : undefined }}
                            />
                            <p style={{ fontSize: '10px', color: intakeRepo && !intakeRepo.includes('/') ? '#ef4444' : '#94a3b8', margin: '3px 0 0' }}>
                                Format: <strong>owner/repo-name</strong>. Find in your repo URL after github.com/
                            </p>
                        </div>

                        {/* Branch */}
                        <div>
                            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-muted)', display: 'block', marginBottom: '4px' }}>
                                Branch <span style={{ color: '#ef4444' }}>*</span>
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. main or feature/my-fix"
                                value={intakeBranch}
                                onChange={(e) => setIntakeBranch(e.target.value)}
                                style={inputStyle}
                            />
                            <p style={{ fontSize: '10px', color: '#94a3b8', margin: '3px 0 0' }}>
                                The branch that was running when the failure occurred. Shown in the CI run summary.
                            </p>
                        </div>
                    </div>

                    {/* Failed jobs */}
                    <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ink-muted)', display: 'block', marginBottom: '4px' }}>
                            Failed Job Names <span style={{ color: '#64748b', fontWeight: 400 }}>(optional but recommended)</span>
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. typecheck, test:integration, build:docker"
                            value={intakeJobsRaw}
                            onChange={(e) => setIntakeJobsRaw(e.target.value)}
                            style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }}
                        />
                        <p style={{ fontSize: '10px', color: '#94a3b8', margin: '3px 0 0' }}>
                            Comma-separated job names that show a ✗ or red status in the CI run. Find under the <strong>Jobs</strong> panel of your CI run page. The more specific, the more accurate the AI diagnosis.
                        </p>
                    </div>

                    {intakeError && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px', marginBottom: '10px' }}>
                            <span style={{ fontSize: '13px', lineHeight: 1 }}>⚠</span>
                            <p style={{ fontSize: '12px', color: '#dc2626', margin: 0 }}>{intakeError}</p>
                        </div>
                    )}
                    {intakeSuccess && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', padding: '8px 10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', marginBottom: '10px' }}>
                            <span style={{ fontSize: '13px', lineHeight: 1 }}>✓</span>
                            <p style={{ fontSize: '12px', color: '#16a34a', margin: 0 }}>{intakeSuccess}</p>
                        </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button
                            onClick={() => void submitIntake()}
                            disabled={intakeSubmitting}
                            style={{
                                padding: '8px 18px',
                                background: 'var(--ink)',
                                color: 'var(--bg)',
                                border: 'none',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: intakeSubmitting ? 'not-allowed' : 'pointer',
                                opacity: intakeSubmitting ? 0.6 : 1,
                            }}
                        >
                            {intakeSubmitting ? 'Submitting…' : 'Submit for Triage'}
                        </button>
                        <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                            The AI will analyse the failure and return a root-cause report within seconds.
                        </span>
                    </div>
                </div>

                {/* Report list */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Triage History
                    </span>
                    <button
                        type="button"
                        onClick={() => void loadHistory()}
                        style={{ fontSize: '11px', color: 'var(--ink-muted)', background: 'transparent', border: '1px solid var(--line)', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer' }}
                    >
                        ↻ Refresh
                    </button>
                </div>
                {historyLoading ? (
                    <p style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>Loading reports…</p>
                ) : reports.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>No triage reports found.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {reports.map((r) => (
                            <div
                                key={r.triageId}
                                style={{
                                    padding: '12px 14px',
                                    background: selectedTriageId === r.triageId ? 'var(--line)' : 'var(--bg)',
                                    border: `1px solid ${selectedTriageId === r.triageId ? 'var(--ink-muted)' : 'var(--line)'}`,
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '12px',
                                }}
                                onClick={() => void viewReport(r.triageId)}
                            >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink)' }}>
                                            {r.repo}
                                        </span>
                                        {statusBadge(r.status)}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--ink-muted)', fontFamily: 'monospace' }}>
                                        run {r.runId} · {r.branch} · {r.provider}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                                        {formatDate(r.createdAt)}
                                    </div>
                                </div>
                                <span style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>→</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Detail drawer */}
            {selectedTriageId && (
                <div
                    style={{
                        background: 'var(--bg)',
                        border: '1px solid var(--line)',
                        borderRadius: '10px',
                        padding: '20px',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <span
                            style={{
                                fontSize: '12px',
                                fontWeight: 700,
                                color: 'var(--ink-muted)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                            }}
                        >
                            Triage Report
                        </span>
                        <button
                            onClick={closeDetail}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--ink-muted)',
                                fontSize: '14px',
                                cursor: 'pointer',
                            }}
                        >
                            ✕
                        </button>
                    </div>

                    {detailLoading && (
                        <p style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>Loading report…</p>
                    )}
                    {!detailLoading && !selectedReport && (
                        <p style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>
                            Report not yet available — try again in a moment.
                        </p>
                    )}
                    {!detailLoading && selectedReport && (
                        <>
                            {/* Meta grid */}
                            <div
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '10px',
                                    marginBottom: '20px',
                                }}
                            >
                                {[
                                    ['Run ID', selectedReport.runId],
                                    ['Provider', selectedReport.provider],
                                    ['Repo', selectedReport.repo],
                                    ['Branch', selectedReport.branch],
                                    ['Status', selectedReport.status],
                                    ['Confidence', selectedReport.confidence != null ? `${(selectedReport.confidence * 100).toFixed(0)}%` : '—'],
                                    ['Blast Radius', selectedReport.blastRadius ?? '—'],
                                    ['Correlation ID', selectedReport.correlationId],
                                    ['Created', formatDate(selectedReport.createdAt)],
                                    ['Updated', formatDate(selectedReport.updatedAt)],
                                ].map(([label, value]) => (
                                    <div key={label}>
                                        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                                            {label}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--ink)', fontFamily: label === 'Run ID' || label === 'Correlation ID' ? 'monospace' : undefined }}>
                                            {value}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Failed jobs */}
                            {selectedReport.failedJobs.length > 0 && (
                                <div style={{ marginBottom: '18px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                        Failed Jobs
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {selectedReport.failedJobs.map((job) => (
                                            <span
                                                key={job.jobName}
                                                style={{
                                                    padding: '2px 8px',
                                                    background: '#fee2e2',
                                                    color: '#991b1b',
                                                    borderRadius: '4px',
                                                    fontSize: '11px',
                                                    fontWeight: 600,
                                                    fontFamily: 'monospace',
                                                }}
                                            >
                                                {job.jobName}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Root cause hypothesis */}
                            {selectedReport.rootCauseHypothesis && (
                                <div style={{ marginBottom: '18px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                        Root Cause Hypothesis
                                    </div>
                                    <pre
                                        style={{
                                            background: 'var(--line)',
                                            border: '1px solid var(--line)',
                                            borderRadius: '6px',
                                            padding: '10px 12px',
                                            fontSize: '12px',
                                            color: 'var(--ink)',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                            margin: 0,
                                        }}
                                    >
                                        {selectedReport.rootCauseHypothesis}
                                    </pre>
                                </div>
                            )}

                            {/* Repro steps */}
                            {selectedReport.reproSteps && selectedReport.reproSteps.length > 0 && (
                                <div style={{ marginBottom: '18px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                        Repro Steps
                                    </div>
                                    <ol style={{ margin: 0, paddingLeft: '18px' }}>
                                        {selectedReport.reproSteps.map((step, i) => (
                                            <li key={i} style={{ fontSize: '12px', color: 'var(--ink)', marginBottom: '4px' }}>
                                                {step}
                                            </li>
                                        ))}
                                    </ol>
                                </div>
                            )}

                            {/* Patch proposal */}
                            {selectedReport.patchProposal && (
                                <div style={{ marginBottom: '4px' }}>
                                    <div
                                        style={{
                                            background: '#451a03',
                                            border: '1px solid #92400e',
                                            borderRadius: '6px',
                                            padding: '8px 12px',
                                            marginBottom: '8px',
                                            fontSize: '11px',
                                            color: '#fcd34d',
                                            display: 'flex',
                                            gap: '6px',
                                        }}
                                    >
                                        <span>⚠</span>
                                        <span>Patch proposal is AI-generated. Review carefully before applying.</span>
                                    </div>
                                    <pre
                                        style={{
                                            background: '#0a0a0a',
                                            border: '1px solid #1e293b',
                                            borderRadius: '6px',
                                            padding: '10px 12px',
                                            fontSize: '11px',
                                            color: '#e2e8f0',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-word',
                                            margin: 0,
                                            fontFamily: 'monospace',
                                        }}
                                    >
                                        {selectedReport.patchProposal}
                                    </pre>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
        </div>
    );
}

// ── Shared input style ─────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
    padding: '7px 10px',
    background: 'var(--bg)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    color: 'var(--ink)',
    fontSize: '12px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
};
