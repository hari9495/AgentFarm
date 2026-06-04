import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import ActivityFeedClient from './activity-feed-client';

export const metadata = { title: 'Activity Feed · AgentFarm' };

export default async function ActivityPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/activity');
    }
    return (
        <ActivityFeedClient
            workspaceIds={session.workspaceIds ?? []}
        />
    );
}
