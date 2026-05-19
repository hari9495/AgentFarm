import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import ActivityEventsPanel from '../components/activity-events-panel';

export default async function ActivityPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/activity');
    }

    const { tenantId } = session;
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Observability"
                title="Activity Events"
                description="Monitor and acknowledge workspace activity events across all categories."
            />

            <ActivityEventsPanel tenantId={tenantId} workspaceId={workspaceId} />
        </main>
    );
}
