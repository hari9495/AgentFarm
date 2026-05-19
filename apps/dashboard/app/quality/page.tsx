import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import QualitySignalsPanel from '../components/quality-signals-panel';

export default async function QualityPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/quality');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Observability"
                title="Quality Signals"
                description="Monitor agent quality signals and task feedback across workspaces."
            />
            <QualitySignalsPanel />
        </main>
    );
}
