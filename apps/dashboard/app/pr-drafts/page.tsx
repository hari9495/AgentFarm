import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import PrDraftsPanel from '../components/pr-drafts-panel';

export default async function PrDraftsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/pr-drafts');
    }
    const { tenantId } = session;
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Engineering"
                title="PR Drafts"
                description="Create, review, and publish AI-generated pull request drafts."
            />

            <PrDraftsPanel tenantId={tenantId} workspaceId={workspaceId} />
        </main>
    );
}
