'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, Play, RefreshCw, Plus, AlertTriangle, X } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type KillSwitchType = 'emergency' | 'manual' | 'threshold_breach' | 'security_incident';
type KillSwitchStatus = 'active' | 'resumed' | 'expired';

type KillSwitchRecord = {
    id: string;
    tenantId: string;
    workspaceId?: string;
    botId?: string;
    switchType: KillSwitchType;
    status: KillSwitchStatus;
    activatedAt: string;
    activatedBy: string;
    reason: string;
    affectedActionTypes: string[];
    incidentRef?: string;
    expiresAt?: string;
    correlationId: string;
};

const TYPE_CONFIG: Record<KillSwitchType, { label: string; color: string; bg: string; border: string }> = {
    emergency:         { label: 'Emergency',        color: 'var(--danger)', bg: 'rgba(196,22,28,0.08)',   border: 'rgba(196,22,28,0.25)'  },
    manual:            { label: 'Manual',           color: 'var(--warn)', bg: 'rgba(180,83,9,0.08)',    border: 'rgba(180,83,9,0.25)'   },
    threshold_breach:  { label: 'Threshold Breach', color: 'var(--warn)', bg: 'rgba(180,83,9,0.08)',    border: 'rgba(180,83,9,0.25)'   },
    security_incident: { label: 'Security Incident',color: '#b8291a', bg: 'rgba(124,45,146,0.08)', border: 'rgba(124,45,146,0.25)' },
};

const STATUS_CONFIG: Record<KillSwitchStatus, { label: string; color: string; bg: string }> = {
    active:  { label: 'Active',  color: 'var(--danger)', bg: 'rgba(196,22,28,0.08)'   },
    resumed: { label: 'Resumed', color: 'var(--ok)', bg: 'rgba(26,122,74,0.08)'   },
    expired: { label: 'Expired', color: 'var(--ink-muted)', bg: 'rgba(110,110,115,0.08)' },
};

function formatDate(iso: string) {
    try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
}

// ── Activate modal ─────────────────────────────────────────────────────────────

