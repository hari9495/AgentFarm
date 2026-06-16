/**
 * LLM Observability Page — Langfuse trace drill-down (internal/operator view).
 *
 * Lists recent LLM traces and lets operators drill into a task to see the
 * decision generations: model, provider, token usage, cost, latency, and the
 * full input/output. Data is fetched through the tenant-scoped gateway proxy
 * (/v1/observability/llm-traces) — the Langfuse API key never reaches the
 * browser. Pairs with the existing Cost Dashboard (aggregates) and Audit log.
 */

import { redirect } from 'next/navigation';
import { getSessionPayload } from '../lib/internal-session';
import { PageHeader } from '../components/page-header';
import { LlmTracesPanel } from '../components/llm-traces-panel';

export default async function ObservabilityPage() {
    const session = await getSessionPayload();
    if (!session?.tenantId) redirect('/login?next=/observability');

    return (
        <main className="page-shell">
            <PageHeader
                eyebrow="Platform Observability"
                title="LLM Traces"
                description="Per-task LLM decision traces from Langfuse — model, provider, tokens, cost, latency, and full input/output. Drill into any task to see exactly what the agent decided and what it cost."
            />
            <LlmTracesPanel />
        </main>
    );
}
