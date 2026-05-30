import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import MemoryHubClient from './memory-hub-client';

export default async function MemoryPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/memory');
    return (
        <MemoryHubClient
            tenantId={session.tenantId}
            workspaceId={session.workspaceIds?.[0] ?? ''}
        />
    );
}
