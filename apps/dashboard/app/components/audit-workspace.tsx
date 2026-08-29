'use client';

/**
 * Hybrid Audit / evidence workspace wired to LIVE audit events. Rendered inside
 * the page.tsx audit tab (no masthead — topbar provides it). Filter + search +
 * editorial print-ledger of the real AuditEvent stream.
 */

import { useState, useMemo } from 'react';
import { Search, ShieldCheck, ExternalLink } from 'lucide-react';
import { UiKit, Badge, Button, Eyebrow, Stat } from './ui-kit';

export type AuditRow = {
    event_id: string;
    event_type: string;
    severity: string;
    summary: string;
    source_system: string;
    created_at: string;
    correlation_id: string;
};

type Sev = 'all' | 'info' | 'warn' | 'high';
const sevTone = (s: string): 'ok' | 'warn' | 'err' | 'neutral' => {
    const v = (s ?? '').toLowerCase();
    if (v === 'high' || v === 'critical') return 'err';
    if (v === 'medium' || v === 'warn' || v === 'warning') return 'warn';
    if (v === 'info' || v === 'low') return 'ok';
    return 'neutral';
};
const inBucket = (s: string, b: Sev) => {
    if (b === 'all') return true;
    const v = (s ?? '').toLowerCase();
    if (b === 'high') return v === 'high' || v === 'critical';
    if (b === 'warn') return v === 'medium' || v === 'warn' || v === 'warning';
    return v === 'info' || v === 'low';
};
const fmt = (iso: string) => { try { return new Date(iso).toLocaleString('en-GB', { hour12: false }); } catch { return iso; } };

export default function AuditWorkspace({ initial }: { initial: AuditRow[]; workspaceId?: string }) {
    const [sev, setSev] = useState<Sev>('all');
    const [q, setQ] = useState('');

    const rows = useMemo(
        () => initial.filter((e) => inBucket(e.severity, sev) && (q === '' || (e.summary + e.event_type + e.source_system + e.correlation_id).toLowerCase().includes(q.toLowerCase()))),
        [initial, sev, q],
    );
    const highCount = initial.filter((e) => sevTone(e.severity) === 'err').length;
    const sources = new Set(initial.map((e) => e.source_system)).size;

    return (
        <UiKit style={{ background: 'var(--bg)' }}>
            <div style={{ display: 'grid', gap: 20 }}>
                {/* Stat strip */}
                <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <Stat n={String(initial.length).padStart(2, '0')} k="Events" tone="accent" />
                    <Stat n={String(highCount).padStart(2, '0')} k="High severity" tone={highCount > 0 ? 'err' : 'ok'} />
                    <Stat n={String(sources).padStart(2, '0')} k="Sources" tone="muted" />
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                        <Button variant="ghost" size="sm">Export CSV</Button>
                        <Button variant="ghost" size="sm">Export JSON</Button>
                    </span>
                </div>

                {/* Filter bar */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '0 1 300px' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
                        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search event, source, correlation…" className="uk-input" style={{ paddingLeft: 32 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        {(['all', 'info', 'warn', 'high'] as const).map((b) => (
                            <button key={b} onClick={() => setSev(b)} className="uk-eyebrow"
                                style={{ padding: '6px 11px', border: `1px solid ${sev === b ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 3, cursor: 'pointer', background: sev === b ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent', color: sev === b ? 'var(--accent)' : 'var(--ink-muted)' }}>
                                {b}
                            </button>
                        ))}
                    </div>
                    <span className="uk-mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-muted)' }}>{rows.length} shown</span>
                </div>

                {/* Ledger */}
                {rows.length === 0 ? (
                    <div className="uk-panel" style={{ padding: 24, color: 'var(--ink-muted)', fontSize: 13 }}>No audit events match this filter.</div>
                ) : (
                    <table className="uk-ledger">
                        <thead><tr><th>Timestamp</th><th>Event</th><th>Source</th><th>Correlation</th><th>Severity</th></tr></thead>
                        <tbody>
                            {rows.map((e) => (
                                <tr key={e.event_id}>
                                    <td className="uk-num">{fmt(e.created_at)}</td>
                                    <td>{e.summary || e.event_type}</td>
                                    <td className="uk-num">{e.source_system}</td>
                                    <td className="uk-num" style={{ color: 'var(--accent)' }}>{e.correlation_id ? e.correlation_id.slice(-10) : '—'}</td>
                                    <td><Badge tone={sevTone(e.severity)}>{e.severity}</Badge></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <div className="uk-panel" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ShieldCheck size={15} color="var(--accent)" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>Append-only audit trail — every agent action is recorded with a correlation ID for evidence bundles.</span>
                    <Eyebrow style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4, alignItems: 'center' }}>Evidence <ExternalLink size={10} /></Eyebrow>
                </div>
            </div>
        </UiKit>
    );
}
