'use client';

import { useCallback, useEffect, useState } from 'react';

type Row = Record<string, unknown>;
type Dataset = 'logs' | 'audit' | 'metrics';

const DATASETS: Array<{ key: Dataset; label: string }> = [
    { key: 'logs', label: 'Docker logs' },
    { key: 'audit', label: 'Audit events' },
    { key: 'metrics', label: 'Container metrics' },
];

const cell = (v: unknown): string => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    try { return JSON.stringify(v); } catch { return String(v); }
};

export function InfraMonitoringPanel() {
    const [dataset, setDataset] = useState<Dataset>('logs');
    const [tenantId, setTenantId] = useState('');
    const [q, setQ] = useState('');
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notConfigured, setNotConfigured] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ dataset, limit: '100' });
            if (tenantId.trim()) params.set('tenantId', tenantId.trim());
            if (q.trim()) params.set('q', q.trim());
            const res = await fetch(`/api/observability/infra-logs?${params.toString()}`, { cache: 'no-store' });
            if (res.status === 503) { setNotConfigured(true); setRows([]); return; }
            if (!res.ok) { setError(`Query failed (${res.status}).`); return; }
            const body = (await res.json()) as { rows?: Row[] };
            setRows(Array.isArray(body.rows) ? body.rows : []);
        } catch {
            setError('Unable to reach the observability service.');
        } finally {
            setLoading(false);
        }
    }, [dataset, tenantId, q]);

    useEffect(() => { void load(); }, [load]);

    if (notConfigured) {
        return (
            <section className="card" style={{ padding: '1rem' }}>
                <p>
                    Axiom monitoring is not readable yet. Set <code>AXIOM_QUERY_TOKEN</code> on the gateway to a
                    <strong> query-scoped</strong> Axiom token (the ingest token used by the collector cannot read).
                    Container logs/metrics still ship to Axiom regardless — this only gates the dashboard view.
                </p>
            </section>
        );
    }

    const columns = rows.length > 0 ? Object.keys(rows[0]!).slice(0, 8) : [];

    return (
        <section className="card" style={{ padding: '1rem', overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <select value={dataset} onChange={(e) => setDataset(e.target.value as Dataset)}>
                    {DATASETS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
                <input placeholder="tenant id (blank = all customers)" value={tenantId} onChange={(e) => setTenantId(e.target.value)} style={{ minWidth: 240 }} />
                <input placeholder="search…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void load(); }} />
                <button type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Loading…' : 'Run'}</button>
            </div>
            {error && <p style={{ color: 'crimson' }}>{error}</p>}
            {!loading && !error && rows.length === 0 && <p>No records. (Telemetry appears once the collector runs on a customer VM.)</p>}
            {rows.length > 0 && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                            {columns.map((c) => <th key={c} style={{ padding: '0.4rem' }}>{c}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((r, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid #f0f0f0' }}>
                                {columns.map((c) => <td key={c} style={{ padding: '0.4rem', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell(r[c])}</td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}
