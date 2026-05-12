'use client';

import { useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type CiTriagePanelProps = { workspaceId: string };

type FailedJob = string;

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
    analyzing: { bg: '#dbeafe', color: '#1d4ed8' },
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
    // Session-local reports
    const [reports, setReports] = useState<CiTriageReport[]>([]);
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

    async function submitIntake() {
        if (!intakeProvider.trim() || !intakeRunId.trim() || !intakeRepo.trim() || !intakeBranch.trim()) {
            setIntakeError('provider, runId, repo, and branch are required.');
            return;
        }

        const failedJobs = intakeJobsRaw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

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
                setIntakeSuccess(`Queued — triageId: ${triageId}`);
                // Seed into session-local list so user can view report
                setReports((prev) => [
                    {
                        triageId,
                        provider: intakeProvider.trim(),
                        runId: intakeRunId.trim(),
                        repo: intakeRepo.trim(),
                        branch: intakeBranch.trim(),
                        failedJobs,
                        status: data.status ?? 'queued',
                        correlationId: data.correlationId ?? '',
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    },
                    ...prev,
                ]);
                setIntakeProvider('');
                setIntakeRunId('');
                setIntakeRepo('');
                setIntakeBranch('');
                setIntakeJobsRaw('');
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
        <div style={{ display: 'grid', gridTemplateColumns: selectedTriageId ? '1fr 1.4fr' : '1fr', gap: '24px', alignItems: 'start' }}>
            {/* Left column */}
            <div>
                {/* Session-only warning banner */}
                <div
                    style={{
                        background: '#451a03',
                        border: '1px solid #92400e',
                        borderRadius: '8px',
                        padding: '10px 14px',
                        marginBottom: '20px',
                        fontSize: '12px',
                        color: '#fcd34d',
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'flex-start',
                    }}
                >
                    <span style={{ flexShrink: 0 }}>⚠</span>
                    <span>
                        Reports are <strong>session-only</strong> — submitted triage IDs are tracked in memory and lost on page reload. Copy triageIds you need before leaving.
                    </span>
                </div>

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
                    <div
                        style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: 'var(--ink-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            marginBottom: '14px',
                        }}
                    >
                        Submit CI Failure
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                        <input
                            type="text"
                            placeholder="Provider (e.g. github)"
                            value={intakeProvider}
                            onChange={(e) => setIntakeProvider(e.target.value)}
                            style={inputStyle}
                        />
                        <input
                            type="text"
                            placeholder="Run ID"
                            value={intakeRunId}
                            onChange={(e) => setIntakeRunId(e.target.value)}
                            style={inputStyle}
                        />
                        <input
                            type="text"
                            placeholder="Repository (owner/repo)"
                            value={intakeRepo}
                            onChange={(e) => setIntakeRepo(e.target.value)}
                            style={inputStyle}
                        />
                        <input
                            type="text"
                            placeholder="Branch"
                            value={intakeBranch}
                            onChange={(e) => setIntakeBranch(e.target.value)}
                            style={inputStyle}
                        />
                    </div>
                    <input
                        type="text"
                        placeholder="Failed jobs (comma-separated)"
                        value={intakeJobsRaw}
                        onChange={(e) => setIntakeJobsRaw(e.target.value)}
                        style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginBottom: '10px' }}
                    />
                    {intakeError && (
                        <p style={{ fontSize: '12px', color: '#f87171', marginBottom: '8px' }}>{intakeError}</p>
                    )}
                    {intakeSuccess && (
                        <p style={{ fontSize: '12px', color: '#4ade80', marginBottom: '8px' }}>{intakeSuccess}</p>
                    )}
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
                </div>

                {/* Report list */}
                {reports.length === 0 ? (
                    <p style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>No triage reports this session.</p>
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
                                                key={job}
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
                                                {job}
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
