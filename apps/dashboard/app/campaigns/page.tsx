import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import CampaignsPanel from '../components/campaigns-panel';

export default async function CampaignsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/campaigns');
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Business Ops"
                title="Campaigns"
                description="Approve, pause, and monitor marketing campaigns drafted by your marketing specialist agent."
            />
            <CampaignsPanel workspaceId={workspaceId} />
        </main>
    );
}
