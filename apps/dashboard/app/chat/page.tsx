import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import ChatSessionsPanel from '../components/chat-sessions-panel';

export default async function ChatPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/chat');
    }
    const { tenantId } = session;

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Interaction"
                title="Agent Chat"
                description="Create and manage direct chat sessions with agents."
            />

            <ChatSessionsPanel tenantId={tenantId} />
        </main>
    );
}
