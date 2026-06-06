'use client';

import { useState } from 'react';

export default function AgentMessagingToggle({
    botId,
    initialEnabled,
}: {
    botId: string;
    initialEnabled: boolean;
}) {
    const [enabled, setEnabled] = useState(initialEnabled);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggle = async () => {
        setSaving(true);
        setError(null);
        const next = !enabled;
        try {
            const res = await fetch(`/api/agents/${encodeURIComponent(botId)}/messaging`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ messagingEnabled: next }),
            });
            if (res.ok) {
                setEnabled(next);
            } else {
                const body = await res.json().catch(() => ({})) as { message?: string };
                setError(body.message ?? 'Failed to update messaging setting.');
            }
        } catch {
            setError('Network error. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p style={{ margin: 0, fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>
                When disabled, this agent cannot send or receive messages from other agents.
                Use this to isolate an agent that should work independently.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button
                    type="button"
                    onClick={() => void toggle()}
                    disabled={saving}
                    style={{
                        position: 'relative',
                        display: 'inline-flex',
                        width: '44px',
                        height: '24px',
                        borderRadius: '12px',
                        border: 'none',
                        cursor: saving ? 'not-allowed' : 'pointer',
                        background: enabled ? 'var(--ok)' : 'var(--line)',
                        transition: 'background 0.2s',
                        padding: 0,
                        flexShrink: 0,
                        opacity: saving ? 0.6 : 1,
                    }}
                    aria-label={enabled ? 'Disable agent messaging' : 'Enable agent messaging'}
                >
                    <span style={{
                        position: 'absolute',
                        top: '3px',
                        left: enabled ? '23px' : '3px',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        background: 'var(--card)',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        transition: 'left 0.2s',
                    }} />
                </button>
                <span style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: enabled ? 'var(--ok)' : 'var(--ink-muted)',
                }}>
                    {saving ? 'Saving…' : enabled ? 'Messaging enabled' : 'Messaging disabled'}
                </span>
            </div>
            {error && (
                <p style={{ margin: 0, fontSize: '12px', color: 'var(--danger)' }}>{error}</p>
            )}
        </div>
    );
}
