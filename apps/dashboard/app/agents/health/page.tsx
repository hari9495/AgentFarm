import { redirect } from 'next/navigation';
import { getSessionPayload } from '../../lib/internal-session';
import AgentHealthClient from './agent-health-client';

export const metadata = { title: 'Agent Health · AgentFarm' };

export default async function AgentHealthPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/agents/health');
    return <AgentHealthClient />;
}
