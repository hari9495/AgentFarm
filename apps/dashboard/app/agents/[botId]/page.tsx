import { notFound } from 'next/navigation';
import { PageHeader } from '../../components/page-header';
import AgentControlPanel from '../../components/agent-control-panel';
import AgentPersonaPanel from '../../components/agent-persona-panel';
import AgentObservabilityPanel from '../../components/agent-observability-panel';
import AgentDecommissionButton from '../../components/agent-decommission-button';
import AgentBillingCard from '../../components/agent-billing-card';
import AgentVersionHistory from '../../components/agent-version-history';
import AgentMessagesPanel from '../../components/agent-messages-panel';
import AgentMessagingToggle from '../../components/agent-messaging-toggle';
import AgentCapabilitiesFetcher from '../../components/agent-capabilities-fetcher';
import AgentEpisodicMemoryPanel from '../../components/agent-episodic-memory-panel';
import AgentMemoryPatternFetcher from '../../components/agent-memory-pattern-fetcher';
import { getInternalSessionAuthHeader } from '../../lib/internal-session';

// ── Types ─────────────────────────────────────────────────────────────────────

type BotStatus =
    | 'created'
    | 'bootstrapping'
    | 'connector_setup_required'
    | 'active'
    | 'paused'
    | 'failed';

type Agent = {
    id: string;
    workspaceId: string;
    role: string;
    status: BotStatus;
    messagingEnabled: boolean;
    createdAt: string;
    updatedAt: string;
};

// ── Data fetch ────────────────────────────────────────────────────────────────

const getApiBaseUrl = (): string =>
    process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

async function fetchAgent(botId: string): Promise<Agent | null> {
    const auth = await getInternalSessionAuthHeader();
    if (!auth) return null;
    try {
        const res = await fetch(`${getApiBaseUrl()}/v1/agents/${encodeURIComponent(botId)}`, {
            headers: { Authorization: auth },
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { bot?: Agent };
        return body.bot ?? null;
    } catch {
        return null;
    }
}

// ── Status helpers ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<BotStatus, string> = {
    active: '#16a34a',
    created: '#2563eb',
    bootstrapping: '#d97706',
    connector_setup_required: '#f59e0b',
    paused: '#6b7280',
    failed: '#dc2626',
};

const STATUS_LABELS: Record<BotStatus, string> = {
    active: 'Active',
    created: 'Created',
    bootstrapping: 'Bootstrapping',
    connector_setup_required: 'Setup Required',
    paused: 'Paused',
    failed: 'Failed',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
    developer: 'Writes code, opens PRs, runs CI pipelines',
    fullstack_developer: 'Handles frontend and backend development tasks',
    tester: 'Runs tests, files bugs, tracks quality metrics',
    business_analyst: 'Gathers requirements, drafts specs, manages Jira',
    technical_writer: 'Produces docs, READMEs, and API references',
    content_writer: 'Creates blog posts, copy, and marketing content',
    sales_rep: 'Manages leads, follows up, logs CRM activities',
    marketing_specialist: 'Plans campaigns, tracks analytics, creates content',
    corporate_assistant: 'Manages calendar, email, and scheduling tasks',
    customer_support_executive: 'Handles tickets, chat, email, and voice queries',
    project_manager_product_owner_scrum_master: 'Runs sprints, facilitates standups, tracks velocity',
    recruiter: 'Screens candidates, schedules interviews, tracks pipeline',
};

const ROLE_ICONS: Record<string, string> = {
    developer: '💻',
    fullstack_developer: '🖥️',
    tester: '🧪',
    business_analyst: '📊',
    technical_writer: '✍️',
    content_writer: '📝',
    sales_rep: '🤝',
    marketing_specialist: '📣',
    corporate_assistant: '🗓️',
    customer_support_executive: '🎧',
    project_manager_product_owner_scrum_master: '🗂️',
    recruiter: '🔍',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BotStatus }) {
    const color = STATUS_COLORS[status] ?? '#6b7280';
    const label = STATUS_LABELS[status] ?? status;
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            padding: '4px 12px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: 600,
            background: `${color}1a`,
            color,
            border: `1px solid ${color}44`,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
        }}>
            <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
                ...(status === 'active' ? { boxShadow: `0 0 5px ${color}` } : {}),
            }} />
            {label}
        </span>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            padding: '9px 0',
            borderBottom: '1px solid #f0f0f2',
        }}>
            <span style={{ fontSize: '12px', color: '#6e6e73', flexShrink: 0, marginRight: '12px' }}>
                {label}
            </span>
            <span style={{
                fontSize: '12px',
                color: '#1d1d1f',
                fontFamily: /id|workspace/i.test(label) ? 'monospace' : undefined,
                textAlign: 'right',
                wordBreak: 'break-all',
            }}>
                {value}
            </span>
        </div>
    );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{
            background: '#ffffff',
            border: '1px solid #d2d2d7',
            borderRadius: '18px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
            <h2 style={{
                margin: '0 0 16px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#6e6e73',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
            }}>
                {title}
            </h2>
            {children}
        </div>
    );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type PageProps = { params: Promise<{ botId: string }> };

