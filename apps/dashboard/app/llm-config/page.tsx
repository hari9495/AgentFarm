import { redirect } from 'next/navigation';
import { PageHeader } from '../components/page-header';
import { getSessionPayload } from '../lib/internal-session';
import { LlmConfigPanel } from '../components/llm-config-panel';

export default async function LlmConfigPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) {
        redirect('/login?next=/llm-config');
    }

    const workspaceId = session.workspaceIds?.[0] ?? '';

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Configuration"
                title="LLM Configuration"
                description="Configure LLM provider, model selection, and per-profile routing for this workspace."
            />
            <LlmConfigPanel workspaceId={workspaceId} />
        </main>
    );
}
