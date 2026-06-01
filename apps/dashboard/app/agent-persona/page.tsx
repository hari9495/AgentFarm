import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload, getInternalSessionAuthHeader } from '../lib/internal-session';
import AgentPersonaPanel from '../components/agent-persona-panel';
import Link from 'next/link';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

async function fetchBots(authHeader: string): Promise<{ id: string; name: string }[]> {
    try {
        const res = await fetch(`${getApiBaseUrl()}/v1/agents`, {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
        if (!res.ok) return [];
        const data = (await res.json()) as { bots?: { id: string; name?: string }[] };
        return (data.bots ?? []).map(b => ({ id: b.id, name: b.name ?? b.id }));
    } catch {
        return [];
    }
}

export default async function AgentPersonaPage({
    searchParams,
}: {
    searchParams: Promise<{ botId?: string }>;
}) {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/agent-persona');
    }

    const authHeader = await getInternalSessionAuthHeader();
    const bots = authHeader ? await fetchBots(authHeader) : [];

    const { botId: qBotId } = await searchParams;
    const activeBotId = qBotId ?? bots[0]?.id ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Configuration"
                title="Agent Personas"
                description="Configure the public identity each agent uses when communicating with customers — name, email, tone, language, and disclosure."
            />

            {bots.length === 0 && (
                <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
                    <p className="panel-muted">No agents found in this workspace.</p>
                    <Link href="/agents" className="primary-action" style={{ display: 'inline-block', marginTop: '0.75rem', textDecoration: 'none' }}>
                        Go to Agents →
                    </Link>
                </div>
            )}

            {/* Bot selector when there are multiple bots */}
            {bots.length > 1 && (
                <div className="card" style={{ marginBottom: '1.25rem', padding: '0.85rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>Select agent:</span>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {bots.map(b => (
                            <Link
                                key={b.id}
                                href={`/agent-persona?botId=${encodeURIComponent(b.id)}`}
                                style={{
                                    padding: '0.3rem 0.85rem',
                                    borderRadius: '99px',
                                    fontSize: '0.8rem',
                                    fontWeight: 500,
                                    border: '1px solid var(--line)',
                                    textDecoration: 'none',
                                    background: activeBotId === b.id ? 'var(--brand)' : 'transparent',
                                    color: activeBotId === b.id ? '#fff' : 'var(--ink)',
                                }}
                            >
                                {b.name}
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {activeBotId && <AgentPersonaPanel botId={activeBotId} />}
        </main>
    );
}
