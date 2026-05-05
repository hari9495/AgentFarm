import { AdapterDiscoveryPanel } from '../components/adapter-discovery-panel';

type SearchParams = {
    workspaceId?: string;
};

export default async function AdaptersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const params = await searchParams;
    const workspaceId = params.workspaceId?.trim() || 'ws_primary_001';

    return (
        <main style={{ maxWidth: 1000, margin: '1.5rem auto', padding: '0 1rem' }}>
            <h1>Adapter Registry</h1>
            <p style={{ marginTop: '-0.45rem', color: '#57534e' }}>
                Discover, register, and health-check integration adapters for this workspace.
            </p>
            <AdapterDiscoveryPanel workspaceId={workspaceId} />
        </main>
    );
}
