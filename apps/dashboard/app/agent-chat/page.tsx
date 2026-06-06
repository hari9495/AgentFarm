import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import { AgentChatPanel } from '../components/agent-chat-panel';
import { PageHeader } from '../components/page-header';

export default async function AgentChatPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/agent-chat');
    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Autonomous Agent"
                title="Agent Chat"
                description="Send tasks to the autonomous coding loop and follow each step in real time."
            />
            <AgentChatPanel />
        </main>
    );
}
