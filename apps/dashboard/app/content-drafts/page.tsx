import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import ContentDraftsPanel from '../components/content-drafts-panel';

export default async function ContentDraftsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/content-drafts');
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Content & Comms"
                title="Content Drafts"
                description="Review, approve, and publish AI-generated content from your writing agents."
            />
            <ContentDraftsPanel workspaceId={workspaceId} />
        </main>
    );
}
