import { GovernanceKPIPanel } from '../../components/governance-kpis-panel';

type SearchParams = {
    workspaceId?: string;
};

export default async function GovernanceKPIsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const params = await searchParams;
    const workspaceId = params.workspaceId?.trim() || 'ws_primary_001';

    return (
        <main style={{ maxWidth: 1100, margin: '1.5rem auto', padding: '0 1rem' }}>
            <h1>Governance KPIs</h1>
            <p style={{ marginTop: '-0.45rem', color: '#57534e' }}>
                Real-time KPI snapshot across approvals, audit, budget, providers, and execution.
            </p>
            <GovernanceKPIPanel workspaceId={workspaceId} />
        </main>
    );
}
