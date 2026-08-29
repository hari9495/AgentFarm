'use client';

/**
 * Hybrid Approvals workspace wired to LIVE data. Takes the server-fetched
 * pending approvals as initial props and fires REAL decisions against
 * POST /api/approvals/decision (same endpoint the legacy panel uses).
 * Rendered inside the page.tsx approvals tab (no masthead — topbar provides it).
 */

import { useState, useMemo } from 'react';
import { Search, Check, X, FileDiff, Clock, ShieldAlert } from 'lucide-react';
import { UiKit, Panel, Button, Badge, Input, Eyebrow, Display } from './ui-kit';

export type WsApproval = {
    approval_id: string;
    workspace_id: string;
    bot_id: string;
    task_id?: string;
    action_summary: string;
    change_summary?: string;
    impacted_scope?: string | null;
    risk_reason?: string | null;
    risk_level: 'low' | 'medium' | 'high';
    requested_at: string;
};

const riskTone = (r: string): 'ok' | 'warn' | 'err' => (r === 'low' ? 'ok' : r === 'high' ? 'err' : 'warn');
const ago = (iso: string) => {
    const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
};

export default function ApprovalsWorkspace({ initial, workspaceId }: { initial: WsApproval[]; workspaceId: string }) {
    const [queue, setQueue] = useState<WsApproval[]>(initial);
    const [risk, setRisk] = useState<'all' | 'low' | 'medium' | 'high'>('all');
    const [q, setQ] = useState('');
    const [selectedId, setSelectedId] = useState(initial[0]?.approval_id ?? '');
    const [decided, setDecided] = useState<Record<string, 'approve' | 'reject'>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const filtered = useMemo(
        () => queue.filter((i) => (risk === 'all' || i.risk_level === risk) && (q === '' || (i.action_summary + i.bot_id).toLowerCase().includes(q.toLowerCase()))),
        [queue, risk, q],
    );
    const selected = queue.find((i) => i.approval_id === selectedId) ?? filtered[0] ?? queue[0];
    const pending = queue.filter((i) => !decided[i.approval_id]).length;

    async function decide(a: WsApproval, decision: 'approve' | 'reject') {
        setBusy(a.approval_id);
        setError(null);
        try {
            const res = await fetch('/api/approvals/decision', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ approval_id: a.approval_id, workspace_id: workspaceId, decision, reason: null, selected_option_id: null }),
            });
            const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; decision?: string };
            if (!res.ok) { setError(body.message ?? body.error ?? 'Failed to submit decision.'); return; }
            setDecided((m) => ({ ...m, [a.approval_id]: (body.decision as 'approve' | 'reject') ?? decision }));
        } catch {
            setError('Network error submitting decision.');
        } finally {
            setBusy(null);
        }
    }

    if (queue.length === 0) {
        return (
            <UiKit style={{ background: 'var(--bg)' }}>
                <div className="uk-panel" style={{ padding: '28px', textAlign: 'center', color: 'var(--ink-muted)' }}>
                    <Check size={22} color="var(--ok)" style={{ marginBottom: 8 }} />
                    <div style={{ fontSize: 14, color: 'var(--ink)' }}>Queue is clear — no approvals waiting.</div>
                </div>
            </UiKit>
        );
    }

    return (
        <UiKit style={{ background: 'var(--bg)' }}>
            {/* Filter bar */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                <div style={{ position: 'relative', flex: '0 1 280px' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
                    <Input placeholder="Search action or bot…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 32 }} />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {(['all', 'low', 'medium', 'high'] as const).map((r) => (
                        <button key={r} onClick={() => setRisk(r)} className="uk-eyebrow"
                            style={{ padding: '6px 11px', border: `1px solid ${risk === r ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 3, cursor: 'pointer', background: risk === r ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent', color: risk === r ? 'var(--accent)' : 'var(--ink-muted)' }}>
                            {r}
                        </button>
                    ))}
                </div>
                <span className="uk-mono" style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-muted)' }}>{pending} pending · {filtered.length} shown</span>
            </div>

            {error && <div className="uk-panel" style={{ padding: '10px 14px', marginBottom: 12, borderLeft: '2px solid var(--danger)', color: 'var(--danger)', fontSize: 12.5 }}>{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, alignItems: 'start' }}>
                {/* Queue */}
                <div style={{ border: '1px solid var(--line)', borderRadius: 3, overflow: 'hidden' }}>
                    {filtered.map((i) => {
                        const isSel = i.approval_id === selected?.approval_id;
                        const d = decided[i.approval_id];
                        return (
                            <button key={i.approval_id} onClick={() => setSelectedId(i.approval_id)}
                                style={{ width: '100%', textAlign: 'left', display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 18px', background: isSel ? 'color-mix(in srgb, var(--accent) 7%, transparent)' : 'transparent', border: 'none', borderBottom: '1px solid var(--line)', borderLeft: isSel ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer' }}>
                                <Clock size={15} color={d ? 'var(--ink-muted)' : 'var(--warn)'} style={{ marginTop: 2, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                        <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.action_summary}</span>
                                        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, flexShrink: 0 }}>
                                            <Badge tone={riskTone(i.risk_level)}>{i.risk_level}</Badge>
                                            {d && <Badge tone={d === 'approve' ? 'ok' : 'err'}>{d}d</Badge>}
                                        </span>
                                    </div>
                                    <div className="uk-mono" style={{ fontSize: 10.5, color: 'var(--ink-muted)' }}>{i.approval_id.slice(-8)} · {i.bot_id.slice(-8)} · {ago(i.requested_at)} ago</div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Detail */}
                {selected && (
                    <div className="uk-panel" style={{ padding: 20 }}>
                        <Eyebrow style={{ marginBottom: 8 }}>{selected.approval_id.slice(-8)} · requested {ago(selected.requested_at)} ago</Eyebrow>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                            <Display size={19}>{selected.action_summary}</Display>
                            <Badge tone={riskTone(selected.risk_level)}>{selected.risk_level} risk</Badge>
                        </div>
                        <div className="uk-mono" style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginBottom: 16 }}>bot {selected.bot_id.slice(-8)}{selected.task_id ? ` · task ${selected.task_id.slice(-8)}` : ''}</div>

                        {selected.change_summary && <p style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.55, marginBottom: 14 }}>{selected.change_summary}</p>}

                        {(selected.impacted_scope || selected.risk_reason) && (
                            <div className="uk-panel" style={{ padding: '12px 14px', marginBottom: 16, background: 'var(--bg)' }}>
                                {selected.impacted_scope && <div style={{ fontSize: 12.5, marginBottom: selected.risk_reason ? 8 : 0 }}><span className="uk-eyebrow">Impacted scope</span><div style={{ color: 'var(--ink)', marginTop: 3 }}>{selected.impacted_scope}</div></div>}
                                {selected.risk_reason && <div style={{ fontSize: 12.5 }}><span className="uk-eyebrow" style={{ color: 'var(--danger)' }}>Risk reason</span><div style={{ color: 'var(--ink-soft)', marginTop: 3 }}>{selected.risk_reason}</div></div>}
                            </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-muted)', marginBottom: 18 }}>
                            <ShieldAlert size={13} color="var(--accent)" />
                            <span className="uk-mono">gated · routes through the approval queue before execution</span>
                        </div>

                        {decided[selected.approval_id] ? (
                            <div className="uk-panel" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 10, borderLeft: `2px solid ${decided[selected.approval_id] === 'approve' ? 'var(--ok)' : 'var(--danger)'}` }}>
                                {decided[selected.approval_id] === 'approve' ? <Check size={16} color="var(--ok)" /> : <X size={16} color="var(--danger)" />}
                                <span style={{ fontSize: 13, fontWeight: 600, color: decided[selected.approval_id] === 'approve' ? 'var(--ok)' : 'var(--danger)' }}>
                                    {decided[selected.approval_id] === 'approve' ? 'Approved — executing via connector' : 'Rejected — agent notified'}
                                </span>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: 10 }}>
                                <Button variant="primary" disabled={busy === selected.approval_id} onClick={() => decide(selected, 'approve')} style={{ flex: 1, justifyContent: 'center' }}>
                                    <Check size={14} /> {busy === selected.approval_id ? 'Approving…' : 'Approve'}
                                </Button>
                                <Button variant="danger" disabled={busy === selected.approval_id} onClick={() => decide(selected, 'reject')}><X size={14} /> Reject</Button>
                                <Button variant="ghost"><FileDiff size={14} /> Review</Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </UiKit>
    );
}
