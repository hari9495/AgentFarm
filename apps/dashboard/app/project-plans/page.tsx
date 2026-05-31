import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import ProjectPlansPanel from '../components/project-plans-panel';

export default async function ProjectPlansPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/project-plans');
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Business Ops"
                title="Project Plans"
                description="Review sprint plans, roadmaps, risk registers, and retrospectives from your project manager agent."
            />
            <ProjectPlansPanel workspaceId={workspaceId} />
        </main>
    );
}
