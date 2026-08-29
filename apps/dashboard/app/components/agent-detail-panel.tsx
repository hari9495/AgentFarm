'use client';

import { useState } from 'react';
import type { Agent, BotStatus } from './agent-card';
import AgentVersionHistory from './agent-version-history';
import AgentObservabilityPanel from './agent-observability-panel';
import AgentMessagesPanel from './agent-messages-panel';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RateLimitConfig = {
    botId: string;
    requestsPerMinute: number;
    burstLimit: number;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
};

export type AgentDetailPanelProps = {
    agent: Agent;
    onStatusChange: (botId: string, newStatus: BotStatus) => void;
};

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
    return (
        <div
            style={{
                fontSize: '11px',
                fontWeight: 700,
                color: 'var(--ink-muted)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '10px',
                marginTop: '24px',
            }}
        >
            {title}
        </div>
    );
}

// ── Info row ──────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                fontSize: '13px',
                marginBottom: '8px',
            }}
        >
            <span style={{ color: 'var(--ink-muted)' }}>{label}</span>
            <span
                style={{
                    color: 'var(--ink)',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    maxWidth: '55%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textAlign: 'right',
                }}
            >
                {value}
            </span>
        </div>
    );
}

// ── Action button ─────────────────────────────────────────────────────────────

function ActionButton({
    label,
    onClick,
    variant = 'default',
    disabled = false,
    loading = false,
}: {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'danger' | 'success';
    disabled?: boolean;
    loading?: boolean;
}) {
    const colors = {
        default: { bg: 'var(--bg-deep)', border: 'var(--bg-deep)', text: 'var(--ink-muted)', hover: 'var(--bg-deep)' },
        danger: { bg: 'var(--danger-bg)', border: 'var(--danger)', text: 'var(--danger)', hover: 'var(--danger-bg)' },
        success: { bg: 'var(--ok-bg)', border: 'var(--ok)', text: 'var(--ok)', hover: 'var(--ok-bg)' },
    }[variant];

    return (
        <button
            onClick={onClick}
            disabled={disabled || loading}
            style={{
                padding: '7px 14px',
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                color: colors.text,
                fontSize: '12px',
                fontWeight: 600,
                cursor: disabled || loading ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
                if (!disabled && !loading) {
                    (e.currentTarget as HTMLButtonElement).style.background = colors.hover;
                }
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = colors.bg;
            }}
        >
            {loading ? '…' : label}
        </button>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AgentDetailPanel({ agent, onStatusChange }: AgentDetailPanelProps) {
    const [activeTab, setActiveTab] = useState<'overview' | 'rate-limit' | 'versions' | 'metrics' | 'messages'>('overview');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const [rateLimitConfig, setRateLimitConfig] = useState<RateLimitConfig | null>(null);
    const [rateLimitLoading, setRateLimitLoading] = useState(false);
    const [rateLimitDraft, setRateLimitDraft] = useState<{ rpm: string; burst: string; enabled: boolean }>({
        rpm: '60',
        burst: '10',
        enabled: true,
    });
    const [rateLimitSaving, setRateLimitSaving] = useState(false);

    const isActive = agent.status === 'active';
    const isPaused = agent.status === 'paused';

    async function handlePause() {
        setActionLoading('pause');
        setActionError(null);
        try {
            const res = await fetch(`/api/agents/${agent.id}/pause`, { method: 'POST' });
            if (res.ok) {
                onStatusChange(agent.id, 'paused');
            } else {
                const body = await res.json().catch(() => ({}));
                setActionError((body as { message?: string }).message ?? 'Failed to pause agent.');
            }
        } catch {
            setActionError('Network error while pausing agent.');
        } finally {
            setActionLoading(null);
        }
    }

    async function handleResume() {
        setActionLoading('resume');
        setActionError(null);
        try {
            const res = await fetch(`/api/agents/${agent.id}/resume`, { method: 'POST' });
            if (res.ok) {
                onStatusChange(agent.id, 'active');
            } else {
                const body = await res.json().catch(() => ({}));
                setActionError((body as { message?: string }).message ?? 'Failed to resume agent.');
            }
        } catch {
            setActionError('Network error while resuming agent.');
        } finally {
            setActionLoading(null);
        }
    }

    async function loadRateLimit() {
        setRateLimitLoading(true);
        try {
            const res = await fetch(`/api/agents/${agent.id}/rate-limit`);
            if (res.ok) {
                const data = (await res.json()) as RateLimitConfig;
                setRateLimitConfig(data);
                setRateLimitDraft({
                    rpm: String(data.requestsPerMinute),
                    burst: String(data.burstLimit),
                    enabled: data.enabled,
                });
            }
        } finally {
            setRateLimitLoading(false);
        }
    }

    async function saveRateLimit() {
        setRateLimitSaving(true);
        try {
            const payload = {
                requestsPerMinute: Number(rateLimitDraft.rpm) || 60,
                burstLimit: Number(rateLimitDraft.burst) || 10,
                enabled: rateLimitDraft.enabled,
            };
            const method = rateLimitConfig ? 'PATCH' : 'POST';
            const res = await fetch(`/api/agents/${agent.id}/rate-limit`, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (res.ok) {
                const data = (await res.json()) as RateLimitConfig;
                setRateLimitConfig(data);
            }
        } finally {
            setRateLimitSaving(false);
        }
    }

    function handleTabChange(tab: 'overview' | 'rate-limit' | 'versions' | 'metrics' | 'messages') {
        setActiveTab(tab);
        if (tab === 'rate-limit' && !rateLimitConfig && !rateLimitLoading) {
            void loadRateLimit();
        }
    }

    const tabs: { key: 'overview' | 'rate-limit' | 'versions' | 'metrics' | 'messages'; label: string }[] = [
        { key: 'overview', label: 'Overview' },
        { key: 'rate-limit', label: 'Rate Limit' },
        { key: 'versions', label: 'Versions' },
        { key: 'metrics', label: 'Metrics' },
        { key: 'messages', label: 'Messages' },
    ];

    return (
        <div
            style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                padding: '20px',
                overflowY: 'auto',
            }}
        >
            {/* Header */}
            <div style={{ marginBottom: '20px' }}>
                <div
                    style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: 'var(--ink)',
                        marginBottom: '4px',
                    }}
                >
                    {agent.role}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink-muted)', fontFamily: 'monospace' }}>
                    {agent.id}
                </div>
            </div>

            {/* Tabs */}
            <div
                style={{
                    display: 'flex',
                    gap: '4px',
                    marginBottom: '20px',
                    borderBottom: '1px solid var(--line)',
                    paddingBottom: '0',
                }}
            >
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => handleTabChange(tab.key)}
                        style={{
                            padding: '8px 14px',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab.key ? '2px solid #37A0A0' : '2px solid transparent',
                            color: activeTab === tab.key ? 'var(--info)' : 'var(--ink-muted)',
                            fontSize: '13px',
                            fontWeight: activeTab === tab.key ? 600 : 400,
                            cursor: 'pointer',
                            marginBottom: '-1px',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Error banner */}
            {actionError && (
                <div
                    style={{
                        padding: '10px 14px',
                        background: 'var(--danger-bg)',
                        border: '1px solid var(--danger-border)',
                        borderRadius: '6px',
                        color: 'var(--danger)',
                        fontSize: '12px',
                        marginBottom: '16px',
                    }}
                >
                    {actionError}
                </div>
            )}

            {/* Tab: Overview */}
            {activeTab === 'overview' && (
                <div>
                    <SectionHeader title="Identity" />
                    <InfoRow label="Bot ID" value={agent.id} />
                    <InfoRow label="Workspace" value={agent.workspaceId} />
                    <InfoRow label="Role" value={agent.role} />
                    <InfoRow label="Status" value={agent.status} />
                    <InfoRow
                        label="Created"
                        value={new Date(agent.createdAt).toLocaleString()}
                    />
                    <InfoRow
                        label="Updated"
                        value={new Date(agent.updatedAt).toLocaleString()}
                    />

                    <SectionHeader title="Controls" />
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {isActive && (
                            <ActionButton
                                label="Pause Agent"
                                variant="danger"
                                loading={actionLoading === 'pause'}
                                onClick={handlePause}
                            />
                        )}
                        {isPaused && (
                            <ActionButton
                                label="Resume Agent"
                                variant="success"
                                loading={actionLoading === 'resume'}
                                onClick={handleResume}
                            />
                        )}
                        {!isActive && !isPaused && (
                            <span style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>
                                Pause / resume available when agent is active or paused.
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Tab: Rate Limit */}
            {activeTab === 'rate-limit' && (
                <div>
                    <SectionHeader title="Rate Limit Config" />
                    {rateLimitLoading ? (
                        <p style={{ color: 'var(--ink-muted)', fontSize: '13px' }}>Loading…</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '14px' }}>
                            <div>
                                <label style={{ fontSize: '12px', color: 'var(--ink-muted)', display: 'block', marginBottom: '4px' }}>
                                    Requests per minute
                                </label>
                                <input
                                    type="number"
                                    value={rateLimitDraft.rpm}
                                    onChange={(e) => setRateLimitDraft((d) => ({ ...d, rpm: e.target.value }))}
                                    style={{
                                        padding: '7px 10px',
                                        background: 'var(--bg)',
                                        border: '1px solid var(--line)',
                                        borderRadius: '6px',
                                        color: 'var(--ink)',
                                        fontSize: '13px',
                                        width: '120px',
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '12px', color: 'var(--ink-muted)', display: 'block', marginBottom: '4px' }}>
                                    Burst limit
                                </label>
                                <input
                                    type="number"
                                    value={rateLimitDraft.burst}
                                    onChange={(e) => setRateLimitDraft((d) => ({ ...d, burst: e.target.value }))}
                                    style={{
                                        padding: '7px 10px',
                                        background: 'var(--bg)',
                                        border: '1px solid var(--line)',
                                        borderRadius: '6px',
                                        color: 'var(--ink)',
                                        fontSize: '13px',
                                        width: '120px',
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                    type="checkbox"
                                    checked={rateLimitDraft.enabled}
                                    onChange={(e) => setRateLimitDraft((d) => ({ ...d, enabled: e.target.checked }))}
                                    id="rate-limit-enabled"
                                />
                                <label
                                    htmlFor="rate-limit-enabled"
                                    style={{ fontSize: '13px', color: 'var(--ink-muted)', cursor: 'pointer' }}
                                >
                                    Enabled
                                </label>
                            </div>
                            <ActionButton
                                label={rateLimitSaving ? 'Saving…' : 'Save'}
                                onClick={saveRateLimit}
                                loading={rateLimitSaving}
                                variant="success"
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Tab: Versions */}
            {activeTab === 'versions' && (
                <AgentVersionHistory botId={agent.id} />
            )}

            {/* Tab: Metrics */}
            {activeTab === 'metrics' && (
                <AgentObservabilityPanel botId={agent.id} />
            )}

            {/* Tab: Messages */}
            {activeTab === 'messages' && (
                <AgentMessagesPanel botId={agent.id} />
            )}
        </div>
    );
}
