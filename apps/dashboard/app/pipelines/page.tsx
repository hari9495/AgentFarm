import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import SkillPipelinesPanel from '../components/skill-pipelines-panel';

export default async function PipelinesPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/pipelines');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Automation"
                title="Skill Pipelines & Scheduler"
                description="Run skill pipelines and manage scheduled automation jobs."
            />

            <SkillPipelinesPanel />
        </main>
    );
}
