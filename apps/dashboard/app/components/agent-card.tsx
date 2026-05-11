'use client';

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
    active:                    '#16a34a',
    created:                   '#2563eb',
    bootstrapping:             '#d97706',
    connector_setup_required:  '#f59e0b',
    paused:                    '#6b7280',
    failed:                    '#dc2626',
};

const STATUS_LABELS: Record<BotStatus, string> = {
    active:                    'Active',
    created:                   'Created',
    bootstrapping:             'Bootstrapping',
    connector_setup_required:  'Setup Required',
    paused:                    'Paused',
    failed:                    'Failed',
};

function StatusBadge({ status }: { status: BotStatus }) {
    const color = STATUS_COLORS[status] ?? '#6b7280';
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
                background: selected ? '#1e293b' : 'transparent',
                border: selected ? '1px solid #334155' : '1px solid transparent',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
                if (!selected) {
                    (e.currentTarget as HTMLButtonElement).style.background = '#0f172a';
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
                        background: '#1e3a5f',
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
                            color: '#e2e8f0',
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
                            color: '#64748b',
                            fontFamily: 'monospace',
                            marginBottom: '6px',
                        }}
                    >
                        #{shortId}
                    </div>
                    <StatusBadge status={agent.status} />
                </div>
            </div>
        </button>
    );
}
