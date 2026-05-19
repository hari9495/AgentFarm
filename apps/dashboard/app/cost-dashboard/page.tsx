/**
 * Cost Dashboard Page — Tier G Dashboard UX
 *
 * Displays LLM token usage, skill invocation counts, success rates,
 * and cost breakdowns by skill/provider/week.
 */

import { CostDashboardPanel } from '../components/cost-dashboard-panel';
import { PageHeader } from '../components/page-header';

export default function CostDashboardPage() {
    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Platform Observability"
                title="Cost Dashboard"
                description="LLM token usage, skill invocation analytics, and cost attribution by provider."
            />
            <CostDashboardPanel />
        </main>
    );
}
