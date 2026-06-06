import { redirect } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '../../components/page-header';
import { getSessionPayload, getInternalSessionAuthHeader } from '../../lib/internal-session';
import { DisclosureSettingsPanel } from '../../components/disclosure-settings-panel';

const getApiBaseUrl = (): string => process.env.DASHBOARD_API_BASE_URL ?? 'http://localhost:3000';

async function fetchFirstBotId(authHeader: string): Promise<string | null> {
    try {
        const res = await fetch(`${getApiBaseUrl()}/v1/agents`, {
            headers: { Authorization: authHeader },
            cache: 'no-store',
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { agents?: { id: string }[] };
        return data.agents?.[0]?.id ?? null;
    } catch {
        return null;
    }
}

export default async function DisclosureSettingsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login');
    }
    const authHeader = await getInternalSessionAuthHeader();
    const firstBotId = authHeader ? await fetchFirstBotId(authHeader) : null;

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Compliance"
                title="AI Disclosure Settings"
                description="Configure your agent's AI disclosure statement. Required by EU AI Act Art. 52 and FTC guidelines."
                backHref="/settings"
                backLabel="← Settings"
            />

            {firstBotId ? (
                <DisclosureSettingsPanel botId={firstBotId} />
            ) : (
                <div style={{ padding: '1.5rem', border: '1px solid var(--border, #e5e7eb)', borderRadius: '0.5rem', background: 'var(--bg)' }}>
                    <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
                        No agents found. Create an agent first to configure disclosure settings.
                    </p>
                    <Link
                        href="/settings"
                        style={{ display: 'inline-block', marginTop: '0.75rem', fontSize: '0.875rem', color: 'var(--accent)' }}
                    >
                        Go to Settings →
                    </Link>
                </div>
            )}
        </main>
    );
}
