import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import OrchestrationRunsPanel from '../components/orchestration-runs-panel';

export default async function OrchestrationPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/orchestration');
    }
    const { tenantId } = session;

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Multi-Agent"
                title="Orchestration Runs"
                description="Start and monitor multi-agent orchestration runs."
            />

            <OrchestrationRunsPanel tenantId={tenantId} />
        </main>
    );
}
