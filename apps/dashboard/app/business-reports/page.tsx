import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import BusinessReportsPanel from '../components/business-reports-panel';

export default async function BusinessReportsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/business-reports');
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Business Ops"
                title="Business Reports"
                description="Review and approve AI-generated BRDs, market analyses, and stakeholder reports."
            />
            <BusinessReportsPanel workspaceId={workspaceId} />
        </main>
    );
}
