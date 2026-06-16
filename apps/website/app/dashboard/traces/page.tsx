/**
 * Customer LLM Traces — per-task transparency for the company's own agents.
 *
 * Metadata-only by design: customers see model, tokens, cost, latency, the
 * action taken, and status — but NOT the raw prompt or model output (those are
 * stripped server-side by the gateway for non-internal scopes). Pairs with the
 * Audit Log so a customer can see what each agent did and what it cost.
 */

import TracesClient from './traces-client';

export const dynamic = 'force-dynamic';

export default function CustomerTracesPage() {
    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold">LLM Traces</h1>
                <p className="text-sm text-muted-foreground">
                    What your agents decided, and what each task cost — model, tokens, latency and spend per task.
                </p>
            </header>
            <TracesClient />
        </div>
    );
}
