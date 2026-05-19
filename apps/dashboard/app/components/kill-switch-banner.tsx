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
                background: '#fef3c7',
                borderLeft: '4px solid #d97706',
                borderRadius: '0.375rem',
                padding: '0.75rem 1rem',
                marginBottom: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1rem' }} aria-hidden="true">⏸</span>
                <strong style={{ color: '#92400e', fontSize: '0.9rem' }}>
                    Agent Paused — {activeSwitches.length === 1 ? '1 kill-switch active' : `${activeSwitches.length} kill-switches active`}
                </strong>
            </div>

            {activeSwitches.map((ks) => (
                <div
                    key={ks.id}
                    style={{
                        background: '#fff',
                        border: '1px solid #fde68a',
                        borderRadius: '0.25rem',
                        padding: '0.6rem 0.75rem',
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        flexWrap: 'wrap',
                    }}
                >
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginBottom: '0.2rem' }}>
                            <span style={{
                                background: '#fef3c7',
                                color: '#92400e',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '1px 7px',
                                borderRadius: '999px',
                                border: '1px solid #fde68a',
                            }}>
                                {SWITCH_TYPE_LABELS[ks.switchType]}
                            </span>
                            {ks.workspaceId && (
                                <span style={{ fontSize: '0.72rem', color: '#78716c' }}>
                                    workspace: {ks.workspaceId}
                                </span>
                            )}
                            {ks.botId && (
                                <span style={{ fontSize: '0.72rem', color: '#78716c' }}>
                                    bot: {ks.botId}
                                </span>
                            )}
                        </div>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#44403c' }}>
                            {ks.reason}
                        </p>
                        {ks.incidentRef && (
                            <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', color: '#78716c' }}>
                                Incident: {ks.incidentRef}
                            </p>
                        )}
                        <p style={{ margin: '0.15rem 0 0', fontSize: '0.72rem', color: '#a8a29e' }}>
                            Affected actions: {ks.affectedActionTypes.join(', ')}
                            {' · '}
                            Activated: {new Date(ks.activatedAt).toLocaleString()}
                        </p>
                    </div>
                    <button
                        type="button"
                        disabled={resumingId === ks.id}
                        onClick={() => { void handleResume(ks.id); }}
                        style={{
                            padding: '0.35rem 0.9rem',
                            background: resumingId === ks.id ? '#d1d5db' : '#d97706',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '0.25rem',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: resumingId === ks.id ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                        }}
                    >
                        {resumingId === ks.id ? 'Resuming…' : 'Resume'}
                    </button>
                </div>
            ))}

            {resumeError && (
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#b45309' }}>
                    ⚠ {resumeError}
                </p>
            )}
        </div>
    );
}
