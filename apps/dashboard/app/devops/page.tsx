import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import DevOpsHubClient from './devops-hub-client';

export default async function DevOpsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/devops');
    return (
        <DevOpsHubClient
            tenantId={session.tenantId}
            workspaceId={session.workspaceIds?.[0] ?? ''}
        />
    );
}
