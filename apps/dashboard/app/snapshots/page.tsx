import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import CapabilitySnapshotPanel from '../components/capability-snapshot-panel';

type SearchParams = {
    botId?: string;
};

export default async function SnapshotsPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/snapshots');
    }

    const params = await searchParams;
    const botId = params.botId?.trim() ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Agent State"
                title="Capability Snapshots"
                description="View frozen capability snapshots for each agent."
            />

            <CapabilitySnapshotPanel botId={botId} />
        </main>
    );
}
