'use client';

import { useCallback, useEffect, useState } from 'react';

type TraceRow = { id: string; name?: string; timestamp?: string; tags?: string[] };

type Observation = {
    id: string;
    name?: string;
    model?: string;
    startTime?: string;
    endTime?: string;
    usage?: { input?: number; output?: number; total?: number };
    metadata?: Record<string, unknown>;
};

type TraceDetail = TraceRow & { observations?: Observation[]; redacted?: boolean };

const fmtTime = (iso?: string): string => (iso ? new Date(iso).toLocaleString() : '—');

const latencyMs = (o: Observation): string => {
    if (!o.startTime || !o.endTime) return '—';
    const ms = new Date(o.endTime).getTime() - new Date(o.startTime).getTime();
    return Number.isFinite(ms) && ms >= 0 ? `${ms} ms` : '—';
};

const costOf = (o: Observation): string => {
    const c = o.metadata?.['estimatedCostUsd'];
    return typeof c === 'number' ? `$${c.toFixed(6)}` : '—';
};

export default function TracesClient() {
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
            const res = await fetch('/api/dashboard/llm-traces?limit=50', { cache: 'no-store' });
            if (res.status === 503) {
                setNotConfigured(true);
                return;
            }
            if (!res.ok) {
                setError(`Failed to load traces (${res.status}).`);
                return;
            }
            const body = (await res.json()) as { traces?: TraceRow[] };
            setTraces(body.traces ?? []);
        } catch {
            setError('Unable to reach the observability service.');
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
            const res = await fetch(`/api/dashboard/llm-traces/${encodeURIComponent(taskId)}`, { cache: 'no-store' });
            if (res.ok) setDetail((await res.json()) as TraceDetail);
        } catch {
            /* surfaced via empty detail */
        } finally {
            setDetailLoading(false);
        }
    }, []);

    if (notConfigured) {
        return <p className="text-sm text-muted-foreground">LLM trace data is not available yet.</p>;
    }

    return (
        <div className="grid gap-4" style={{ gridTemplateColumns: detail || detailLoading ? '1fr 1fr' : '1fr' }}>
            <div className="rounded-lg border p-4 overflow-x-auto">
                <div className="flex items-center justify-between mb-2">
                    <strong>Recent tasks</strong>
                    <button type="button" className="text-sm underline" onClick={() => void loadList()} disabled={loading}>
                        {loading ? 'Loading…' : 'Refresh'}
                    </button>
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                {!loading && !error && traces.length === 0 && (
                    <p className="text-sm text-muted-foreground">No tasks have run yet.</p>
                )}
                {traces.length > 0 && (
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr className="text-left border-b">
                                <th className="py-2">Time</th>
                                <th className="py-2">Task</th>
                                <th className="py-2">Type</th>
                            </tr>
                        </thead>
                        <tbody>
                            {traces.map((t) => (
                                <tr
                                    key={t.id}
                                    onClick={() => void openTrace(t.id)}
                                    className="cursor-pointer border-b hover:bg-muted/40"
                                    style={{ background: selected === t.id ? 'rgba(0,120,255,0.08)' : undefined }}
                                >
                                    <td className="py-2 whitespace-nowrap">{fmtTime(t.timestamp)}</td>
                                    <td className="py-2 font-mono text-xs">{t.id}</td>
                                    <td className="py-2">{(t.tags ?? []).filter((x) => x !== 'decision').join(', ') || (t.name ?? '—')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {(detail || detailLoading) && (
                <div className="rounded-lg border p-4 overflow-x-auto">
                    <div className="flex items-center justify-between mb-2">
                        <strong className="font-mono text-sm">{selected}</strong>
                        <button type="button" className="text-sm underline" onClick={() => { setSelected(null); setDetail(null); }}>
                            Close
                        </button>
                    </div>
                    {detailLoading && <p className="text-sm">Loading…</p>}
                    {!detailLoading && detail && (
                        <div className="space-y-3">
                            {(detail.observations ?? []).length === 0 && (
                                <p className="text-sm text-muted-foreground">No model calls recorded for this task.</p>
                            )}
                            {(detail.observations ?? []).map((o) => (
                                <div key={o.id} className="rounded-md border p-3 text-sm">
                                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                                        <span>model: <code>{o.model ?? '—'}</code></span>
                                        <span>provider: {String(o.metadata?.['provider'] ?? '—')}</span>
                                        <span>tokens: {o.usage?.input ?? '—'} in / {o.usage?.output ?? '—'} out / {o.usage?.total ?? '—'} total</span>
                                        <span>cost: {costOf(o)}</span>
                                        <span>latency: {latencyMs(o)}</span>
                                    </div>
                                </div>
                            ))}
                            <p className="text-xs text-muted-foreground">
                                Prompt and response content is not shown. See the Audit Log for the actions taken.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
