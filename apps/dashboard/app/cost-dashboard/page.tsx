/**
 * Cost Dashboard Page — Tier G Dashboard UX
 *
 * Displays LLM token usage, skill invocation counts, success rates,
 * and cost breakdowns by skill/provider/week.
 */

import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import { CostDashboardPanel } from '../components/cost-dashboard-panel';
import CostForecastPanel from '../components/cost-forecast-panel';
import { PageHeader } from '../components/page-header';

export default async function CostDashboardPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/cost-dashboard');

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Platform Observability"
                title="Cost Dashboard"
                description="LLM token usage, skill invocation analytics, cost attribution by provider, and month-end forecast."
            />
            <CostForecastPanel tenantId={session.tenantId} />
            <CostDashboardPanel />
        </main>
    );
}
