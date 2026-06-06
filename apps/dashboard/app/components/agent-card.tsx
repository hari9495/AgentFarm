'use client';

import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

export type BotStatus =
    | 'created'
    | 'bootstrapping'
    | 'connector_setup_required'
    | 'active'
    | 'paused'
    | 'failed';

export type Agent = {
    id: string;
    workspaceId: string;
    role: string;
    status: BotStatus;
    createdAt: string;
    updatedAt: string;
};

export type AgentCardProps = {
    agent: Agent;
    selected: boolean;
    onClick: () => void;
};

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<BotStatus, string> = {
    active: 'var(--ok)',
    created: 'var(--info)',
    bootstrapping: 'var(--warn)',
    connector_setup_required: 'var(--warn)',
    paused: 'var(--ink-muted)',
    failed: 'var(--danger)',
};

const STATUS_LABELS: Record<BotStatus, string> = {
    active: 'Active',
    created: 'Created',
    bootstrapping: 'Bootstrapping',
    connector_setup_required: 'Setup Required',
    paused: 'Paused',
    failed: 'Failed',
};

function StatusBadge({ status }: { status: BotStatus }) {
    const color = STATUS_COLORS[status] ?? 'var(--ink-muted)';
    const label = STATUS_LABELS[status] ?? status;
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 600,
                background: `${color}22`,
                color,
                border: `1px solid ${color}44`,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
            }}
        >
            <span
                style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: color,
                    flexShrink: 0,
                }}
            />
            {label}
        </span>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AgentCard({ agent, selected, onClick }: AgentCardProps) {
    const shortId = agent.id.slice(-6).toUpperCase();

    return (
        <button
            onClick={onClick}
            style={{
                width: '100%',
                textAlign: 'left',
                padding: '14px 16px',
                background: selected ? 'var(--bg-deep)' : 'transparent',
                border: selected ? '1px solid #334155' : '1px solid transparent',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
                if (!selected) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'var(--ink)';
                }
            }}
            onMouseLeave={(e) => {
                if (!selected) {
                    (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
                }
            }}
        >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                {/* Icon */}
                <div
                    style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        background: 'var(--info)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        flexShrink: 0,
                    }}
                >
                    🤖
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                        style={{
                            fontSize: '13px',
                            fontWeight: 600,
                            color: 'var(--ink)',
                            marginBottom: '2px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {agent.role}
                    </div>
                    <div
                        style={{
                            fontSize: '11px',
                            color: 'var(--ink-muted)',
                            fontFamily: 'monospace',
                            marginBottom: '6px',
                        }}
                    >
                        #{shortId}
                    </div>
                    <StatusBadge status={agent.status} />
                    <div style={{ marginTop: '8px' }}>
                        <Link
                            href={`/agents/${agent.id}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                                fontSize: '11px',
                                color: 'var(--info)',
                                textDecoration: 'none',
                                fontWeight: 500,
                            }}
                        >
                            View details →
                        </Link>
                    </div>
                </div>
            </div>
        </button>
    );
}
