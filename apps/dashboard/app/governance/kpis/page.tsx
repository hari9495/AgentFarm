import { GovernanceKPIPanel } from '../../components/governance-kpis-panel';
import { PageHeader } from '../../components/page-header';

type SearchParams = {
    workspaceId?: string;
};

export default async function GovernanceKPIsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const params = await searchParams;
    const workspaceId = params.workspaceId?.trim() || 'ws_primary_001';

    return (
        <main className="page-shell" style={{ maxWidth: 1100 }}>
            <PageHeader
                eyebrow="Governance"
                title="Governance KPIs"
                description="Real-time KPI snapshot across approvals, audit, budget, providers, and execution."
                backHref="/governance"
                backLabel="← Governance"
                tone="violet"
            />
            <GovernanceKPIPanel workspaceId={workspaceId} />
        </main>
    );
}
