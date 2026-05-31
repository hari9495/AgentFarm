import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import WakeRunsPanel from '../components/wake-runs-panel';

export default async function WakeRunsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/wake-runs');
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Scheduling"
                title="Wake Runs"
                description="Schedule and monitor one-shot agent wake events."
            />
            <WakeRunsPanel workspaceId={workspaceId} />
        </main>
    );
}
