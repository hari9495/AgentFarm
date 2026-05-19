import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import TaskHistoryPanel from '../components/task-history-panel';

export default async function TasksPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/tasks');
    }

    const { tenantId } = session;

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Observability"
                title="Task History"
                description="Search and filter all task executions across agents, models, and outcomes."
            />
            <TaskHistoryPanel tenantId={tenantId} />
        </main>
    );
}
