'use client';

import { useCallback, useState } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type PrDraft = {
    id: string;
    tenantId: string;
    workspaceId: string;
    branch: string;
    targetBranch: string | null;
    changeSummary: string;
    linkedIssueIds: string[];
    title: string;
    body: string;
    checklist: string[];
    reviewersSuggested: string[];
    status: string;
    prId: string | null;
    provider: string | null;
    labels: string[];
    correlationId: string;
    createdAt: string;
    updatedAt: string;
};

type PrStatus = {
    prId: string;
    draftId: string;
    branch: string;
    targetBranch: string;
    provider: string;
    state: string;
    checks: Array<{ name: string; status: string; conclusion: string | null }>;
    reviewStatus: {
        requested: string[];
        approved: string[];
        changes_requested: string[];
    };
    correlationId: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    draft: { bg: '#fef9c3', color: '#854d0e' },
    published: { bg: '#dcfce7', color: '#166534' },
};

const PR_STATE_BADGE: Record<string, { bg: string; color: string }> = {
    open: { bg: '#dcfce7', color: '#166534' },
    closed: { bg: '#fee2e2', color: '#991b1b' },
    merged: { bg: '#f3e8ff', color: '#7c3aed' },
};

function inlineBadge(label: string, map: Record<string, { bg: string; color: string }>) {
    const style = map[label] ?? { bg: 'var(--line)', color: 'var(--ink-muted)' };
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
            {label}
        </span>
    );
}

