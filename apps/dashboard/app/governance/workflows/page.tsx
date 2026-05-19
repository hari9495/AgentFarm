import { redirect } from 'next/navigation';
import { PageHeader } from '../../components/page-header';
import { getSessionPayload } from '../../lib/internal-session';
import { WorkflowBuilderPanel } from '../../components/workflow-builder-panel';

export default async function GovernanceWorkflowsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/governance/workflows');
    }

    const workspaceId = session.workspaceIds?.[0] ?? 'ws_1';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Governance"
                title="Workflow Builder"
                description="Create approval workflow templates, monitor active workflows, and review governance diagnostics."
                backHref="/governance"
                backLabel="← Governance"
            />
            <WorkflowBuilderPanel workspaceId={workspaceId} />
        </main>
    );
}
