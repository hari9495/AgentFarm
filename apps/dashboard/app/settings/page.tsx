import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionPayload, getInternalSessionAuthHeader } from '../lib/internal-session';
import { SubscriptionStatusCard } from '../components/subscription-status-card';
import ApiKeysPanel from '../components/api-keys-panel';
import CircuitBreakersPanel from '../components/circuit-breakers-panel';
import TaskQueuePanel from '../components/task-queue-panel';

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

export default async function SettingsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/settings');
    }

    const { tenantId } = session;
    const authHeader = await getInternalSessionAuthHeader();
    const subscription = authHeader
        ? await fetchSubscription(tenantId, authHeader)
        : { status: 'none' };

    return (
        <main className="page-shell">
            <header style={{ marginBottom: '2rem' }}>
                <Link
                    href="/"
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        fontSize: '0.8rem',
                        color: 'var(--ink-muted)',
                        textDecoration: 'none',
                        marginBottom: '0.75rem',
                    }}
                >
                    ← Dashboard
                </Link>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-muted)', marginBottom: '0.35rem' }}>
                    Settings &amp; Ops
                </p>
                <h1 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--ink)', marginBottom: '0.35rem' }}>
                    Operational Settings
                </h1>
                <p style={{ color: 'var(--ink-muted)', fontSize: '0.95rem' }}>
                    Manage API keys, inspect circuit breaker state, and monitor the task queue.
                </p>
            </header>

            <SubscriptionStatusCard
                status={subscription.status}
                expiresAt={subscription.expiresAt}
                gracePeriodDays={subscription.gracePeriodDays}
                suspendedAt={subscription.suspendedAt}
                daysUntilSuspension={subscription.daysUntilSuspension}
            />

            <div style={{ marginTop: '2rem' }}>
                <ApiKeysPanel tenantId={tenantId} />
                <CircuitBreakersPanel tenantId={tenantId} />
                <TaskQueuePanel tenantId={tenantId} />
            </div>
        </main>
    );
}
