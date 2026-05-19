import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import ScheduledReportsPanel from '../components/scheduled-reports-panel';

export default async function ScheduledReportsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/scheduled-reports');
    }

    const { tenantId } = session;

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Automation"
                title="Scheduled Reports"
                description="Configure automated report delivery by email."
            />
            <ScheduledReportsPanel tenantId={tenantId} />
        </main>
    );
}
