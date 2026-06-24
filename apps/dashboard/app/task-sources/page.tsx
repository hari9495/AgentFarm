import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import TaskSourcesClient from './task-sources-client';

export const dynamic = 'force-dynamic';

export default async function TaskSourcesPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/task-sources');
    return <TaskSourcesClient />;
}