export default async function AgentDetailPage({ params }: PageProps) {
    const { botId } = await params;
    const agent = await fetchAgent(botId);

    if (!agent) notFound();

    const icon = ROLE_ICONS[agent.role] ?? '🤖';
    const description = ROLE_DESCRIPTIONS[agent.role] ?? `${agent.role} agent`;
    const shortId = agent.id.slice(-8).toUpperCase();
    const created = new Date(agent.createdAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
    const updated = new Date(agent.updatedAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    return (
        <main className="page-shell" style={{ maxWidth: '1200px', margin: '0 auto', background: '#f5f5f7', minHeight: '100vh' }}>
            {/* ── Header ─────────────────────────────────────────────────────── */}
            <PageHeader
                eyebrow="Agent Detail"
                title={`${icon} ${agent.role.replace(/_/g, ' ')}`}
                description={description}
                backHref="/agents"
                backLabel="← All Agents"
                tone="cyan"
            />

            {/* ── Identity bar ────────────────────────────────────────────────── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                padding: '16px 20px',
                background: '#ffffff',
                border: '1px solid #d2d2d7',
                borderRadius: '18px',
                marginBottom: '24px',
                flexWrap: 'wrap',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
                <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '12px',
                    background: 'rgba(0,102,204,0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                    flexShrink: 0,
                }}>
                    {icon}
                </div>
                <div style={{ flex: 1, minWidth: '160px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 700, color: '#1d1d1f', marginBottom: '3px', letterSpacing: '-0.02em' }}>
                        {agent.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </div>
                    <div style={{ fontSize: '11px', color: '#6e6e73', fontFamily: 'monospace' }}>
                        ID #{shortId}
                    </div>
                </div>
                <StatusBadge status={agent.status} />
            </div>

            {/* ── Two-column layout ────────────────────────────────────────────── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '24px',
                marginBottom: '24px',
            }}
                className="agent-detail-grid"
            >
                {/* Left column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* Agent metadata */}
                    <SectionCard title="Identity">
                        <InfoRow label="Agent ID" value={agent.id} />
                        <InfoRow label="Workspace ID" value={agent.workspaceId} />
                        <InfoRow label="Role" value={agent.role.replace(/_/g, ' ')} />
                        <InfoRow label="Status" value={STATUS_LABELS[agent.status] ?? agent.status} />
                        <InfoRow label="Created" value={created} />
                        <InfoRow label="Last updated" value={updated} />
                    </SectionCard>

                    {/* Controls — live pause / resume */}
                    <SectionCard title="Controls">
                        <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>
                            Pause or resume this agent. Pausing stops task execution while preserving all state.
                        </p>
                        <AgentControlPanel botId={botId} />
                    </SectionCard>

                    {/* Agent-to-agent messaging toggle */}
                    <SectionCard title="Agent Messaging">
                        <AgentMessagingToggle
                            botId={botId}
                            initialEnabled={agent.messagingEnabled ?? true}
                        />
                    </SectionCard>

                    {/* Danger zone */}
                    <SectionCard title="Danger Zone">
                        <p style={{ margin: '0 0 14px', fontSize: '12px', color: '#64748b', lineHeight: '1.5' }}>
                            Decommissioning permanently stops this agent and releases its VM resources.
                            This action cannot be undone.
                        </p>
                        <AgentDecommissionButton botId={botId} />
                    </SectionCard>
                </div>

                {/* Right column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                    {/* Persona */}
                    <SectionCard title="Agent Persona">
                        <AgentPersonaPanel botId={botId} />
                    </SectionCard>

                    {/* Per-agent billing */}
                    <SectionCard title="Cost (Last 30 Days)">
                        <AgentBillingCard botId={botId} />
                    </SectionCard>

                </div>
            </div>

            {/* ── Full-width observability ────────────────────────────────────── */}
            <SectionCard title="Observability & Performance">
                <AgentObservabilityPanel botId={botId} />
            </SectionCard>

            {/* ── Capabilities ─────────────────────────────────────────────────── */}
            <SectionCard title="Capabilities">
                <AgentCapabilitiesFetcher botId={botId} />
            </SectionCard>

            {/* ── Messages ─────────────────────────────────────────────────────── */}
            <SectionCard title="Messages">
                <AgentMessagesPanel botId={botId} />
            </SectionCard>

            {/* ── Version History ──────────────────────────────────────────────── */}
            <SectionCard title="Version History">
                <AgentVersionHistory botId={botId} />
            </SectionCard>

            {/* ── Episodic Memory ──────────────────────────────────────────────── */}
            <SectionCard title="Episodic Memory">
                <AgentEpisodicMemoryPanel defaultBotId={botId} />
            </SectionCard>

            {/* ── Memory Pattern Browser ───────────────────────────────────────── */}
            <SectionCard title="Memory Patterns">
                <AgentMemoryPatternFetcher botId={botId} />
            </SectionCard>

            {/* ── Quick navigation ─────────────────────────────────────────────── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '12px',
                marginTop: '24px',
            }}
                className="agent-nav-grid"
            >
                {([
                    { href: `/approvals?botId=${botId}`, label: 'Approval Queue', icon: '✅', desc: 'Review pending decisions' },
                    { href: `/agents?selected=${botId}`, label: 'Task History', icon: '📋', desc: 'View recent task executions' },
                    { href: `/settings?botId=${botId}`, label: 'Connector Settings', icon: '🔌', desc: 'Manage tool integrations' },
                ] as const).map(({ href, label, icon: navIcon, desc }) => (
                    <a
                        key={href}
                        href={href}
                        style={{
                            display: 'block',
                            padding: '16px',
                            background: '#ffffff',
                            border: '1px solid #d2d2d7',
                            borderRadius: '14px',
                            textDecoration: 'none',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                            transition: 'box-shadow 0.2s ease, transform 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                            (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)';
                            (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-2px)';
                        }}
                        onMouseLeave={(e) => {
                            (e.currentTarget as HTMLAnchorElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)';
                            (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
                        }}
                    >
                        <div style={{ fontSize: '20px', marginBottom: '6px' }}>{navIcon}</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#1d1d1f', marginBottom: '2px' }}>
                            {label}
                        </div>
                        <div style={{ fontSize: '11px', color: '#6e6e73' }}>{desc}</div>
                    </a>
                ))}
            </div>
        </main>
    );
}
