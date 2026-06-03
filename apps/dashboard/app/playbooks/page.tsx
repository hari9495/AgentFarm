import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import PlaybooksClient from './playbooks-client';

export default async function PlaybooksPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/playbooks');
    }
    return <PlaybooksClient tenantId={session.tenantId} workspaceIds={session.workspaceIds ?? []} />;
}
