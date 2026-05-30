import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import SkillsHubClient from './skills-hub-client';

export default async function SkillsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/skills');
    return (
        <SkillsHubClient
            workspaceId={session.workspaceIds?.[0] ?? 'ws_primary_001'}
            botId={'bot_dev_001'}
            tenantId={session.tenantId}
        />
    );
}
