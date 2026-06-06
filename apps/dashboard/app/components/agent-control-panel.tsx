'use client';

import { useEffect, useState, useCallback } from 'react';

type BotStatusData = {
    botId: string;
    status: string;
    tenantId: string;
};

type ActionState = 'idle' | 'loading';

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
    active: { bg: 'var(--ok-bg)', text: 'var(--ok)', dot: 'var(--ok)' },
    paused: { bg: 'var(--warn-bg)', text: 'var(--warn)', dot: 'var(--warn)' },
};

const DEFAULT_COLORS = { bg: 'var(--bg)', text: 'var(--ink-soft)', dot: 'var(--ink-muted)' };

function StatusBadge({ status }: { status: string }) {
    const colors = STATUS_COLORS[status] ?? DEFAULT_COLORS;
    const label = status === 'active' ? '● Active' : status === 'paused' ? '⏸ Paused' : status;
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 10px',
            borderRadius: 20,
            background: colors.bg,
            color: colors.text,
            fontSize: '0.82rem',
            fontWeight: 600,
        }}>
            <span style={{ color: colors.dot, fontSize: '0.7rem' }}>●</span>
            {label}
        </span>
    );
}

type AgentControlPanelProps = {
    botId: string;
};

export default function AgentControlPanel({ botId }: AgentControlPanelProps) {
    const [statusData, setStatusData] = useState<BotStatusData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [actionState, setActionState] = useState<ActionState>('idle');
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);

    const fetchStatus = useCallback(async () => {
        setIsLoading(true);
        setFetchError(null);
        try {
            const res = await fetch(`/api/runtime/${botId}/status`, { cache: 'no-store' });
            if (!res.ok) {
                setFetchError('Failed to load agent status.');
                return;
            }
            const data = await res.json() as BotStatusData;
            setStatusData(data);
        } catch {
            setFetchError('Failed to load agent status.');
        } finally {
            setIsLoading(false);
        }
    }, [botId]);

    useEffect(() => {
        void fetchStatus();
    }, [fetchStatus]);

    const handleAction = async (action: 'pause' | 'resume') => {
        setActionState('loading');
        setMessage(null);
        try {
            const res = await fetch(`/api/runtime/${botId}/${action}`, { method: 'POST', cache: 'no-store' });
            const body = await res.json() as { status?: string; message?: string; error?: string };
            if (res.ok) {
                setMessage({ text: body.message ?? `Agent ${action}d successfully.`, type: 'success' });
                await fetchStatus();
            } else {
                setMessage({ text: body.error ?? `Failed to ${action} agent.`, type: 'error' });
            }
        } catch {
            setMessage({ text: `Failed to ${action} agent.`, type: 'error' });
        } finally {
            setActionState('idle');
        }
    };

    const currentStatus = statusData?.status ?? '';
    const isActing = actionState === 'loading';

    return (
        <section style={{
            background: 'var(--card)',
            borderRadius: 10,
            border: '1px solid var(--line)',
            padding: '1rem 1.25rem',
            marginTop: '1rem',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Agent Control</h3>
                {isLoading
                    ? <span style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>...</span>
                    : statusData && <StatusBadge status={currentStatus} />
                }
            </div>

            {fetchError && (
                <p style={{ fontSize: '0.82rem', color: 'var(--danger)', marginBottom: '0.75rem' }}>{fetchError}</p>
            )}

            {message && (
                <p style={{
                    fontSize: '0.82rem',
                    color: message.type === 'success' ? 'var(--ok)' : 'var(--danger)',
                    marginBottom: '0.75rem',
                }}>
                    {message.text}
                </p>
            )}

            <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                    onClick={() => void handleAction('pause')}
                    disabled={isActing || isLoading || currentStatus === 'paused'}
                    style={{
                        padding: '6px 16px',
                        borderRadius: 6,
                        border: '1px solid var(--line)',
                        background: isActing || currentStatus === 'paused' ? 'var(--bg)' : '#fffbeb',
                        color: isActing || currentStatus === 'paused' ? 'var(--ink-muted)' : 'var(--warn)',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: isActing || currentStatus === 'paused' ? 'not-allowed' : 'pointer',
                    }}
                >
                    {isActing ? '...' : 'Pause Agent'}
                </button>
                <button
                    onClick={() => void handleAction('resume')}
                    disabled={isActing || isLoading || currentStatus === 'active'}
                    style={{
                        padding: '6px 16px',
                        borderRadius: 6,
                        border: '1px solid var(--line)',
                        background: isActing || currentStatus === 'active' ? 'var(--bg)' : '#f0fdf4',
                        color: isActing || currentStatus === 'active' ? 'var(--ink-muted)' : 'var(--ok)',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: isActing || currentStatus === 'active' ? 'not-allowed' : 'pointer',
                    }}
                >
                    {isActing ? '...' : 'Resume Agent'}
                </button>
            </div>
        </section>
    );
}
