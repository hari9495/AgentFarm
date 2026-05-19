import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import { GovernanceWorkflowPanel } from '../components/governance-workflow-panel';

export default async function GovernancePage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/governance');
    }

    const workspaceId = session.workspaceIds?.[0] ?? 'ws_1';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Governance"
                title="Governance Workflows"
                description="Monitor org-level governance workflow SLA and review bottlenecks for approvals."
            />
            <GovernanceWorkflowPanel workspaceId={workspaceId} />
        </main>
    );
}

