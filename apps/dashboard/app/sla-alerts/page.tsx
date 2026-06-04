import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import { PageHeader } from '../components/page-header';
import SlaAlertsPanel from '../components/sla-alerts-panel';

export default async function SlaAlertsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/sla-alerts');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Governance"
                title="SLA Breach Alerts"
                description="Configure P95 latency thresholds and get notified when approvals breach your SLA."
            />
            <SlaAlertsPanel tenantId={session.tenantId} workspaceIds={session.workspaceIds ?? []} />
        </main>
    );
}
