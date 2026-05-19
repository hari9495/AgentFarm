import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import CiTriagePanel from '../components/ci-triage-panel';

export default async function CiPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/ci');
    }

    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Engineering"
                title="CI/CD Triage"
                description="Submit CI failures for automated root cause analysis and patch proposals."
            />
            <CiTriagePanel workspaceId={workspaceId} />
        </main>
    );
}
