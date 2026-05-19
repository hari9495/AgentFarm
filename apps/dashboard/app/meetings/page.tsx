import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import MeetingSessionsPanel from '../components/meeting-sessions-panel';

export default async function MeetingsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/meetings');
    }

    const { tenantId } = session;

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Collaboration"
                title="Meeting Sessions"
                description="Create and manage agent-attended meeting sessions across workspaces."
            />
            <MeetingSessionsPanel tenantId={tenantId} />
        </main>
    );
}
