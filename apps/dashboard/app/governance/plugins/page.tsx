import { PluginLoadingPanel } from '../../components/plugin-loading-panel';

type SearchParams = {
    workspaceId?: string;
};

export default async function GovernancePluginsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const params = await searchParams;
    const workspaceId = params.workspaceId?.trim() || 'ws_1';

    return (
        <main style={{ maxWidth: 960, margin: '1.5rem auto', padding: '0 1rem' }}>
            <h1>Plugin Trust and Kill-Switch</h1>
            <p style={{ marginTop: '-0.45rem', color: '#57534e' }}>
                Review external plugin load outcomes and global disable actions for runtime safety.
            </p>
            <PluginLoadingPanel workspaceId={workspaceId} />
        </main>
    );
}
