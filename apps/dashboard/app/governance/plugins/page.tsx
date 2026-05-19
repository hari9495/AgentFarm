import { PluginLoadingPanel } from '../../components/plugin-loading-panel';
import { PageHeader } from '../../components/page-header';

type SearchParams = {
    workspaceId?: string;
};

export default async function GovernancePluginsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const params = await searchParams;
    const workspaceId = params.workspaceId?.trim() || 'ws_1';

    return (
        <main className="page-shell" style={{ maxWidth: 960 }}>
            <PageHeader
                eyebrow="Governance"
                title="Plugin Trust & Kill-Switch"
                description="Review external plugin load outcomes and global disable actions for runtime safety."
                backHref="/governance"
                backLabel="← Governance"
                tone="rose"
            />
            <PluginLoadingPanel workspaceId={workspaceId} />
        </main>
    );
}
