import { RoutineSchedulerPanel } from '../components/routine-scheduler-panel';
import { PageHeader } from '../components/page-header';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RoutineTasksPage({ searchParams }: { searchParams: SearchParams }) {
    const params = await searchParams;
    const botId = (typeof params.botId === 'string' ? params.botId.trim() : '') || 'bot_dev_001';
    const workspaceId = (typeof params.workspaceId === 'string' ? params.workspaceId.trim() : '') || 'ws_primary_001';

    return (
        <main className="page-shell" style={{ maxWidth: 900 }}>
            <PageHeader
                eyebrow="Agent Automation"
                title="Routine Tasks"
                description={`Manage recurring scheduled tasks for agent ${botId} in workspace ${workspaceId}.`}
            />
            <RoutineSchedulerPanel botId={botId} workspaceId={workspaceId} />
        </main>
    );
}
