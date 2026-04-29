import { GovernanceWorkflowPanel } from '../components/governance-workflow-panel';

type SearchParams = {
    workspaceId?: string;
};

export default async function GovernancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const params = await searchParams;
    const workspaceId = params.workspaceId?.trim() || 'ws_1';

    return (
        <main style={{ maxWidth: 960, margin: '1.5rem auto', padding: '0 1rem' }}>
            <h1>Governance Workflows</h1>
            <p style={{ marginTop: '-0.45rem', color: '#57534e' }}>
                Monitor org-level governance workflow SLA and review bottlenecks for approvals.
            </p>
            <GovernanceWorkflowPanel workspaceId={workspaceId} />
        </main>
    );
}
