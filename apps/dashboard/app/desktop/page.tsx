import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import DesktopPanel from '../components/desktop-panel';
import DesktopStreamPanel from '../components/desktop-stream-panel';

export default async function DesktopPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/desktop');
    }
    const { tenantId } = session;
    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Automation"
                title="Desktop Agent"
                description="View and manage desktop profile, browser session, and action history."
            />

            <DesktopPanel tenantId={tenantId} workspaceId={workspaceId} />

            <div style={{ marginTop: '2rem' }}>
                <DesktopStreamPanel tenantId={tenantId} />
            </div>
        </main>
    );
}
