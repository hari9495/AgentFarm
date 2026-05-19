import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import HandoffsPanel from '../components/handoffs-panel';

export default async function HandoffsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/handoffs');
    }
    const { tenantId } = session;
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Multi-Agent"
                title="Agent Handoffs"
                description="Initiate and manage agent-to-agent task handoffs."
            />

            <HandoffsPanel tenantId={tenantId} workspaceId={workspaceId} />
        </main>
    );
}
