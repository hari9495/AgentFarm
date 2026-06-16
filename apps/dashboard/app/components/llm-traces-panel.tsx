'use client';

import { useCallback, useEffect, useState } from 'react';

type TraceRow = {
    id: string;
    name?: string;
    userId?: string;
    timestamp?: string;
    tags?: string[];
};

type Observation = {
    id: string;
    name?: string;
    model?: string;
    startTime?: string;
    endTime?: string;
    usage?: { input?: number; output?: number; total?: number };
    input?: unknown;
    output?: unknown;
    metadata?: Record<string, unknown>;
};

type TraceDetail = TraceRow & { observations?: Observation[] };

const fmtTime = (iso?: string): string => (iso ? new Date(iso).toLocaleString() : '—');

const latencyMs = (o: Observation): string => {
    if (!o.startTime || !o.endTime) return '—';
    const ms = new Date(o.endTime).getTime() - new Date(o.startTime).getTime();
    return Number.isFinite(ms) && ms >= 0 ? `${ms} ms` : '—';
};

const cost = (o: Observation): string => {
    const c = o.metadata?.['estimatedCostUsd'];
    return typeof c === 'number' ? `$${c.toFixed(6)}` : '—';
};

const asText = (v: unknown): string => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    try {
        return JSON.stringify(v, null, 2);
    } catch {
        return String(v);
    }
};

export function LlmTracesPanel() {
    const [traces, setTraces] = useState<TraceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notConfigured, setNotConfigured] = useState(false);
    const [selected, setSelected] = useState<string | null>(null);
    const [detail, setDetail] = useState<TraceDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const loadList = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/observability/llm-traces?limit=50', { cache: 'no-store' });
            if (res.status === 503) {
                setNotConfigured(true);
                setTraces([]);
                return;
            }
            if (!res.ok) {
                setError(`Failed to load traces (${res.status}).`);
                return;
            }
            const body = (await res.json()) as { traces?: TraceRow[] };
            setTraces(body.traces ?? []);
        } catch {
            setError('Failed to reach the observability service.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadList();
    }, [loadList]);

    const openTrace = useCallback(async (taskId: string) => {
        setSelected(taskId);
        setDetail(null);
        setDetailLoading(true);
        try {
            const res = await fetch(`/api/observability/llm-traces/${encodeURIComponent(taskId)}`, { cache: 'no-store' });
            if (res.ok) setDetail((await res.json()) as TraceDetail);
        } catch {
            /* surfaced via empty detail */
        } finally {
            setDetailLoading(false);
        }
    }, []);

    if (notConfigured) {
        return (
            <section className="card" style={{ padding: '1rem' }}>
                <p>
                    LLM tracing is not configured. Start the Langfuse stack (<code>docker compose --profile langfuse up</code>)
                    and set <code>LANGFUSE_HOST</code>, <code>LANGFUSE_PUBLIC_KEY</code> and <code>LANGFUSE_SECRET_KEY</code>.
                </p>
            </section>
        );
    }

    return (
        <section style={{ display: 'grid', gridTemplateColumns: detail || detailLoading ? '1fr 1fr' : '1fr', gap: '1rem' }}>
            <div className="card" style={{ padding: '1rem', overflowX: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <strong>Recent LLM traces</strong>
                    <button type="button" onClick={() => void loadList()} disabled={loading}>
                        {loading ? 'Loading…' : 'Refresh'}
                    </button>
                </div>
                {error && <p style={{ color: 'crimson' }}>{error}</p>}
                {!loading && !error && traces.length === 0 && <p>No traces yet. Run a task against a configured LLM provider.</p>}
                {traces.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                                <th style={{ padding: '0.4rem' }}>Time</th>
                                <th style={{ padding: '0.4rem' }}>Task</th>
                                <th style={{ padding: '0.4rem' }}>Name</th>
                                <th style={{ padding: '0.4rem' }}>Tags</th>
                            </tr>
                        </thead>
                        <tbody>
                            {traces.map((t) => (
                                <tr
                                    key={t.id}
                                    onClick={() => void openTrace(t.id)}
                                    style={{
                                        cursor: 'pointer',
                                        borderBottom: '1px solid #f0f0f0',
                                        background: selected === t.id ? 'rgba(0,120,255,0.08)' : undefined,
                                    }}
                                >
                                    <td style={{ padding: '0.4rem', whiteSpace: 'nowrap' }}>{fmtTime(t.timestamp)}</td>
                                    <td style={{ padding: '0.4rem', fontFamily: 'monospace' }}>{t.id}</td>
                                    <td style={{ padding: '0.4rem' }}>{t.name ?? '—'}</td>
                                    <td style={{ padding: '0.4rem' }}>{(t.tags ?? []).join(', ')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {(detail || detailLoading) && (
                <div className="card" style={{ padding: '1rem', overflowX: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <strong>Trace · {selected}</strong>
                        <button type="button" onClick={() => { setSelected(null); setDetail(null); }}>Close</button>
                    </div>
                    {detailLoading && <p>Loading trace…</p>}
                    {!detailLoading && detail && (
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                            {(detail.observations ?? []).length === 0 && <p>No generations recorded for this trace.</p>}
                            {(detail.observations ?? []).map((o) => (
                                <div key={o.id} style={{ border: '1px solid #eee', borderRadius: 6, padding: '0.6rem' }}>
                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                                        <span><strong>{o.name ?? 'generation'}</strong></span>
                                        <span>model: <code>{o.model ?? '—'}</code></span>
                                        <span>provider: {String(o.metadata?.['provider'] ?? '—')}</span>
                                        <span>
                                            tokens: {o.usage?.input ?? '—'} in / {o.usage?.output ?? '—'} out / {o.usage?.total ?? '—'} total
                                        </span>
                                        <span>cost: {cost(o)}</span>
                                        <span>latency: {latencyMs(o)}</span>
                                    </div>
                                    <details style={{ marginTop: '0.4rem' }}>
                                        <summary style={{ cursor: 'pointer' }}>Input / Output</summary>
                                        <div style={{ fontSize: '0.8rem' }}>
                                            <p style={{ marginBottom: 0 }}><strong>Input</strong></p>
                                            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>{asText(o.input)}</pre>
                                            <p style={{ marginBottom: 0 }}><strong>Output</strong></p>
                                            <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 220, overflow: 'auto' }}>{asText(o.output)}</pre>
                                        </div>
                                    </details>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </section>
    );
}
