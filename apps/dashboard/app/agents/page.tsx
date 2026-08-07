import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import AgentsPageClient from './agents-client';

export default async function AgentsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/agents');
    }
    return <AgentsPageClient workspaceIds={session.workspaceIds ?? []} />;
}
