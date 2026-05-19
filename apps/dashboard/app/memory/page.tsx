import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import MemoryBrowserPanel from '../components/memory-browser-panel';
import AgentEpisodicMemoryPanel from '../components/agent-episodic-memory-panel';

export default async function MemoryPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/memory');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Intelligence"
                title="Agent Memory"
                description="Browse workspace memory records and learned patterns across agents."
            />
            <MemoryBrowserPanel />
            <div style={{ marginTop: '3rem' }}>
                <AgentEpisodicMemoryPanel />
            </div>
        </main>
    );
}
