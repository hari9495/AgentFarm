import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import DeliverablesPageClient from './deliverables-page-client';

export default async function DeliverablesPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/deliverables');
    }
    return (
        <DeliverablesPageClient
            workspaceIds={session.workspaceIds ?? []}
        />
    );
}
