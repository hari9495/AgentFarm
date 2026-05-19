import { AdapterDiscoveryPanel } from '../components/adapter-discovery-panel';
import { PageHeader } from '../components/page-header';

type SearchParams = {
    workspaceId?: string;
};

export default async function AdaptersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const params = await searchParams;
    const workspaceId = params.workspaceId?.trim() || 'ws_primary_001';

    return (
        <main className="page-shell" style={{ maxWidth: 1000 }}>
            <PageHeader
                eyebrow="Integrations"
                title="Adapter Registry"
                description="Discover, register, and health-check integration adapters for this workspace."
            />
            <AdapterDiscoveryPanel workspaceId={workspaceId} />
        </main>
    );
}
