import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import GovernanceHubClient from './governance-hub-client';

export default async function GovernancePage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/governance');
    }
    return (
        <GovernanceHubClient
            tenantId={session.tenantId}
            workspaceId={session.workspaceIds?.[0] ?? ''}
        />
    );
}

