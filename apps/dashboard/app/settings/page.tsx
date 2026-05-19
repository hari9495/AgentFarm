import { redirect } from 'next/navigation';
import { getSessionPayload, getInternalSessionAuthHeader } from '../lib/internal-session';
import { SubscriptionStatusCard } from '../components/subscription-status-card';
import ApiKeysPanel from '../components/api-keys-panel';
import CircuitBreakersPanel from '../components/circuit-breakers-panel';
import TaskQueuePanel from '../components/task-queue-panel';
import AgentPersonaPanel from '../components/agent-persona-panel';
import { PageHeader } from '../components/page-header';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

type SubscriptionData = {
    status: string;
    expiresAt?: string | null;
    gracePeriodDays?: number;
    suspendedAt?: string | null;
    daysUntilSuspension?: number | null;
};

async function fetchSubscription(tenantId: string, authHeader: string): Promise<SubscriptionData> {
    try {
        const res = await fetch(
            `${getApiBaseUrl()}/v1/billing/subscription?tenantId=${encodeURIComponent(tenantId)}`,
            { headers: { Authorization: authHeader }, cache: 'no-store' },
        );
        if (!res.ok) return { status: 'none' };
        return (await res.json()) as SubscriptionData;
    } catch {
        return { status: 'none' };
    }
}

async function fetchFirstBotId(authHeader: string): Promise<string | null> {
    try {
        const res = await fetch(`${getApiBaseUrl()}/v1/agents`, {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { bots?: { id: string }[] };
        return data.bots?.[0]?.id ?? null;
    } catch {
        return null;
    }
}

export default async function SettingsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/settings');
    }

    const { tenantId } = session;
    const authHeader = await getInternalSessionAuthHeader();
    const [subscription, firstBotId] = await Promise.all([
        authHeader ? fetchSubscription(tenantId, authHeader) : Promise.resolve({ status: 'none' } as SubscriptionData),
        authHeader ? fetchFirstBotId(authHeader) : Promise.resolve(null),
    ]);

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Settings &amp; Ops"
                title="Operational Settings"
                description="Manage API keys, inspect circuit breaker state, and monitor the task queue."
            />

            <SubscriptionStatusCard
                status={subscription.status}
                expiresAt={subscription.expiresAt}
                gracePeriodDays={subscription.gracePeriodDays}
                suspendedAt={subscription.suspendedAt}
                daysUntilSuspension={subscription.daysUntilSuspension}
            />

            <div style={{ marginTop: '2rem' }}>
                {firstBotId && (
                    <>
                        <AgentPersonaPanel botId={firstBotId} />
                        <hr style={{ border: 'none', borderTop: '1px solid var(--border, #e5e7eb)', margin: '1.5rem 0' }} />
                    </>
                )}
                <ApiKeysPanel tenantId={tenantId} />
                <CircuitBreakersPanel tenantId={tenantId} />
                <TaskQueuePanel tenantId={tenantId} />
            </div>
        </main>
    );
}
