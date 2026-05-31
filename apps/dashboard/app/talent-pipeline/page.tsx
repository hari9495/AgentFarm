import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import TalentPipelinePanel from '../components/talent-pipeline-panel';

export default async function TalentPipelinePage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/talent-pipeline');
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Business Ops"
                title="Talent Pipeline"
                description="Track AI-sourced candidates and open job requisitions managed by your recruiter agent."
            />
            <TalentPipelinePanel workspaceId={workspaceId} />
        </main>
    );
}
