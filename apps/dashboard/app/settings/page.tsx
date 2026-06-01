import { redirect } from 'next/navigation';
import { getSessionPayload, getInternalSessionAuthHeader } from '../lib/internal-session';
import ApiKeysPanel from '../components/api-keys-panel';
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

export default async function SettingsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/settings');
    }

    const { tenantId } = session;
    const authHeader = await getInternalSessionAuthHeader();
    const subscription = authHeader
        ? await fetchSubscription(tenantId, authHeader)
        : { status: 'none' } as SubscriptionData;

    const planLabel = subscription.status === 'none' ? 'No active plan' : subscription.status;

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Developer Access"
                title="API Keys"
                description="Create and manage API keys for CI pipelines, scripts, and external integrations."
            />

            {/* Plan context strip */}
            {subscription.status !== 'none' && (
                <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem' }}>
                    <div>
                        <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-muted)' }}>Current plan</p>
                        <p style={{ margin: '0.15rem 0 0', fontSize: '0.95rem', fontWeight: 600, color: 'var(--ink)' }}>{planLabel}</p>
                    </div>
                    <a href="/billing" style={{ fontSize: '0.82rem', color: 'var(--brand)', fontWeight: 600, textDecoration: 'none' }}>
                        Manage billing →
                    </a>
                </div>
            )}

            <ApiKeysPanel tenantId={tenantId} />
        </main>
    );
}
