'use client';

import { useCallback, useEffect, useState } from 'react';

type BudgetConfig = {
    id: string;
    daily_limit_usd: number | null;
    monthly_limit_usd: number | null;
    enabled: boolean;
    updated_at: string;
};

type Spend = {
    month_to_date_usd: number;
    day_to_date_usd: number;
};

type BudgetData = {
    bot_id: string;
    config: BudgetConfig | null;
    spend: Spend;
};

const fmtUsd = (v: number) => `$${v.toFixed(2)}`;

function SpendBar({ spent, limit, label }: { spent: number; limit: number | null; label: string }) {
    if (!limit) return null;
    const pct = Math.min((spent / limit) * 100, 100);
    const color = pct >= 100 ? '#c4161c' : pct >= 80 ? '#b45309' : '#1a7a4a';
    return (
        <div style={{ display: 'grid', gap: '0.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#57534e' }}>
                <span>{label}</span>
                <span style={{ fontWeight: 600, color }}>{fmtUsd(spent)} / {fmtUsd(limit)}</span>
            </div>
            <div style={{ height: 6, background: '#f3f4f6', borderRadius: 9999, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct.toFixed(1)}%`, background: color, borderRadius: 9999, transition: 'width 0.4s' }} />
            </div>
            {pct >= 80 && (
                <div style={{ fontSize: '0.72rem', color, fontWeight: 600 }}>
                    {pct >= 100 ? '⛔ Cap reached' : `⚠ ${pct.toFixed(0)}% of cap used`}
                </div>
            )}
        </div>
    );
}

export function AgentBudgetCapCard({ botId }: { botId: string }) {
    const [data, setData] = useState<BudgetData | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [removing, setRemoving] = useState(false);
    const [editing, setEditing] = useState(false);
    const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

    // form state
    const [dailyLimit, setDailyLimit] = useState('');
    const [monthlyLimit, setMonthlyLimit] = useState('');
    const [capEnabled, setCapEnabled] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch(`/api/agents/${encodeURIComponent(botId)}/budget`);
            if (!res.ok) return;
            const body = (await res.json()) as BudgetData;
            setData(body);
            if (body.config) {
                setDailyLimit(body.config.daily_limit_usd?.toString() ?? '');
                setMonthlyLimit(body.config.monthly_limit_usd?.toString() ?? '');
                setCapEnabled(body.config.enabled);
            }
        } finally {
            setLoading(false);
        }
    }, [botId]);

    useEffect(() => { void fetchData(); }, [fetchData]);

    const openEdit = () => {
        if (data?.config) {
            setDailyLimit(data.config.daily_limit_usd?.toString() ?? '');
            setMonthlyLimit(data.config.monthly_limit_usd?.toString() ?? '');
            setCapEnabled(data.config.enabled);
        } else {
            setDailyLimit('');
            setMonthlyLimit('');
            setCapEnabled(true);
        }
        setMessage(null);
        setEditing(true);
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const payload: Record<string, unknown> = { enabled: capEnabled };
            if (dailyLimit.trim()) payload.daily_limit_usd = parseFloat(dailyLimit);
            else payload.daily_limit_usd = null;
            if (monthlyLimit.trim()) payload.monthly_limit_usd = parseFloat(monthlyLimit);
            else payload.monthly_limit_usd = null;

            const res = await fetch(`/api/agents/${encodeURIComponent(botId)}/budget`, {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const err = (await res.json().catch(() => ({}))) as { message?: string };
                setMessage({ text: err.message ?? 'Failed to save.', ok: false });
                return;
            }
            setMessage({ text: 'Budget cap saved.', ok: true });
            setEditing(false);
            await fetchData();
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async () => {
        if (!window.confirm('Remove budget cap for this agent?')) return;
        setRemoving(true);
        try {
            await fetch(`/api/agents/${encodeURIComponent(botId)}/budget`, { method: 'DELETE' });
            setData((prev) => prev ? { ...prev, config: null } : null);
            setEditing(false);
            setMessage({ text: 'Budget cap removed.', ok: true });
        } finally {
            setRemoving(false);
        }
    };

    if (loading) {
        return (
            <section className="card">
                <h2>Budget Cap</h2>
                <p style={{ margin: 0, fontSize: '0.83rem', color: '#78716c' }}>Loading…</p>
            </section>
        );
    }

    const cfg = data?.config;
    const spend = data?.spend;

    return (
        <section className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h2 style={{ margin: 0 }}>Budget Cap</h2>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {cfg && !editing && (
                        <button type="button" className="chip-button" onClick={() => void handleRemove()} disabled={removing}>
                            {removing ? 'Removing…' : 'Remove'}
                        </button>
                    )}
                    {!editing && (
                        <button type="button" className="chip-button" onClick={openEdit}>
                            {cfg ? 'Edit cap' : 'Set cap'}
                        </button>
                    )}
                </div>
            </div>

            {message && (
                <p style={{ margin: '0 0 0.65rem', fontSize: '0.82rem', color: message.ok ? '#1a7a4a' : '#c4161c' }}>
                    {message.text}
                </p>
            )}

            {!cfg && !editing && (
                <p style={{ margin: 0, fontSize: '0.83rem', color: '#78716c' }}>
                    No spending cap set. This agent uses the workspace-level budget policy.
                </p>
            )}

            {cfg && !editing && (
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#57534e' }}>
                        <span style={{ padding: '0.15rem 0.5rem', borderRadius: 9999, background: cfg.enabled ? 'rgba(26,122,74,0.08)' : '#f3f4f6', color: cfg.enabled ? '#1a7a4a' : '#6b7280', fontSize: '0.72rem', fontWeight: 700 }}>
                            {cfg.enabled ? 'active' : 'disabled'}
                        </span>
                        <span>Per-agent cap</span>
                    </div>
                    {spend && (
                        <>
                            <SpendBar spent={spend.day_to_date_usd} limit={cfg.daily_limit_usd} label="Today" />
                            <SpendBar spent={spend.month_to_date_usd} limit={cfg.monthly_limit_usd} label="This month" />
                        </>
                    )}
                    {!cfg.daily_limit_usd && !cfg.monthly_limit_usd && (
                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#78716c' }}>
                            Cap is configured but no limits set. Click &ldquo;Edit cap&rdquo; to add limits.
                        </p>
                    )}
                </div>
            )}

            {editing && (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                    <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.82rem', fontWeight: 600 }}>
                        Daily limit (USD)
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ color: '#57534e' }}>$</span>
                            <input
                                type="number" min="0" step="0.01"
                                value={dailyLimit}
                                onChange={(e) => setDailyLimit(e.target.value)}
                                placeholder="e.g. 5.00 — leave blank for no limit"
                                className="approval-input"
                                style={{ flex: 1 }}
                            />
                        </div>
                    </label>
                    <label style={{ display: 'grid', gap: '0.25rem', fontSize: '0.82rem', fontWeight: 600 }}>
                        Monthly limit (USD)
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span style={{ color: '#57534e' }}>$</span>
                            <input
                                type="number" min="0" step="0.01"
                                value={monthlyLimit}
                                onChange={(e) => setMonthlyLimit(e.target.value)}
                                placeholder="e.g. 50.00 — leave blank for no limit"
                                className="approval-input"
                                style={{ flex: 1 }}
                            />
                        </div>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox" checked={capEnabled}
                            onChange={(e) => setCapEnabled(e.target.checked)}
                            style={{ width: 15, height: 15 }}
                        />
                        Enforce this cap (uncheck to pause enforcement)
                    </label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <button type="button" className="primary-action" onClick={() => void handleSave()} disabled={saving}>
                            {saving ? 'Saving…' : 'Save cap'}
                        </button>
                        <button type="button" className="chip-button" onClick={() => setEditing(false)} disabled={saving}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
