import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import SupportQueuePanel from '../components/support-queue-panel';

export default async function SupportQueuePage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/support-queue');
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Business Ops"
                title="Support Queue"
                description="Monitor open tickets, review agent-drafted responses, and manage escalations."
            />
            <SupportQueuePanel workspaceId={workspaceId} />
        </main>
    );
}
