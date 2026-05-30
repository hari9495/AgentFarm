import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import ApiDocsPanel from '../components/api-docs-panel';

export default async function DocsPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/docs');
    }

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Developer"
                title="API Reference & SDK"
                description="REST API reference and TypeScript SDK quick-start for AgentFarms."
            />
            <ApiDocsPanel />
        </main>
    );
}
