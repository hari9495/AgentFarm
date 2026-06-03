import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import ScheduledTasksClient from './scheduled-tasks-client';

export default async function ScheduledTasksPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/scheduled-tasks');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Automation"
                title="Scheduled Tasks"
                description="Run agent tasks automatically on a schedule — no code required."
            />
            <ScheduledTasksClient />
        </main>
    );
}
