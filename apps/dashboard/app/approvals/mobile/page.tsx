import { redirect } from 'next/navigation';
import { getSessionPayload } from '../../lib/internal-session';
import MobileApprovalsClient from './mobile-approvals-client';

export const metadata = { title: 'Approvals · AgentFarm' };

export default async function MobileApprovalsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/approvals/mobile');
    }
    return (
        <MobileApprovalsClient
            workspaceIds={session.workspaceIds ?? []}
        />
    );
}
