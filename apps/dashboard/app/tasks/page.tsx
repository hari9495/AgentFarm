import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import TasksPageClient from './tasks-page-client';

export default async function TasksPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/tasks');
    }
    return <TasksPageClient tenantId={session.tenantId} workspaceIds={session.workspaceIds ?? []} />;
}