function fmtDate(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return (
        d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

type PrDraftsPanelProps = {
    tenantId: string;
    workspaceId: string;
};

export default function PrDraftsPanel({ tenantId, workspaceId }: PrDraftsPanelProps) {
    // Draft list (session-local — no GET /list endpoint on gateway)
    const [drafts, setDrafts] = useState<PrDraft[]>([]);
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);

    // Publish
    const [publishing, setPublishing] = useState<string | null>(null);
    const [publishError, setPublishError] = useState<string | null>(null);

    // PR status drawer
    const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
    const [prStatus, setPrStatus] = useState<PrStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(false);

    // Create form
    const [formBranch, setFormBranch] = useState('');
    const [formChangeSummary, setFormChangeSummary] = useState('');
    const [formTargetBranch, setFormTargetBranch] = useState('main');
    const [formLinkedIssues, setFormLinkedIssues] = useState('');

    const createDraft = useCallback(async () => {
        if (!formBranch.trim()) {
            setCreateError('Branch is required.');
            return;
        }
        if (!formChangeSummary.trim()) {
            setCreateError('Change summary is required.');
            return;
        }

        setCreating(true);
        setCreateError(null);

        const response = await fetch(
            `/api/workspaces/${encodeURIComponent(workspaceId)}/pr-drafts`,
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    branch: formBranch.trim(),
                    changeSummary: formChangeSummary.trim(),
                    targetBranch: formTargetBranch.trim() || 'main',
                    linkedIssueIds: formLinkedIssues
                        ? formLinkedIssues.split(',').map((s) => s.trim())
                        : [],
                }),
            },
        );

        const data = (await response.json().catch(() => ({}))) as PrDraft & { message?: string };

        if (!response.ok) {
            setCreateError(data.message ?? 'Failed to create PR draft.');
            setCreating(false);
            return;
        }

        setDrafts((prev) => [data, ...prev]);
        setFormBranch('');
        setFormChangeSummary('');
        setFormTargetBranch('main');
        setFormLinkedIssues('');
        setCreating(false);
    }, [workspaceId, formBranch, formChangeSummary, formTargetBranch, formLinkedIssues]);

    const publishDraft = useCallback(
        async (draft: PrDraft) => {
            if (draft.status !== 'draft') return;
            if (!window.confirm(`Publish PR draft for branch "${draft.branch}"?`)) return;

            setPublishing(draft.id);
            setPublishError(null);

            const response = await fetch(
                `/api/workspaces/${encodeURIComponent(workspaceId)}/pr-drafts/${encodeURIComponent(draft.id)}/publish`,
                {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ targetBranch: draft.targetBranch ?? 'main' }),
                },
            );

            const data = (await response.json().catch(() => ({}))) as {
                status?: string;
                prId?: string;
                message?: string;
                error?: string;
                reason?: string;
            };

            if (response.status === 403) {
                setPublishError('Blocked — high-risk change summary.');
                setPublishing(null);
                return;
            }

            if (!response.ok) {
                setPublishError(data.message ?? data.reason ?? 'Failed to publish PR draft.');
                setPublishing(null);
                return;
            }

            setDrafts((prev) =>
                prev.map((d) =>
                    d.id === draft.id
                        ? { ...d, status: data.status ?? 'publishing', prId: data.prId ?? d.prId }
                        : d,
                ),
            );
            setPublishing(null);
        },
        [workspaceId],
    );

    const fetchStatus = useCallback(
        async (draft: PrDraft) => {
            if (!draft.prId) return;
            setSelectedDraftId(draft.id);
            setPrStatus(null);
            setStatusLoading(true);

            const response = await fetch(
                `/api/workspaces/${encodeURIComponent(workspaceId)}/pr-drafts/${encodeURIComponent(draft.id)}/status`,
                { cache: 'no-store' },
            );

            const data = (await response.json().catch(() => null)) as PrStatus | null;
            setPrStatus(response.ok ? data : null);
            setStatusLoading(false);
        },
        [workspaceId],
    );

    const selectedDraft = drafts.find((d) => d.id === selectedDraftId) ?? null;

    // Suppress unused — available for future server-side filtering
    void tenantId;

    const inputStyle: React.CSSProperties = {
        padding: '0.35rem 0.55rem',
        fontSize: '0.83rem',
        border: '1px solid var(--line)',
        borderRadius: '4px',
        background: 'var(--bg)',
        color: 'var(--ink)',
        width: '100%',
        boxSizing: 'border-box',
    };

    return (
        <section className="card" style={{ display: 'grid', gap: '1.5rem' }}>
            {/* ── Section 1: Create Draft ─────────────────────────────────── */}
            <div>
                <h2 style={{ margin: '0 0 0.75rem' }}>Create PR Draft</h2>
                <div style={{ display: 'grid', gap: '0.55rem', maxWidth: '560px' }}>
                    <label style={{ fontSize: '0.83rem', fontWeight: 600 }}>
                        Branch *
                        <input
                            type="text"
                            value={formBranch}
                            onChange={(e) => setFormBranch(e.target.value)}
                            placeholder="feature/my-change"
                            style={{ ...inputStyle, marginTop: '0.25rem' }}
                        />
                    </label>
                    <label style={{ fontSize: '0.83rem', fontWeight: 600 }}>
                        Target Branch
                        <input
                            type="text"
                            value={formTargetBranch}
                            onChange={(e) => setFormTargetBranch(e.target.value)}
                            placeholder="main"
                            style={{ ...inputStyle, marginTop: '0.25rem' }}
                        />
                    </label>
                    <label style={{ fontSize: '0.83rem', fontWeight: 600 }}>
                        Change Summary *
                        <textarea
                            rows={3}
                            value={formChangeSummary}
                            onChange={(e) => setFormChangeSummary(e.target.value)}
                            placeholder="Describe the changes in this PR…"
                            style={{ ...inputStyle, resize: 'vertical', marginTop: '0.25rem', fontFamily: 'inherit' }}
                        />
                        <span
                            style={{
                                display: 'block',
                                marginTop: '0.2rem',
                                fontSize: '0.75rem',
                                color: '#b45309',
                            }}
                        >
                            ⚠ Summaries containing deploy/merge/force keywords will be blocked at publish.
                        </span>
                    </label>
                    <label style={{ fontSize: '0.83rem', fontWeight: 600 }}>
                        Linked Issues
                        <input
                            type="text"
                            value={formLinkedIssues}
                            onChange={(e) => setFormLinkedIssues(e.target.value)}
                            placeholder="PROJ-1, PROJ-2"
                            style={{ ...inputStyle, marginTop: '0.25rem' }}
                        />
                    </label>
                    {createError && <p className="message-inline">{createError}</p>}
                    <div>
                        <button
                            type="button"
                            className="primary-action"
                            disabled={creating}
                            onClick={() => void createDraft()}
                        >
                            {creating ? 'Creating…' : 'Create Draft'}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Section 2: PR Drafts List ───────────────────────────────── */}
            <div>
                <h2 style={{ margin: '0 0 0.5rem' }}>PR Drafts</h2>

                {/* Session-only banner */}
                <div
                    style={{
                        padding: '0.5rem 0.8rem',
                        background: '#fef9c3',
                        border: '1px solid #fde68a',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        color: '#854d0e',
                        marginBottom: '0.75rem',
                    }}
                >
                    ⚠ Draft list is session-only — resets on reload.
                </div>

                {publishError && (
                    <p className="message-inline" style={{ marginBottom: '0.6rem' }}>
                        {publishError}
                    </p>
                )}

                {drafts.length === 0 ? (
                    <p style={{ margin: 0, color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: '0.86rem' }}>
                        No drafts created yet. Use the form above to create one.
                    </p>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--ink-muted)' }}>
                                    {['Branch', 'Target', 'Status', 'Title', 'Created', 'Actions'].map((h) => (
                                        <th
                                            key={h}
                                            style={{ textAlign: 'left', padding: '0.45rem 0.6rem', fontWeight: 600 }}
                                        >
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {drafts.map((draft) => (
                                    <tr key={draft.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td
                                            style={{
                                                padding: '0.5rem 0.6rem',
                                                fontFamily: 'monospace',
                                                fontSize: '0.78rem',
                                                color: 'var(--ink)',
                                            }}
                                        >
                                            {draft.branch}
                                        </td>
                                        <td
                                            style={{
                                                padding: '0.5rem 0.6rem',
                                                fontFamily: 'monospace',
                                                fontSize: '0.78rem',
                                                color: 'var(--ink-soft)',
                                            }}
                                        >
                                            {draft.targetBranch ?? 'main'}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            {inlineBadge(draft.status, STATUS_BADGE)}
                                        </td>
                                        <td
                                            style={{
                                                padding: '0.5rem 0.6rem',
                                                maxWidth: '200px',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                color: 'var(--ink)',
                                            }}
                                            title={draft.title}
                                        >
                                            {draft.title || '—'}
                                        </td>
                                        <td
                                            style={{
                                                padding: '0.5rem 0.6rem',
                                                color: 'var(--ink-soft)',
                                                fontSize: '0.78rem',
                                            }}
                                        >
                                            {fmtDate(draft.createdAt)}
                                        </td>
                                        <td style={{ padding: '0.5rem 0.6rem' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                {draft.status === 'draft' && (
                                                    <button
                                                        type="button"
                                                        className="secondary-action"
                                                        disabled={publishing === draft.id}
                                                        onClick={() => void publishDraft(draft)}
                                                        style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem' }}
                                                    >
                                                        {publishing === draft.id ? 'Publishing…' : 'Publish'}
                                                    </button>
                                                )}
                                                {draft.prId && (
                                                    <button
                                                        type="button"
                                                        className="secondary-action"
                                                        onClick={() => void fetchStatus(draft)}
                                                        style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem' }}
                                                    >
                                                        View PR Status
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Detail drawer */}
                {selectedDraftId && (
                    <div
                        className="card"
                        style={{ margin: '1rem 0 0', padding: '0.9rem', display: 'grid', gap: '0.75rem' }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                            }}
                        >
                            <p
                                style={{
                                    margin: 0,
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    letterSpacing: '0.1em',
                                    textTransform: 'uppercase',
                                    color: 'var(--ink-muted)',
                                }}
                            >
                                PR Status — {selectedDraftId.slice(0, 12)}…
                            </p>
                            <button
                                type="button"
                                className="secondary-action"
                                style={{ fontSize: '0.78rem', padding: '0.2rem 0.5rem' }}
                                onClick={() => {
                                    setSelectedDraftId(null);
                                    setPrStatus(null);
                                }}
                            >
                                Close
                            </button>
                        </div>

                        {statusLoading && (
                            <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: '0.86rem' }}>
                                Loading status…
                            </p>
                        )}

                        {!statusLoading && prStatus && (
                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                                {/* Summary grid */}
                                <div
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr',
                                        gap: '0.4rem',
                                        fontSize: '0.83rem',
                                    }}
                                >
                                    <div>
                                        <span style={{ color: 'var(--ink-muted)' }}>PR ID: </span>
                                        <span style={{ fontFamily: 'monospace' }}>{prStatus.prId}</span>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--ink-muted)' }}>Provider: </span>
                                        <span>{prStatus.provider}</span>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--ink-muted)' }}>Branch: </span>
                                        <span style={{ fontFamily: 'monospace' }}>{prStatus.branch}</span>
                                    </div>
                                    <div>
                                        <span style={{ color: 'var(--ink-muted)' }}>State: </span>
                                        {inlineBadge(prStatus.state, PR_STATE_BADGE)}
                                    </div>
                                </div>

                                {/* Checks table */}
                                {prStatus.checks.length > 0 && (
                                    <div>
                                        <p style={{ margin: '0 0 0.3rem', fontSize: '0.83rem', fontWeight: 600 }}>
                                            Checks
                                        </p>
                                        <table
                                            style={{
                                                width: '100%',
                                                borderCollapse: 'collapse',
                                                fontSize: '0.8rem',
                                            }}
                                        >
                                            <thead>
                                                <tr
                                                    style={{
                                                        borderBottom: '1px solid var(--line)',
                                                        color: 'var(--ink-muted)',
                                                    }}
                                                >
                                                    {['Name', 'Status', 'Conclusion'].map((h) => (
                                                        <th
                                                            key={h}
                                                            style={{
                                                                textAlign: 'left',
                                                                padding: '0.3rem 0.5rem',
                                                                fontWeight: 600,
                                                            }}
                                                        >
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {prStatus.checks.map((c, i) => (
                                                    <tr
                                                        key={i}
                                                        style={{ borderBottom: '1px solid var(--line)' }}
                                                    >
                                                        <td style={{ padding: '0.3rem 0.5rem' }}>{c.name}</td>
                                                        <td style={{ padding: '0.3rem 0.5rem' }}>{c.status}</td>
                                                        <td style={{ padding: '0.3rem 0.5rem', color: 'var(--ink-soft)' }}>
                                                            {c.conclusion ?? '—'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Review status */}
                                <div style={{ fontSize: '0.83rem', display: 'grid', gap: '0.3rem' }}>
                                    <p style={{ margin: 0, fontWeight: 600 }}>Review Status</p>
                                    <p style={{ margin: 0 }}>
                                        <span style={{ color: 'var(--ink-muted)' }}>Requested: </span>
                                        {prStatus.reviewStatus.requested.length > 0
                                            ? prStatus.reviewStatus.requested.join(', ')
                                            : '—'}
                                    </p>
                                    <p style={{ margin: 0 }}>
                                        <span style={{ color: 'var(--ink-muted)' }}>Approved: </span>
                                        <span style={{ color: prStatus.reviewStatus.approved.length > 0 ? '#166534' : undefined }}>
                                            {prStatus.reviewStatus.approved.length > 0
                                                ? prStatus.reviewStatus.approved.join(', ')
                                                : '—'}
                                        </span>
                                    </p>
                                    <p style={{ margin: 0 }}>
                                        <span style={{ color: 'var(--ink-muted)' }}>Changes Requested: </span>
                                        <span style={{ color: prStatus.reviewStatus.changes_requested.length > 0 ? '#991b1b' : undefined }}>
                                            {prStatus.reviewStatus.changes_requested.length > 0
                                                ? prStatus.reviewStatus.changes_requested.join(', ')
                                                : '—'}
                                        </span>
                                    </p>
                                </div>

                                {/* Checklist from draft */}
                                {selectedDraft && selectedDraft.checklist.length > 0 && (
                                    <div>
                                        <p style={{ margin: '0 0 0.3rem', fontSize: '0.83rem', fontWeight: 600 }}>
                                            Checklist
                                        </p>
                                        <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.83rem' }}>
                                            {selectedDraft.checklist.map((item, i) => (
                                                <li key={i}>✓ {item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>
    );
}
