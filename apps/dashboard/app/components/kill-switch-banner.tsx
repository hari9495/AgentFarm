'use client';

/**
 * KillSwitchBanner
 *
 * B2 deferred dashboard component: shows a prominent alert banner when one or more
 * kill-switches are active for the current tenant.  Polls /api/kill-switches every
 * 15 seconds and surfaces each active switch with its reason and a "Resume" action.
 */

import { useCallback, useEffect, useState } from 'react';

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

const SWITCH_TYPE_LABELS: Record<KillSwitchType, string> = {
    emergency: 'Emergency',
    manual: 'Manual',
    threshold_breach: 'Threshold Breach',
    security_incident: 'Security Incident',
};

const POLL_INTERVAL_MS = 15_000;

type Props = { className?: string };

export function KillSwitchBanner({ className }: Props) {
    const [activeSwitches, setActiveSwitches] = useState<KillSwitchRecord[]>([]);
    const [resumingId, setResumingId] = useState<string | null>(null);
    const [resumeError, setResumeError] = useState<string | null>(null);

    const fetchSwitches = useCallback(async () => {
        try {
            const res = await fetch('/api/kill-switches', { cache: 'no-store' });
            if (!res.ok) return;
            const body = (await res.json()) as { kill_switches?: KillSwitchRecord[] };
            const active = (body.kill_switches ?? []).filter((ks) => ks.status === 'active');
            setActiveSwitches(active);
        } catch {
            // silent — banner disappears gracefully on network error
        }
    }, []);

    useEffect(() => {
        void fetchSwitches();
        const timer = setInterval(() => { void fetchSwitches(); }, POLL_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [fetchSwitches]);

    const handleResume = async (id: string) => {
        setResumingId(id);
        setResumeError(null);
        try {
            const res = await fetch(`/api/kill-switches/${encodeURIComponent(id)}/resume`, {
                method: 'POST',
                cache: 'no-store',
            });
            if (!res.ok) {
                const errBody = (await res.json().catch(() => null)) as { message?: string } | null;
                setResumeError(errBody?.message ?? 'Failed to resume kill-switch.');
            } else {
                // Immediately re-poll to remove the banner
                await fetchSwitches();
            }
        } catch {
            setResumeError('Network error — could not resume kill-switch.');
        } finally {
            setResumingId(null);
        }
    };

    if (activeSwitches.length === 0) return null;

    return (
        <div
            role="alert"
            aria-live="assertive"
            className={className}
            style={{
                background: 'var(--danger-bg)',
                border: '1px solid rgba(196,22,28,0.3)',
                borderLeft: '4px solid #c4161c',
                borderRadius: 14,
                padding: '14px 18px',
                marginBottom: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                boxShadow: '0 0 0 4px rgba(196,22,28,0.06)',
            }}
        >
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(196,22,28,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 16 }} aria-hidden="true">⛔</span>
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--danger)', letterSpacing: '-0.01em' }}>
                        AGENTS HALTED — {activeSwitches.length === 1 ? '1 kill switch active' : `${activeSwitches.length} kill switches active`}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--danger)', opacity: 0.75, marginTop: 1 }}>
                        All task execution is stopped in the affected scope. Resume when the incident is resolved.
                    </div>
                </div>
            </div>

            {activeSwitches.map((ks) => (
                <div
                    key={ks.id}
                    style={{
                        background: 'var(--card)',
                        border: '1px solid var(--danger-border)',
                        borderRadius: 10,
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 12,
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Type + scope badges */}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                            <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                background: 'var(--danger-bg)', color: 'var(--danger)',
                                fontSize: 11, fontWeight: 700, padding: '2px 9px',
                                borderRadius: 9999, border: '1px solid rgba(196,22,28,0.22)',
                                letterSpacing: '0.02em',
                            }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--danger)', display: 'inline-block' }} />
                                {SWITCH_TYPE_LABELS[ks.switchType]}
                            </span>
                            {ks.workspaceId && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', padding: '2px 8px', borderRadius: 9999, background: 'var(--bg)', border: '1px solid var(--line)', fontFamily: 'ui-monospace, monospace' }}>
                                    ws: {ks.workspaceId}
                                </span>
                            )}
                            {ks.botId && (
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-muted)', padding: '2px 8px', borderRadius: 9999, background: 'var(--bg)', border: '1px solid var(--line)', fontFamily: 'ui-monospace, monospace' }}>
                                    bot: {ks.botId}
                                </span>
                            )}
                        </div>
                        {/* Reason */}
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.45 }}>
                            {ks.reason}
                        </p>
                        {ks.incidentRef && (
                            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--ink-muted)' }}>
                                Incident ref: <strong style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--ink-soft)' }}>{ks.incidentRef}</strong>
                            </p>
                        )}
                        <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--ink-muted)' }}>
                            {ks.affectedActionTypes.length > 0 && `Blocked: ${ks.affectedActionTypes.join(', ')} · `}
                            Activated: {new Date(ks.activatedAt).toLocaleString()}
                        </p>
                    </div>
                    <button
                        type="button"
                        disabled={resumingId === ks.id}
                        onClick={() => { void handleResume(ks.id); }}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '7px 16px',
                            background: resumingId === ks.id ? 'var(--ink-muted)' : 'rgba(26,122,74,0.1)',
                            color: resumingId === ks.id ? 'var(--card)' : 'var(--ok)',
                            border: '1px solid rgba(26,122,74,0.3)',
                            borderRadius: 9999,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: resumingId === ks.id ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            transition: 'all 0.15s',
                        }}
                    >
                        ▶ {resumingId === ks.id ? 'Resuming…' : 'Resume'}
                    </button>
                </div>
            ))}

            {resumeError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 12 }}>
                    ⚠ {resumeError}
                </div>
            )}
        </div>
    );
}
