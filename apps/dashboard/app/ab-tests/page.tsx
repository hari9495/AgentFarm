import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import AbTestsPanel from '../components/ab-tests-panel';

export default async function AbTestsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/ab-tests');
    }

    const { tenantId } = session;

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="A/B Testing"
                title="A/B Tests"
                description="Manage A/B test experiments, view variant results, and conclude tests."
            />
            <AbTestsPanel tenantId={tenantId} />
        </main>
    );
}
