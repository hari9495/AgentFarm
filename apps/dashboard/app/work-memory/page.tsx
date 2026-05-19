import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import WorkMemoryPanel from '../components/work-memory-panel';

export default async function WorkMemoryPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/work-memory');
    }
    const { tenantId } = session;
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Agent State"
                title="Work Memory"
                description="View and edit active workspace working memory and next actions."
            />

            <WorkMemoryPanel tenantId={tenantId} workspaceId={workspaceId} />
        </main>
    );
}
