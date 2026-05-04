/**
 * Cost Dashboard Page — Tier G Dashboard UX
 *
 * Displays LLM token usage, skill invocation counts, success rates,
 * and cost breakdowns by skill/provider/week.
 */

import { CostDashboardPanel } from '../components/cost-dashboard-panel';

export default function CostDashboardPage() {
    return (
        <main className="page-shell" style={{ maxWidth: 1100 }}>
            <header className="hero" style={{ marginBottom: '0.3rem' }}>
                <p className="eyebrow">Platform Observability</p>
                <h1>Cost Dashboard</h1>
                <p>LLM token usage, skill invocation analytics, and cost attribution by provider.</p>
            </header>
            <CostDashboardPanel />
        </main>
    );
}
