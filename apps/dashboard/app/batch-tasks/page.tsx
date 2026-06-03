import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import BatchTasksClient from './batch-tasks-client';

export default async function BatchTasksPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/batch-tasks');
    }
    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Automation"
                title="Batch Task Submission"
                description="Upload a CSV and run the same task for every row — let agents work in parallel."
            />
            <BatchTasksClient workspaceIds={session.workspaceIds ?? []} />
        </main>
    );
}
