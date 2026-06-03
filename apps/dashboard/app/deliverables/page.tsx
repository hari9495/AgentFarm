import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import DeliverablesPageClient from './deliverables-page-client';
import { TaskWebhookSetupCard } from '../components/task-webhook-setup-card';

export default async function DeliverablesPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/deliverables');
    }
    const workspaceIds = session.workspaceIds ?? [];
    const primaryWorkspaceId = workspaceIds[0];

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Agent Outputs"
                title="Deliverables"
                description="Completed agent actions — what was asked, what was produced."
            />
            <div style={{ display: 'grid', gap: '1.5rem' }}>
                <TaskWebhookSetupCard workspaceId={primaryWorkspaceId} />
                <DeliverablesPageClient workspaceIds={workspaceIds} />
            </div>
        </main>
    );
}
