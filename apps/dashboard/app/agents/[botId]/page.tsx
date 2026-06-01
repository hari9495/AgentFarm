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

// ── Status → badge class ──────────────────────────────────────────────────────

const STATUS_BADGE: Record<BotStatus, string> = {
    active:                   'ok',
    created:                  'info',
    bootstrapping:            'warn',
    connector_setup_required: 'warn',
    paused:                   'neutral',
    failed:                   'high',
};

const STATUS_LABELS: Record<BotStatus, string> = {
    active:                   'Active',
    created:                  'Created',
    bootstrapping:            'Bootstrapping',
    connector_setup_required: 'Setup Required',
    paused:                   'Paused',
    failed:                   'Failed',
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
    developer:                                     'Writes code, opens PRs, runs CI pipelines',
    fullstack_developer:                           'Handles frontend and backend development tasks',
    tester:                                        'Runs tests, files bugs, tracks quality metrics',
    business_analyst:                              'Gathers requirements, drafts specs, manages Jira',
    technical_writer:                              'Produces docs, READMEs, and API references',
    content_writer:                                'Creates blog posts, copy, and marketing content',
    sales_rep:                                     'Manages leads, follows up, logs CRM activities',
    marketing_specialist:                          'Plans campaigns, tracks analytics, creates content',
    corporate_assistant:                           'Manages calendar, email, and scheduling tasks',
    customer_support_executive:                    'Handles tickets, chat, email, and voice queries',
    project_manager_product_owner_scrum_master:    'Runs sprints, facilitates standups, tracks velocity',
    recruiter:                                     'Screens candidates, schedules interviews, tracks pipeline',
};

const ROLE_ICONS: Record<string, string> = {
    developer:                                  '💻',
    fullstack_developer:                        '🖥️',
    tester:                                     '🧪',
    business_analyst:                           '📊',
    technical_writer:                           '✍️',
    content_writer:                             '📝',
    sales_rep:                                  '🤝',
    marketing_specialist:                       '📣',
    corporate_assistant:                        '🗓️',
    customer_support_executive:                 '🎧',
    project_manager_product_owner_scrum_master: '🗂️',
    recruiter:                                  '🔍',
};

// ── Page ───────────────────────────────────────────────────────────────────────

type PageProps = { params: Promise<{ botId: string }> };

