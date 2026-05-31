import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import CommsDraftsPanel from '../components/comms-drafts-panel';

export default async function CommsDraftsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/comms-drafts');
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Content & Comms"
                title="Comms Inbox"
                description="Review and approve corporate communications drafted by your assistant agent before they are sent."
            />
            <CommsDraftsPanel workspaceId={workspaceId} />
        </main>
    );
}