function ActivateModal({ onClose, onActivated }: { onClose: () => void; onActivated: () => void }) {
    const [switchType, setSwitchType] = useState<KillSwitchType>('manual');
    const [reason, setReason]         = useState('');
    const [workspaceId, setWorkspaceId] = useState('');
    const [botId, setBotId]           = useState('');
    const [incidentRef, setIncidentRef] = useState('');
    const [busy, setBusy]             = useState(false);
    const [error, setError]           = useState<string | null>(null);

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '8px 11px', borderRadius: 9,
        border: '1px solid var(--line)', background: 'var(--card)',
        color: 'var(--ink)', fontSize: 13, outline: 'none',
        fontFamily: 'inherit',
    };

    async function submit(e: React.FormEvent) {
        e.preventDefault();
        if (!reason.trim()) { setError('Reason is required.'); return; }
        setBusy(true); setError(null);
        try {
            const res = await fetch('/api/kill-switches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // API expects snake_case; sending camelCase silently dropped the
                // scope fields (bot_id/workspace_id) — a tenant-wide switch by mistake.
                body: JSON.stringify({
                    switch_type: switchType,
                    reason: reason.trim(),
                    affected_action_types: ['*'], // UI halts ALL task execution in scope
                    ...(workspaceId.trim() ? { workspace_id: workspaceId.trim() } : {}),
                    ...(botId.trim() ? { bot_id: botId.trim() } : {}),
                    ...(incidentRef.trim() ? { incident_ref: incidentRef.trim() } : {}),
                }),
            });
            const body = (await res.json()) as { error?: string; message?: string };
            if (!res.ok) { setError(body.message ?? body.error ?? 'Failed to activate.'); return; }
            onActivated();
        } catch { setError('Network error.'); }
        finally { setBusy(false); }
    }

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div style={{ background: 'var(--card)', borderRadius: 20, padding: 28, width: '100%', maxWidth: 460, border: '1px solid var(--line)', boxShadow: '0 24px 48px -12px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(196,22,28,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <ShieldAlert size={17} color="var(--danger)" />
                        </div>
                        <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Danger Zone</div>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Activate Kill Switch</h3>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'var(--bg)', border: 'none', borderRadius: '50%', width: 30, height: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-muted)' }}><X size={14} /></button>
                </div>

                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', marginBottom: 18 }}>
                    <div style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                        <AlertTriangle size={14} color="var(--danger)" style={{ flexShrink: 0, marginTop: 1 }} />
                        <p style={{ margin: 0, fontSize: 12, color: 'var(--danger)', lineHeight: 1.5 }}>
                            Activating a kill switch immediately stops all agent task execution in the affected scope.
                            Use only in emergencies or confirmed security incidents.
                        </p>
                    </div>
                </div>

                <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Type</label>
                        <select value={switchType} onChange={e => setSwitchType(e.target.value as KillSwitchType)} style={{ ...inputStyle, cursor: 'pointer' }}>
                            <option value="manual">Manual — planned stop</option>
                            <option value="emergency">Emergency — immediate halt</option>
                            <option value="threshold_breach">Threshold Breach — budget/rate</option>
                            <option value="security_incident">Security Incident — breach detected</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Reason <span style={{ color: 'var(--danger)' }}>*</span></label>
                        <input value={reason} onChange={e => setReason(e.target.value)} style={inputStyle} placeholder="Describe why this kill switch is being activated…" required />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Workspace ID <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>(optional)</span></label>
                            <input value={workspaceId} onChange={e => setWorkspaceId(e.target.value)} style={inputStyle} placeholder="ws_… or leave blank for all" />
                        </div>
                        <div>
                            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Bot ID <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>(optional)</span></label>
                            <input value={botId} onChange={e => setBotId(e.target.value)} style={inputStyle} placeholder="bot_… scope to one bot" />
                        </div>
                    </div>
                    <div>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', display: 'block', marginBottom: 4 }}>Incident Ref <span style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>(optional)</span></label>
                        <input value={incidentRef} onChange={e => setIncidentRef(e.target.value)} style={inputStyle} placeholder="INC-1234 or Jira ticket" />
                    </div>

                    {error && (
                        <div style={{ padding: '8px 12px', borderRadius: 9, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 12 }}>
                            {error}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '9px 0', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" disabled={busy} style={{ flex: 1, padding: '9px 0', borderRadius: 9999, border: 'none', background: busy ? 'var(--ink-muted)' : 'var(--danger)', color: 'var(--card)', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer' }}>
                            {busy ? 'Activating…' : '⚡ Activate'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ── Main panel ─────────────────────────────────────────────────────────────────

export default function KillSwitchPanel() {
    const [switches, setSwitches] = useState<KillSwitchRecord[]>([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState<string | null>(null);
    const [resumingId, setResumingId] = useState<string | null>(null);
    const [showActivate, setShowActivate] = useState(false);
    const [filter, setFilter]     = useState<'all' | 'active' | 'resolved'>('all');

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const res = await fetch('/api/kill-switches', { cache: 'no-store' });
            const body = (await res.json()) as { kill_switches?: KillSwitchRecord[]; error?: string };
            if (body.error) { setError(body.error); return; }
            setSwitches(body.kill_switches ?? []);
        } catch { setError('Network error loading kill switches.'); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const handleResume = async (id: string) => {
        setResumingId(id);
        try {
            await fetch(`/api/kill-switches/${encodeURIComponent(id)}/resume`, { method: 'POST', cache: 'no-store' });
            await load();
        } finally { setResumingId(null); }
    };

    const active   = switches.filter(s => s.status === 'active');
    const resolved = switches.filter(s => s.status !== 'active');
    const displayed = filter === 'active' ? active : filter === 'resolved' ? resolved : switches;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Header bar */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6 }}>
                    {[
                        { key: 'all',      label: `All (${switches.length})`     },
                        { key: 'active',   label: `Active (${active.length})`    },
                        { key: 'resolved', label: `Resolved (${resolved.length})` },
                    ].map(({ key, label }) => (
                        <button key={key} onClick={() => setFilter(key as typeof filter)} style={{
                            padding: '5px 12px', borderRadius: 9999, border: '1px solid', cursor: 'pointer',
                            fontSize: 12, fontWeight: 600,
                            background: filter === key ? 'var(--ink)' : 'var(--card)',
                            borderColor: filter === key ? 'var(--ink)' : 'var(--line)',
                            color: filter === key ? 'var(--card)' : 'var(--ink-soft)',
                            transition: 'all 0.15s',
                        }}>{label}</button>
                    ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={load} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 9999, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                        <RefreshCw size={11} /> Refresh
                    </button>
                    <button onClick={() => setShowActivate(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 9999, border: 'none', background: 'var(--danger)', color: 'var(--card)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                        <Plus size={12} /> Activate Kill Switch
                    </button>
                </div>
            </div>

            {/* Active switches alert */}
            {active.length > 0 && (
                <div style={{ padding: '12px 16px', borderRadius: 14, background: 'var(--danger-bg)', border: '2px solid rgba(196,22,28,0.3)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ShieldAlert size={18} color="var(--danger)" style={{ flexShrink: 0 }} />
                    <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)' }}>
                            {active.length} kill switch{active.length !== 1 ? 'es' : ''} currently active
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--danger)', opacity: 0.8 }}>Agent task execution is halted in the affected scopes.</div>
                    </div>
                </div>
            )}

            {active.length === 0 && !loading && (
                <div style={{ padding: '12px 16px', borderRadius: 14, background: 'var(--ok-bg)', border: '1px solid var(--ok-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <ShieldCheck size={16} color="var(--ok)" />
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ok)' }}>All clear — no active kill switches</span>
                </div>
            )}

            {/* Error */}
            {error && (
                <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 13 }}>{error}</div>
            )}

            {/* Loading skeletons */}
            {loading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[1, 2].map(i => <div key={i} style={{ height: 80, borderRadius: 14, background: 'var(--bg)' }} />)}
                </div>
            )}

            {/* Switch list */}
            {!loading && displayed.length === 0 && !error && (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13, border: '1px dashed #d2d2d7', borderRadius: 14 }}>
                    No kill switches {filter !== 'all' ? `with status "${filter}"` : ''} found.
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {displayed.map(ks => {
                    const typeCfg   = TYPE_CONFIG[ks.switchType];
                    const statusCfg = STATUS_CONFIG[ks.status];
                    const isActive  = ks.status === 'active';
                    return (
                        <div key={ks.id} style={{
                            background: 'var(--card)', border: `1px solid ${isActive ? 'rgba(196,22,28,0.25)' : 'var(--line)'}`,
                            borderRadius: 14, padding: '14px 16px',
                            boxShadow: isActive ? '0 0 0 3px rgba(196,22,28,0.06)' : '0 1px 3px rgba(0,0,0,0.05)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    {/* Type + status badges */}
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 9999, background: typeCfg.bg, border: `1px solid ${typeCfg.border}`, fontSize: 11, fontWeight: 700, color: typeCfg.color, letterSpacing: '0.02em' }}>
                                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: typeCfg.color }} />
                                            {typeCfg.label}
                                        </span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 9999, background: statusCfg.bg, fontSize: 11, fontWeight: 600, color: statusCfg.color }}>
                                            {statusCfg.label}
                                        </span>
                                        {ks.workspaceId && <span style={{ padding: '3px 8px', borderRadius: 9999, background: 'var(--bg)', fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'monospace' }}>ws: {ks.workspaceId}</span>}
                                        {ks.botId && <span style={{ padding: '3px 8px', borderRadius: 9999, background: 'var(--bg)', fontSize: 11, color: 'var(--ink-muted)', fontFamily: 'monospace' }}>bot: {ks.botId}</span>}
                                    </div>
                                    {/* Reason */}
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginBottom: 4 }}>{ks.reason}</div>
                                    {/* Meta */}
                                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--ink-muted)' }}>
                                        <span>Activated by <strong style={{ color: 'var(--ink-soft)' }}>{ks.activatedBy}</strong> on {formatDate(ks.activatedAt)}</span>
                                        {ks.incidentRef && <span>Ref: <strong style={{ color: 'var(--ink-soft)', fontFamily: 'monospace' }}>{ks.incidentRef}</strong></span>}
                                        {ks.expiresAt && <span>Expires {formatDate(ks.expiresAt)}</span>}
                                    </div>
                                    {/* Affected actions */}
                                    {ks.affectedActionTypes.length > 0 && (
                                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
                                            {ks.affectedActionTypes.slice(0, 6).map(a => (
                                                <span key={a} style={{ padding: '2px 7px', borderRadius: 5, background: 'var(--bg)', border: '1px solid var(--line)', fontSize: 10, fontWeight: 600, color: 'var(--ink-muted)', fontFamily: 'monospace' }}>{a}</span>
                                            ))}
                                            {ks.affectedActionTypes.length > 6 && (
                                                <span style={{ padding: '2px 7px', borderRadius: 5, background: 'var(--bg)', fontSize: 10, color: 'var(--ink-muted)' }}>+{ks.affectedActionTypes.length - 6} more</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {/* Resume button */}
                                {isActive && (
                                    <button onClick={() => handleResume(ks.id)} disabled={resumingId === ks.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9999, border: '1px solid rgba(26,122,74,0.3)', background: 'var(--ok-bg)', color: 'var(--ok)', fontSize: 12, fontWeight: 700, cursor: resumingId === ks.id ? 'not-allowed' : 'pointer', flexShrink: 0, transition: 'all 0.15s' }}>
                                        <Play size={11} /> {resumingId === ks.id ? 'Resuming…' : 'Resume'}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            {showActivate && (
                <ActivateModal
                    onClose={() => setShowActivate(false)}
                    onActivated={() => { setShowActivate(false); void load(); }}
                />
            )}
        </div>
    );
}