export default async function AgentDetailPage({ params }: PageProps) {
    const { botId } = await params;
    const agent = await fetchAgent(botId);

    if (!agent) notFound();

    const icon        = ROLE_ICONS[agent.role] ?? '🤖';
    const description = ROLE_DESCRIPTIONS[agent.role] ?? `${agent.role} agent`;
    const roleLabel   = agent.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    const shortId     = agent.id.slice(-8).toUpperCase();
    const badgeClass  = `badge ${STATUS_BADGE[agent.status] ?? 'neutral'}`;

    const created = new Date(agent.createdAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
    const updated = new Date(agent.updatedAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    return (
        <main className="page-shell">
            {/* ── Header ──────────────────────────────────────────────────── */}
            <PageHeader
                eyebrow="Agent Detail"
                title={`${icon} ${roleLabel}`}
                description={description}
                backHref="/agents"
                backLabel="← All Agents"
                tone="cyan"
            />

            {/* ── Identity bar ─────────────────────────────────────────────── */}
            <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <div style={{
                    width: 48, height: 48, borderRadius: 'var(--radius-md)',
                    background: 'var(--brand-light)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px', flexShrink: 0,
                }}>
                    {icon}
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                        {roleLabel}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontFamily: 'monospace', marginTop: 2 }}>
                        ID #{shortId} · {agent.workspaceId}
                    </div>
                </div>
                <span className={badgeClass}>
                    {STATUS_LABELS[agent.status] ?? agent.status}
                </span>
            </div>

            {/* ── Two-column grid ──────────────────────────────────────────── */}
            <div className="agent-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.1rem' }}>

                {/* ── Left column ─────────────────────────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

                    {/* Identity */}
                    <section className="card">
                        <h2>Identity</h2>
                        <ul className="kv-list">
                            <li><span>Agent ID</span>     <strong style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{agent.id}</strong></li>
                            <li><span>Workspace</span>    <strong style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{agent.workspaceId}</strong></li>
                            <li><span>Role</span>         <strong>{agent.role.replace(/_/g, ' ')}</strong></li>
                            <li><span>Status</span>       <strong><span className={badgeClass}>{STATUS_LABELS[agent.status] ?? agent.status}</span></strong></li>
                            <li><span>Created</span>      <strong suppressHydrationWarning>{created}</strong></li>
                            <li><span>Last updated</span> <strong suppressHydrationWarning>{updated}</strong></li>
                        </ul>
                    </section>

                    {/* Controls */}
                    <section className="card">
                        <h2>Controls</h2>
                        <p style={{ margin: '0 0 0.85rem', fontSize: '0.84rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
                            Pause or resume this agent. Pausing stops task execution while preserving all state.
                        </p>
                        <AgentControlPanel botId={botId} />
                    </section>

                    {/* Agent Messaging */}
                    <section className="card">
                        <h2>Agent Messaging</h2>
                        <AgentMessagingToggle
                            botId={botId}
                            initialEnabled={agent.messagingEnabled ?? true}
                        />
                    </section>

                    {/* Danger zone */}
                    <section className="card" style={{ borderColor: 'var(--danger-border)', background: 'var(--danger-bg)' }}>
                        <h2 style={{ color: 'var(--danger)' }}>Danger Zone</h2>
                        <p style={{ margin: '0 0 0.85rem', fontSize: '0.84rem', color: 'var(--ink-muted)', lineHeight: 1.5 }}>
                            Decommissioning permanently stops this agent and releases its VM resources.
                            This action cannot be undone.
                        </p>
                        <AgentDecommissionButton botId={botId} />
                    </section>
                </div>

                {/* ── Right column ────────────────────────────────────────── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>

                    {/* Persona */}
                    <section className="card">
                        <h2>Agent Persona</h2>
                        <AgentPersonaPanel botId={botId} />
                    </section>

                    {/* Billing */}
                    <section className="card">
                        <h2>Cost — Last 30 Days</h2>
                        <AgentBillingCard botId={botId} />
                    </section>
                </div>
            </div>

            {/* ── Full-width sections ──────────────────────────────────────── */}
            <section className="card">
                <h2>Observability &amp; Performance</h2>
                <AgentObservabilityPanel botId={botId} />
            </section>

            <section className="card">
                <h2>Capabilities</h2>
                <AgentCapabilitiesFetcher botId={botId} />
            </section>

            <section className="card">
                <h2>Messages</h2>
                <AgentMessagesPanel botId={botId} />
            </section>

            <section className="card">
                <h2>Version History</h2>
                <AgentVersionHistory botId={botId} />
            </section>

            <section className="card">
                <h2>Episodic Memory</h2>
                <AgentEpisodicMemoryPanel defaultBotId={botId} />
            </section>

            <section className="card">
                <h2>Memory Patterns</h2>
                <AgentMemoryPatternFetcher botId={botId} />
            </section>

            {/* ── Quick navigation ─────────────────────────────────────────── */}
            <style>{`.agent-nav-card{display:block;padding:1rem 1.1rem;background:var(--card);border:1px solid var(--line);border-radius:var(--radius-lg);text-decoration:none;box-shadow:var(--shadow-sm);transition:box-shadow var(--ease-spring) 0.2s,transform var(--ease-spring) 0.2s}.agent-nav-card:hover{box-shadow:var(--shadow-md);transform:translateY(-2px)}`}</style>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem' }}>
                {([
                    { href: `/approvals?botId=${botId}`, label: 'Approval Queue',     icon: '✅', desc: 'Review pending decisions'    },
                    { href: `/agents?selected=${botId}`, label: 'Task History',       icon: '📋', desc: 'View recent task executions' },
                    { href: `/settings?botId=${botId}`,  label: 'Connector Settings', icon: '🔌', desc: 'Manage tool integrations'    },
                ] as const).map(({ href, label, icon: ni, desc }) => (
                    <a key={href} href={href} className="agent-nav-card">
                        <div style={{ fontSize: '20px', marginBottom: '0.4rem' }}>{ni}</div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '0.2rem' }}>{label}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--ink-muted)' }}>{desc}</div>
                    </a>
                ))}
            </div>
        </main>
    );
}
