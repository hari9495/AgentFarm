import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import BudgetPolicyPanel from '../components/budget-policy-panel';

export default async function BudgetPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/budget');
    }
    const { tenantId } = session;
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Finance"
                title="Budget Policy"
                description="Monitor and control workspace spending limits and hard stops."
            />

            <BudgetPolicyPanel tenantId={tenantId} workspaceId={workspaceId} />
        </main>
    );
}
