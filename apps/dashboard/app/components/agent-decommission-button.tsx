'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = { botId: string };

export default function AgentDecommissionButton({ botId }: Props) {
    const router = useRouter();
    const [confirming, setConfirming] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleDecommission() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/agents/${encodeURIComponent(botId)}/terminate`, {
                method: 'POST',
                cache: 'no-store',
            });
            if (res.ok) {
                router.push('/agents');
                router.refresh();
            } else {
                const body = (await res.json().catch(() => ({}))) as { error?: string };
                setError(body.error ?? 'Decommission failed. Try again.');
                setLoading(false);
                setConfirming(false);
            }
        } catch {
            setError('Network error. Try again.');
            setLoading(false);
            setConfirming(false);
        }
    }

    if (!confirming) {
        return (
            <button
                onClick={() => setConfirming(true)}
                style={{
                    padding: '7px 16px',
                    background: 'transparent',
                    border: '1px solid #7f1d1d',
                    borderRadius: '8px',
                    color: 'var(--danger)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--danger-bg)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
            >
                Decommission Agent
            </button>
        );
    }

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '12px 16px',
            background: 'var(--danger-bg)',
            border: '1px solid #7f1d1d',
            borderRadius: '8px',
        }}>
            <p style={{ margin: 0, fontSize: '12px', color: 'var(--danger)', fontWeight: 600 }}>
                This will stop and permanently remove this agent. Are you sure?
            </p>
            {error && (
                <p style={{ margin: 0, fontSize: '11px', color: 'var(--danger)' }}>{error}</p>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
                <button
                    onClick={() => void handleDecommission()}
                    disabled={loading}
                    style={{
                        padding: '6px 14px',
                        background: 'var(--danger)',
                        border: '1px solid #991b1b',
                        borderRadius: '6px',
                        color: 'var(--danger-bg)',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: loading ? 'not-allowed' : 'pointer',
                        opacity: loading ? 0.7 : 1,
                    }}
                >
                    {loading ? 'Removing…' : 'Yes, decommission'}
                </button>
                <button
                    onClick={() => { setConfirming(false); setError(null); }}
                    disabled={loading}
                    style={{
                        padding: '6px 14px',
                        background: 'transparent',
                        border: '1px solid #334155',
                        borderRadius: '6px',
                        color: 'var(--ink-muted)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
