import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import HealthStatusPanel from '../components/health-status-panel';

export default async function HealthPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/health');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Operations"
                title="Health & Status"
                description="Live status of gateway, circuit breakers, task queue, and connector health."
            />
            <HealthStatusPanel />
        </main>
    );
}
