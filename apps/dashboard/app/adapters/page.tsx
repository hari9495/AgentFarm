import { AdapterDiscoveryPanel } from '../components/adapter-discovery-panel';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';

type SearchParams = {
    workspaceId?: string;
};

export default async function AdaptersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
    const params = await searchParams;
    const session = await getSessionPayload();
    // Use the session's active workspace, not a hardcoded placeholder — a fake
    // default (e.g. ws_primary_001) is rejected as "workspace_id not in session scope".
    const workspaceId = params.workspaceId?.trim() || session?.workspaceIds?.[0];

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
