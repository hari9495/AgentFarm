import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import { RoutineSchedulerPanel } from '../components/routine-scheduler-panel';
import { PageHeader } from '../components/page-header';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RoutineTasksPage({ searchParams }: { searchParams: SearchParams }) {
    const [session, params] = await Promise.all([getSessionPayload(), searchParams]);
    if (!session?.tenantId) redirect('/login?next=/routine-tasks');

    const botId = (typeof params.botId === 'string' ? params.botId.trim() : '');
    const workspaceId = (typeof params.workspaceId === 'string' ? params.workspaceId.trim() : '')
        || session.workspaceIds?.[0]
        || '';

    return (
        <main className="page-shell" style={{ maxWidth: 900 }}>
            <PageHeader
                eyebrow="Agent Automation"
                title="Routine Tasks"
                description={botId ? `Manage recurring scheduled tasks for agent ${botId}.` : 'Select an agent to manage its routine tasks.'}
            />
            <RoutineSchedulerPanel botId={botId} workspaceId={workspaceId} />
        </main>
    );
}
