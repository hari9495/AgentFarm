import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import PlaygroundClient from './playground-client';

export default async function PlaygroundPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/playground');
    }
    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Developer"
                title="API Playground"
                description="Try live API requests against your instance — no code required."
            />
            <PlaygroundClient tenantId={session.tenantId} workspaceId={session.workspaceIds?.[0] ?? ''} />
        </main>
    );
}
