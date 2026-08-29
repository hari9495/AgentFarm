import { redirect } from 'next/navigation';
import { getSessionPayload, getInternalSessionAuthHeader } from '../lib/internal-session';
import ApiKeysPanel from '../components/api-keys-panel';
import MfaPanel from '../components/mfa-panel';
import { UiKit, Masthead, Stat } from '../components/ui-kit';
import { WfThemeToggle } from '../components/editorial';

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
        <UiKit style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            <Masthead
                eyebrow="Account — Security & Access"
                title="Settings"
                actions={<WfThemeToggle />}
                stats={<Stat n={planLabel} k="Current plan" tone={subscription.status === 'none' ? 'muted' : 'ok'} />}
            />

            <div style={{ padding: 28, maxWidth: 1120, margin: '0 auto', width: '100%', display: 'grid', gap: 24 }}>
                {/* Plan context strip */}
                {subscription.status !== 'none' && (
                    <div className="uk-panel" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div className="uk-eyebrow">Current plan</div>
                            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginTop: 2 }}>{planLabel}</div>
                        </div>
                        <a href="/billing" className="uk-eyebrow" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                            Manage billing →
                        </a>
                    </div>
                )}

                <MfaPanel />
                <ApiKeysPanel tenantId={tenantId} />
            </div>
        </UiKit>
    );
}
