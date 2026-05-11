'use client';

import { useEffect, useState, useCallback } from 'react';

type ScheduledReportsPanelProps = { tenantId: string };

type ScheduledReport = {
    id: string;
    tenantId: string;
    workspaceId: string;
    name: string;
    recipientEmail: string;
    frequency: string;
    reportTypes: string[];
    enabled: boolean;
    lastSentAt: string | null;
    nextSendAt: string;
    createdAt: string;
    updatedAt: string;
};

const FREQ_BADGE: Record<string, { bg: string; color: string }> = {
    daily: { bg: '#dbeafe', color: '#1d4ed8' },
    weekly: { bg: '#dcfce7', color: '#166534' },
    monthly: { bg: '#f3e8ff', color: '#7c3aed' },
};

export default function ScheduledReportsPanel({ tenantId: _tenantId }: ScheduledReportsPanelProps) {
    const [reports, setReports] = useState<ScheduledReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    // Create form fields
    const [newName, setNewName] = useState('');
    const [newWorkspaceId, setNewWorkspaceId] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newFrequency, setNewFrequency] = useState('weekly');
    const [newReportTypes, setNewReportTypes] = useState<string[]>(['cost']);
    const [newEnabled, setNewEnabled] = useState(true);

    // Edit form fields
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editFrequency, setEditFrequency] = useState('weekly');
    const [editReportTypes, setEditReportTypes] = useState<string[]>([]);
    const [editEnabled, setEditEnabled] = useState(true);

    const fetchReports = useCallback(async () => {
        try {
            const res = await fetch('/api/scheduled-reports', { cache: 'no-store' });
            const data = (await res.json()) as { reports?: ScheduledReport[]; error?: string };
            if (!res.ok) {
                setError(data.error ?? 'Failed to load scheduled reports.');
            } else {
                setReports(data.reports ?? []);
                setError(null);
            }
        } catch {
            setError('Network error loading scheduled reports.');
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        fetchReports().finally(() => setLoading(false));
    }, [fetchReports]);

    function toggleReportType(
        list: string[],
        setList: (v: string[]) => void,
        value: string,
    ) {
        if (list.includes(value)) {
            setList(list.filter((v) => v !== value));
        } else {
            setList([...list, value]);
        }
    }

    async function handleCreate() {
        if (!newName.trim()) { setError('Name is required.'); return; }
        if (!newWorkspaceId.trim()) { setError('Workspace ID is required.'); return; }
        if (!newEmail.includes('@')) { setError('Valid recipient email is required.'); return; }
        if (newReportTypes.length === 0) { setError('At least one report type must be selected.'); return; }

        setCreating(true);
        setError(null);
        try {
            const res = await fetch('/api/scheduled-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newName,
                    workspaceId: newWorkspaceId,
                    recipientEmail: newEmail,
                    frequency: newFrequency,
                    reportTypes: newReportTypes,
                    enabled: newEnabled,
                }),
            });
            const data = (await res.json()) as { report?: ScheduledReport; error?: string };
            if (!res.ok) {
                setError(data.error ?? 'Failed to create report.');
                return;
            }
            setNewName('');
            setNewWorkspaceId('');
            setNewEmail('');
            setNewFrequency('weekly');
            setNewReportTypes(['cost']);
            setNewEnabled(true);
            await fetchReports();
        } catch {
            setError('Network error creating report.');
        } finally {
            setCreating(false);
        }
    }

    function openEdit(report: ScheduledReport) {
        setEditing(report.id);
        setEditName(report.name);
        setEditEmail(report.recipientEmail);
        setEditFrequency(report.frequency);
        setEditReportTypes([...report.reportTypes]);
        setEditEnabled(report.enabled);
    }

    async function handleSave() {
        if (!editing) return;
        try {
            const res = await fetch(`/api/scheduled-reports/${encodeURIComponent(editing)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: editName,
                    recipientEmail: editEmail,
                    frequency: editFrequency,
                    reportTypes: editReportTypes,
                    enabled: editEnabled,
                }),
            });
            const data = (await res.json()) as { report?: ScheduledReport; error?: string };
            if (!res.ok) {
                setError(data.error ?? 'Failed to update report.');
                return;
            }
            setEditing(null);
            await fetchReports();
        } catch {
            setError('Network error updating report.');
        }
    }

    async function handleDelete(report: ScheduledReport) {
        if (!window.confirm(`Delete scheduled report "${report.name}"? This cannot be undone.`)) return;
        setDeleting(report.id);
        try {
            const res = await fetch(`/api/scheduled-reports/${encodeURIComponent(report.id)}`, {
                method: 'DELETE',
            });
            const data = (await res.json()) as { deleted?: boolean; error?: string };
            if (!res.ok) {
                setError(data.error ?? 'Failed to delete report.');
                return;
            }
            await fetchReports();
        } catch {
            setError('Network error deleting report.');
        } finally {
            setDeleting(null);
        }
    }

    const TH: React.CSSProperties = { padding: '0.5rem 0.75rem', color: 'var(--ink-muted)', fontWeight: 500 };
    const TD: React.CSSProperties = { padding: '0.65rem 0.75rem' };
    const TD_MUTED: React.CSSProperties = { padding: '0.65rem 0.75rem', color: 'var(--ink-muted)', fontSize: '0.8rem' };
    const FIELD_STYLE: React.CSSProperties = {
        padding: '0.35rem 0.5rem',
        fontSize: '0.85rem',
        border: '1px solid var(--line)',
        borderRadius: '4px',
        background: 'var(--bg)',
        color: 'var(--ink)',
        width: '100%',
    };

    return (
        <section className="card" style={{ marginBottom: '2rem' }}>

            {/* ── Create form ── */}
            <div style={{ marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--line)' }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '1rem' }}>
                    Create Scheduled Report
                </h2>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '0.75rem',
                        marginBottom: '0.75rem',
                    }}
                >
                    <div>
                        <label
                            style={{ display: 'block', fontSize: '0.8rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}
                        >
                            Name
                        </label>
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="e.g. Weekly Cost Summary"
                            style={FIELD_STYLE}
                        />
                    </div>
                    <div>
                        <label
                            style={{ display: 'block', fontSize: '0.8rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}
                        >
                            Workspace ID
                        </label>
                        <input
                            type="text"
                            value={newWorkspaceId}
                            onChange={(e) => setNewWorkspaceId(e.target.value)}
                            placeholder="ws_..."
                            style={FIELD_STYLE}
                        />
                    </div>
                    <div>
                        <label
                            style={{ display: 'block', fontSize: '0.8rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}
                        >
                            Recipient Email
                        </label>
                        <input
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="team@example.com"
                            style={FIELD_STYLE}
                        />
                    </div>
                    <div>
                        <label
                            style={{ display: 'block', fontSize: '0.8rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}
                        >
                            Frequency
                        </label>
                        <select
                            value={newFrequency}
                            onChange={(e) => setNewFrequency(e.target.value)}
                            style={FIELD_STYLE}
                        >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                        </select>
                    </div>
                </div>
                <div
                    style={{
                        display: 'flex',
                        gap: '1.5rem',
                        flexWrap: 'wrap',
                        marginBottom: '0.75rem',
                        alignItems: 'center',
                    }}
                >
                    <div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginRight: '0.5rem' }}>
                            Report Types:
                        </span>
                        <label
                            style={{
                                fontSize: '0.85rem',
                                color: 'var(--ink)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                marginRight: '0.75rem',
                                cursor: 'pointer',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={newReportTypes.includes('cost')}
                                onChange={() => toggleReportType(newReportTypes, setNewReportTypes, 'cost')}
                            />
                            Cost
                        </label>
                        <label
                            style={{
                                fontSize: '0.85rem',
                                color: 'var(--ink)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                cursor: 'pointer',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={newReportTypes.includes('performance')}
                                onChange={() => toggleReportType(newReportTypes, setNewReportTypes, 'performance')}
                            />
                            Performance
                        </label>
                    </div>
                    <label
                        style={{
                            fontSize: '0.85rem',
                            color: 'var(--ink)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            cursor: 'pointer',
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={newEnabled}
                            onChange={(e) => setNewEnabled(e.target.checked)}
                        />
                        Enabled
                    </label>
                </div>
                <button
                    onClick={() => { void handleCreate(); }}
                    disabled={creating}
                    style={{
                        padding: '0.4rem 1rem',
                        fontSize: '0.85rem',
                        border: '1px solid var(--line)',
                        borderRadius: '4px',
                        background: 'var(--ink)',
                        color: 'var(--bg)',
                        cursor: creating ? 'not-allowed' : 'pointer',
                        opacity: creating ? 0.6 : 1,
                    }}
                >
                    {creating ? 'Creating…' : 'Create Report'}
                </button>
            </div>

            {/* ── Header ── */}
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '1rem' }}>
                Scheduled Reports
            </h2>

            {/* ── Error banner ── */}
            {error && (
                <div
                    style={{
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        padding: '0.65rem 0.9rem',
                        color: '#dc2626',
                        fontSize: '0.85rem',
                        marginBottom: '0.75rem',
                    }}
                >
                    {error}
                </div>
            )}

            {/* ── Table ── */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--line)', textAlign: 'left' }}>
                            <th style={TH}>Name</th>
                            <th style={TH}>Email</th>
                            <th style={TH}>Frequency</th>
                            <th style={TH}>Types</th>
                            <th style={TH}>Enabled</th>
                            <th style={TH}>Last Sent</th>
                            <th style={TH}>Next Send</th>
                            <th style={TH}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading && (
                            <tr>
                                <td
                                    colSpan={8}
                                    style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-muted)' }}
                                >
                                    Loading…
                                </td>
                            </tr>
                        )}
                        {!loading && reports.length === 0 && (
                            <tr>
                                <td
                                    colSpan={8}
                                    style={{
                                        padding: '2rem',
                                        textAlign: 'center',
                                        color: 'var(--ink-muted)',
                                        fontStyle: 'italic',
                                    }}
                                >
                                    No scheduled reports yet. Create one above.
                                </td>
                            </tr>
                        )}
                        {!loading &&
                            reports.map((report) => {
                                const freqStyle = FREQ_BADGE[report.frequency] ?? FREQ_BADGE['weekly'];
                                return (
                                    <tr key={report.id} style={{ borderBottom: '1px solid var(--line)' }}>
                                        <td style={{ ...TD, fontWeight: 500, color: 'var(--ink)' }}>
                                            {report.name}
                                        </td>
                                        <td style={TD_MUTED}>{report.recipientEmail}</td>
                                        <td style={TD}>
                                            <span
                                                style={{
                                                    display: 'inline-block',
                                                    padding: '0.15rem 0.5rem',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 600,
                                                    background: freqStyle.bg,
                                                    color: freqStyle.color,
                                                }}
                                            >
                                                {report.frequency}
                                            </span>
                                        </td>
                                        <td style={TD_MUTED}>{report.reportTypes.join(', ')}</td>
                                        <td style={TD}>
                                            {report.enabled ? (
                                                <span
                                                    style={{ color: '#166534', fontWeight: 600, fontSize: '0.85rem' }}
                                                >
                                                    ✓ Active
                                                </span>
                                            ) : (
                                                <span
                                                    style={{ color: '#475569', fontWeight: 600, fontSize: '0.85rem' }}
                                                >
                                                    ✗ Paused
                                                </span>
                                            )}
                                        </td>
                                        <td style={TD_MUTED}>
                                            {report.lastSentAt
                                                ? new Date(report.lastSentAt).toLocaleString()
                                                : 'Never'}
                                        </td>
                                        <td style={TD_MUTED}>
                                            {new Date(report.nextSendAt).toLocaleString()}
                                        </td>
                                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                                                <button
                                                    onClick={() => {
                                                        if (editing === report.id) {
                                                            setEditing(null);
                                                        } else {
                                                            openEdit(report);
                                                        }
                                                    }}
                                                    style={{
                                                        padding: '0.25rem 0.6rem',
                                                        fontSize: '0.75rem',
                                                        border: '1px solid var(--line)',
                                                        borderRadius: '4px',
                                                        background: 'var(--bg)',
                                                        color: 'var(--ink)',
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    {editing === report.id ? 'Close' : 'Edit'}
                                                </button>
                                                <button
                                                    onClick={() => { void handleDelete(report); }}
                                                    disabled={deleting === report.id}
                                                    style={{
                                                        padding: '0.25rem 0.6rem',
                                                        fontSize: '0.75rem',
                                                        border: '1px solid #fecaca',
                                                        borderRadius: '4px',
                                                        background: '#fff',
                                                        color: '#dc2626',
                                                        cursor: deleting === report.id ? 'not-allowed' : 'pointer',
                                                        opacity: deleting === report.id ? 0.6 : 1,
                                                    }}
                                                >
                                                    {deleting === report.id ? 'Deleting…' : 'Delete'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                    </tbody>
                </table>
            </div>

            {/* ── Edit form (below table) ── */}
            {editing && (
                <div
                    style={{
                        marginTop: '1rem',
                        padding: '1rem',
                        background: 'var(--bg)',
                        border: '1px solid var(--line)',
                        borderRadius: '8px',
                    }}
                >
                    <p
                        style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            letterSpacing: '0.06em',
                            textTransform: 'uppercase',
                            color: 'var(--ink-muted)',
                            marginBottom: '0.75rem',
                        }}
                    >
                        Edit — {reports.find((r) => r.id === editing)?.name ?? editing}
                    </p>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: '0.75rem',
                            marginBottom: '0.75rem',
                        }}
                    >
                        <div>
                            <label
                                style={{ display: 'block', fontSize: '0.8rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}
                            >
                                Name
                            </label>
                            <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                style={FIELD_STYLE}
                            />
                        </div>
                        <div>
                            <label
                                style={{ display: 'block', fontSize: '0.8rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}
                            >
                                Recipient Email
                            </label>
                            <input
                                type="email"
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                style={FIELD_STYLE}
                            />
                        </div>
                        <div>
                            <label
                                style={{ display: 'block', fontSize: '0.8rem', color: 'var(--ink-muted)', marginBottom: '0.25rem' }}
                            >
                                Frequency
                            </label>
                            <select
                                value={editFrequency}
                                onChange={(e) => setEditFrequency(e.target.value)}
                                style={FIELD_STYLE}
                            >
                                <option value="daily">Daily</option>
                                <option value="weekly">Weekly</option>
                                <option value="monthly">Monthly</option>
                            </select>
                        </div>
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            gap: '1.5rem',
                            flexWrap: 'wrap',
                            marginBottom: '0.75rem',
                            alignItems: 'center',
                        }}
                    >
                        <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', marginRight: '0.5rem' }}>
                                Report Types:
                            </span>
                            <label
                                style={{
                                    fontSize: '0.85rem',
                                    color: 'var(--ink)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    marginRight: '0.75rem',
                                    cursor: 'pointer',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={editReportTypes.includes('cost')}
                                    onChange={() => toggleReportType(editReportTypes, setEditReportTypes, 'cost')}
                                />
                                Cost
                            </label>
                            <label
                                style={{
                                    fontSize: '0.85rem',
                                    color: 'var(--ink)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.3rem',
                                    cursor: 'pointer',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={editReportTypes.includes('performance')}
                                    onChange={() =>
                                        toggleReportType(editReportTypes, setEditReportTypes, 'performance')
                                    }
                                />
                                Performance
                            </label>
                        </div>
                        <label
                            style={{
                                fontSize: '0.85rem',
                                color: 'var(--ink)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.3rem',
                                cursor: 'pointer',
                            }}
                        >
                            <input
                                type="checkbox"
                                checked={editEnabled}
                                onChange={(e) => setEditEnabled(e.target.checked)}
                            />
                            Enabled
                        </label>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={() => { void handleSave(); }}
                            style={{
                                padding: '0.4rem 1rem',
                                fontSize: '0.85rem',
                                border: '1px solid var(--line)',
                                borderRadius: '4px',
                                background: 'var(--ink)',
                                color: 'var(--bg)',
                                cursor: 'pointer',
                            }}
                        >
                            Save
                        </button>
                        <button
                            onClick={() => setEditing(null)}
                            style={{
                                padding: '0.4rem 1rem',
                                fontSize: '0.85rem',
                                border: '1px solid var(--line)',
                                borderRadius: '4px',
                                background: 'var(--bg)',
                                color: 'var(--ink)',
                                cursor: 'pointer',
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
