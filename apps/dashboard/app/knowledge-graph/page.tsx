import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import { KnowledgeGraphExplorer } from '../components/knowledge-graph-explorer';

export default async function KnowledgeGraphPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/knowledge-graph');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Engineering"
                title="Knowledge Graph"
                description="Browse repository symbols, call graphs, and skill suggestions."
            />
            <KnowledgeGraphExplorer />
        </main>
    );
}

