'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

type Bot = { id: string; role: string; status: string; workspaceId: string };

type PreviewRow = { index: number; task_description: string; row: Record<string, string> };

type BatchResult = {
    batch_id: string;
    batch_name: string;
    total: number;
    status: string;
    dispatched_at: string;
};

type BatchDetail = {
    batch_id: string;
    batch_name: string;
    to_agent_id: string;
    status: string;
    total: number;
    completed: number;
    failed: number;
    queued: number;
    started_at: string;
    completed_at: string | null;
    tasks: Array<{ dispatch_id: string; index: number; task_description: string; status: string }>;
};

type Step = 1 | 2 | 3 | 4;

// ── CSV parsing ────────────────────────────────────────────────────────────

function parseCsv(text: string): Record<string, string>[] {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = (lines[0] ?? '').split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1)
        .filter((l) => l.trim())
        .map((line) => {
            const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
            const row: Record<string, string> = {};
            headers.forEach((h, i) => { row[h] = cols[i] ?? ''; });
            return row;
        });
}

// ── Helpers ────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const progressPct = (b: BatchDetail) =>
    b.total > 0 ? Math.round(((b.completed + b.failed) / b.total) * 100) : 0;

// ── Component ──────────────────────────────────────────────────────────────

export default function BatchTasksClient({ workspaceIds }: { workspaceIds: string[] }) {
    const [workspaceId, setWorkspaceId] = useState(workspaceIds[0] ?? '');
    const [step, setStep] = useState<Step>(1);
    const [bots, setBots] = useState<Bot[]>([]);
    const [toAgentId, setToAgentId] = useState('');
    const [template, setTemplate] = useState('');
    const [batchName, setBatchName] = useState('');
    const [rows, setRows] = useState<Record<string, string>[]>([]);
    const [csvError, setCsvError] = useState<string | null>(null);
    const [preview, setPreview] = useState<PreviewRow[]>([]);
    const [variables, setVariables] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [recentBatches, setRecentBatches] = useState<BatchResult[]>([]);
    const [selectedBatch, setSelectedBatch] = useState<BatchDetail | null>(null);
    const [batchLoading, setBatchLoading] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Fetch bots
    useEffect(() => {
        void (async () => {
            const res = await fetch('/api/agents');
            if (!res.ok) return;
            // The gateway returns { bots: [...] }; accept legacy { agents } too.
            const data = (await res.json()) as { bots?: Bot[]; agents?: Bot[] };
            const botsData = data.bots ?? data.agents ?? [];
            setBots(botsData);
            if (botsData.length > 0 && !toAgentId) setToAgentId(botsData[0]?.id ?? '');
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Fetch recent batches
    const fetchRecentBatches = useCallback(async () => {
        const params = new URLSearchParams({ limit: '10' });
        if (workspaceId) params.set('workspace_id', workspaceId);
        const res = await fetch(`/api/batch-dispatch?${params.toString()}`);
        if (!res.ok) return;
        const data = (await res.json()) as { batches?: BatchResult[] };
        setRecentBatches(data.batches ?? []);
    }, [workspaceId]);

    useEffect(() => { void fetchRecentBatches(); }, [fetchRecentBatches]);

    // Poll selected batch progress
    const pollBatch = useCallback(async (batchId: string) => {
        setBatchLoading(true);
        try {
            const res = await fetch(`/api/batch-dispatch/${encodeURIComponent(batchId)}`);
            if (!res.ok) return;
            const data = (await res.json()) as BatchDetail;
            setSelectedBatch(data);
            if (data.status === 'completed' || data.status === 'failed') {
                if (pollRef.current) clearInterval(pollRef.current);
            }
        } finally {
            setBatchLoading(false);
        }
    }, []);

    // Preview generation
    const generatePreview = useCallback(async () => {
        if (!template || rows.length === 0) return;
        try {
            const res = await fetch('/api/batch-dispatch/preview', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ template, rows }),
            });
            if (!res.ok) return;
            const data = (await res.json()) as { variables: string[]; preview: PreviewRow[] };
            setVariables(data.variables ?? []);
            setPreview(data.preview ?? []);
        } catch {
            // non-fatal
        }
    }, [template, rows]);

    useEffect(() => { void generatePreview(); }, [generatePreview]);

    // Handle CSV upload
    const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCsvError(null);
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target?.result as string;
            const parsed = parseCsv(text);
            if (parsed.length === 0) {
                setCsvError('CSV must have a header row and at least one data row.');
                return;
            }
            if (parsed.length > 200) {
                setCsvError('Maximum 200 rows per batch.');
                return;
            }
            setRows(parsed);
        };
        reader.readAsText(file);
    };

    // Handle manual row input (textarea of JSON-like simple format)
    const handleManualRows = (text: string) => {
        // Try CSV format
        const parsed = parseCsv(text);
        if (parsed.length > 0) {
            setRows(parsed);
            setCsvError(null);
        }
    };

    // Submit batch
    const handleSubmit = async () => {
        if (!toAgentId || !template || rows.length === 0) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            const res = await fetch('/api/batch-dispatch', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    to_agent_id: toAgentId,
                    workspace_id: workspaceId,
                    template,
                    rows,
                    batch_name: batchName || undefined,
                }),
            });
            const data = (await res.json().catch(() => ({}))) as {
                batch_id?: string;
                error?: string;
                message?: string;
            };
            if (!res.ok) {
                setSubmitError(data.message ?? data.error ?? 'Submission failed.');
                return;
            }
            // Switch to history and poll the new batch
            setStep(1);
            await fetchRecentBatches();
            if (data.batch_id) {
                await pollBatch(data.batch_id);
                pollRef.current = setInterval(() => { void pollBatch(data.batch_id!); }, 8_000);
            }
            // Reset form
            setTemplate('');
            setBatchName('');
            setRows([]);
            setPreview([]);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } finally {
            setSubmitting(false);
        }
    };

    const selectedBotRole = bots.find((b) => b.id === toAgentId)?.role ?? '';
    const hasRows = rows.length > 0;
    const hasTemplate = template.trim().length > 0;
    const cols = rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
            {/* Workspace selector */}
            {workspaceIds.length > 1 && (
                <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="approval-select" style={{ width: 220 }}>
                    {workspaceIds.map((id) => <option key={id} value={id}>{id}</option>)}
                </select>
            )}

            {/* Step tabs */}
            <div style={{ display: 'flex', gap: '0.25rem', borderBottom: '2px solid var(--line)' }}>
                {([
                    [1, '1. Agent & Template'],
                    [2, '2. Upload CSV'],
                    [3, '3. Preview'],
                    [4, '4. Submit'],
                ] as [Step, string][]).map(([s, label]) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setStep(s)}
                        style={{
                            padding: '0.5rem 1rem',
                            border: 'none',
                            borderBottom: step === s ? '2px solid var(--accent)' : '2px solid transparent',
                            background: 'transparent',
                            color: step === s ? 'var(--accent)' : 'var(--ink-muted)',
                            fontWeight: step === s ? 700 : 500,
                            fontSize: '0.84rem',
                            cursor: 'pointer',
                            marginBottom: -2,
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Step 1: Agent & Template ── */}
            {step === 1 && (
                <div className="card" style={{ display: 'grid', gap: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Select agent and write your task template</h3>

                    <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 600 }}>
                        Agent
                        <select value={toAgentId} onChange={(e) => setToAgentId(e.target.value)} className="approval-select" style={{ width: '100%' }}>
                            {bots.map((b) => (
                                <option key={b.id} value={b.id}>
                                    {b.role.replace(/_/g, ' ')} ({b.id.slice(0, 12)}…)
                                </option>
                            ))}
                            {bots.length === 0 && <option value="">No agents found</option>}
                        </select>
                    </label>

                    <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 600 }}>
                        Batch name <span style={{ fontWeight: 400, color: 'var(--ink-muted)' }}>(optional)</span>
                        <input
                            type="text"
                            value={batchName}
                            onChange={(e) => setBatchName(e.target.value)}
                            placeholder="e.g. June 2026 prospect research"
                            className="approval-input"
                        />
                    </label>

                    <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 600 }}>
                        Task template
                        <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 400 }}>
                            Use <code style={{ fontFamily: 'ui-monospace, monospace', background: 'var(--bg)', padding: '0 3px', borderRadius: 3 }}>{'{{column_name}}'}</code> to insert CSV values.
                        </div>
                        <textarea
                            value={template}
                            onChange={(e) => setTemplate(e.target.value)}
                            rows={4}
                            placeholder={`e.g. Research prospect {{name}} at {{company}} (email: {{email}}). Find their LinkedIn, key interests, and draft a personalised outreach email.`}
                            style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.4rem', border: '1px solid var(--line)', fontSize: '0.85rem', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box', outline: 'none' }}
                        />
                    </label>

                    {variables.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                            <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>Variables detected:</span>
                            {variables.map((v) => (
                                <code key={v} style={{ background: 'var(--info-bg)', color: 'var(--info)', padding: '0.1rem 0.4rem', borderRadius: '0.2rem', fontFamily: 'ui-monospace, monospace' }}>
                                    {'{{'}{v}{'}}'}
                                </code>
                            ))}
                        </div>
                    )}

                    <button
                        type="button"
                        className="primary-action"
                        onClick={() => setStep(2)}
                        disabled={!hasTemplate || !toAgentId}
                    >
                        Next: Upload CSV →
                    </button>
                </div>
            )}

            {/* ── Step 2: CSV Upload ── */}
            {step === 2 && (
                <div className="card" style={{ display: 'grid', gap: '1rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Upload your CSV</h3>

                    {variables.length > 0 && (
                        <div style={{ padding: '0.65rem 0.75rem', background: 'color-mix(in srgb, var(--accent) 5%, transparent)', borderRadius: '0.4rem', border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)', fontSize: '0.8rem', color: 'var(--info)' }}>
                            Your template expects columns: <strong>{variables.join(', ')}</strong>
                        </div>
                    )}

                    <label style={{ display: 'grid', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 600 }}>
                        Upload CSV file
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,text/csv"
                            onChange={handleCsvUpload}
                            style={{ fontSize: '0.82rem' }}
                        />
                    </label>

                    <div style={{ textAlign: 'center', color: 'var(--ink-muted)', fontSize: '0.78rem' }}>— or paste CSV text below —</div>

                    <textarea
                        rows={6}
                        placeholder={`name,company,email\nAlice Smith,Acme Corp,alice@acme.com\nBob Jones,Widgets Inc,bob@widgets.com`}
                        onChange={(e) => handleManualRows(e.target.value)}
                        style={{ width: '100%', padding: '0.6rem 0.75rem', borderRadius: '0.4rem', border: '1px solid var(--line)', fontSize: '0.82rem', fontFamily: 'ui-monospace, monospace', lineHeight: 1.5, boxSizing: 'border-box', resize: 'vertical', outline: 'none' }}
                    />

                    {csvError && <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.82rem' }}>⚠ {csvError}</p>}

                    {hasRows && (
                        <div style={{ padding: '0.6rem 0.75rem', background: 'var(--ok-bg)', borderRadius: '0.4rem', border: '1px solid var(--ok-border)', fontSize: '0.82rem', color: 'var(--ok)' }}>
                            ✓ <strong>{rows.length} rows</strong> loaded with columns: <strong>{cols.join(', ')}</strong>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button type="button" className="chip-button" onClick={() => setStep(1)}>← Back</button>
                        <button type="button" className="primary-action" onClick={() => setStep(3)} disabled={!hasRows}>
                            Next: Preview →
                        </button>
                    </div>
                </div>
            )}

            {/* ── Step 3: Preview ── */}
            {step === 3 && (
                <div className="card" style={{ display: 'grid', gap: '0.85rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>
                            Preview — {rows.length} task{rows.length !== 1 ? 's' : ''} for{' '}
                            <span style={{ color: 'var(--accent)' }}>{selectedBotRole || toAgentId}</span>
                        </h3>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                        Showing first {Math.min(preview.length, 5)} expanded tasks. All {rows.length} will be dispatched.
                    </p>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                        {preview.map((p) => (
                            <div key={p.index} style={{ padding: '0.65rem 0.75rem', background: 'var(--bg)', borderRadius: '0.4rem', border: '1px solid var(--line)' }}>
                                <div style={{ fontSize: '0.72rem', color: 'var(--ink-muted)', fontWeight: 700, marginBottom: '0.2rem' }}>
                                    Task #{p.index + 1}
                                </div>
                                <div style={{ fontSize: '0.83rem', color: 'var(--ink)', lineHeight: 1.5 }}>
                                    {p.task_description}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button type="button" className="chip-button" onClick={() => setStep(2)}>← Back</button>
                        <button type="button" className="primary-action" onClick={() => setStep(4)}>
                            Next: Submit →
                        </button>
                    </div>
                </div>
            )}

            {/* ── Step 4: Submit ── */}
            {step === 4 && (
                <div className="card" style={{ display: 'grid', gap: '0.85rem' }}>
                    <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Ready to submit</h3>
                    <div style={{ display: 'grid', gap: '0.4rem', fontSize: '0.83rem', color: 'var(--ink-soft)' }}>
                        <div><strong>Agent:</strong> {selectedBotRole || toAgentId}</div>
                        <div><strong>Tasks:</strong> {rows.length}</div>
                        {batchName && <div><strong>Batch name:</strong> {batchName}</div>}
                        <div><strong>Template:</strong> <em style={{ color: 'var(--ink-muted)' }}>{template.slice(0, 120)}{template.length > 120 ? '…' : ''}</em></div>
                    </div>
                    {submitError && <p style={{ margin: 0, color: 'var(--danger)', fontSize: '0.82rem' }}>⚠ {submitError}</p>}
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button type="button" className="chip-button" onClick={() => setStep(3)} disabled={submitting}>← Back</button>
                        <button
                            type="button"
                            className="primary-action"
                            onClick={() => void handleSubmit()}
                            disabled={submitting}
                        >
                            {submitting ? `Dispatching ${rows.length} tasks…` : `🚀 Dispatch ${rows.length} tasks`}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Selected batch detail ── */}
            {selectedBatch && (
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <h3 style={{ margin: 0, fontSize: '0.9rem' }}>{selectedBatch.batch_name}</h3>
                        <button type="button" className="chip-button" onClick={() => setSelectedBatch(null)}>Close</button>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--ink-muted)', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                        <span>Total: <strong>{selectedBatch.total}</strong></span>
                        <span style={{ color: 'var(--ok)' }}>✓ {selectedBatch.completed} done</span>
                        {selectedBatch.failed > 0 && <span style={{ color: 'var(--danger)' }}>✗ {selectedBatch.failed} failed</span>}
                        {selectedBatch.queued > 0 && <span>⏳ {selectedBatch.queued} queued</span>}
                    </div>
                    <div style={{ height: 8, background: 'var(--bg)', borderRadius: 9999, overflow: 'hidden', marginBottom: '0.75rem', display: 'flex' }}>
                        <div style={{ height: '100%', width: `${(selectedBatch.completed / selectedBatch.total * 100).toFixed(1)}%`, background: 'var(--ok)', transition: 'width 0.4s' }} />
                        <div style={{ height: '100%', width: `${(selectedBatch.failed / selectedBatch.total * 100).toFixed(1)}%`, background: 'var(--danger)' }} />
                    </div>
                    <div style={{ maxHeight: 240, overflowY: 'auto', display: 'grid', gap: '0.3rem' }}>
                        {selectedBatch.tasks.slice(0, 20).map((t) => (
                            <div key={t.dispatch_id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', fontSize: '0.78rem', padding: '0.3rem 0', borderBottom: '1px solid var(--line)' }}>
                                <span style={{ minWidth: 22, color: 'var(--ink-muted)', fontFamily: 'ui-monospace, monospace' }}>#{t.index + 1}</span>
                                <span style={{ flex: 1, color: 'var(--ink-soft)' }}>{t.task_description.slice(0, 100)}{t.task_description.length > 100 ? '…' : ''}</span>
                                <span style={{ color: t.status === 'completed' ? 'var(--ok)' : t.status === 'failed' ? 'var(--danger)' : 'var(--ink-muted)', fontWeight: 600, flexShrink: 0 }}>
                                    {t.status}
                                </span>
                            </div>
                        ))}
                    </div>
                    {batchLoading && <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--ink-muted)' }}>Updating…</p>}
                </div>
            )}

            {/* ── Recent batches ── */}
            {recentBatches.length > 0 && (
                <div className="card">
                    <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9rem' }}>Recent batches</h3>
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                        {recentBatches.map((b) => {
                            const pct = progressPct(b as unknown as BatchDetail);
                            return (
                                <div
                                    key={b.batch_id}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => { void pollBatch(b.batch_id); }}
                                    onKeyDown={(e) => { if (e.key === 'Enter') void pollBatch(b.batch_id); }}
                                    style={{ padding: '0.65rem 0.75rem', background: 'var(--bg)', borderRadius: '0.4rem', border: '1px solid var(--line)', cursor: 'pointer' }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', marginBottom: '0.25rem', flexWrap: 'wrap', gap: '0.3rem' }}>
                                        <span style={{ fontWeight: 600 }}>{b.batch_name}</span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{fmtDate(b.dispatched_at)}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                        <div style={{ flex: 1, height: 5, background: 'var(--line)', borderRadius: 9999, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${pct}%`, background: b.status === 'failed' ? 'var(--danger)' : 'var(--ok)', transition: 'width 0.4s' }} />
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', flexShrink: 0 }}>
                                            {b.total} tasks · {b.status}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
