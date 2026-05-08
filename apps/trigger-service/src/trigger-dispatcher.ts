import type { TriggerEvent } from './types.js';

export type DispatchResult = {
    ok: boolean;
    taskRunResult?: unknown;
    error?: string;
};

export class TriggerDispatcher {
    constructor(private readonly agentRuntimeUrl: string) { }

    async dispatch(event: TriggerEvent): Promise<DispatchResult> {
        const task = event.subject
            ? `[${event.subject}] ${event.body}`
            : event.body;

        const url = `${this.agentRuntimeUrl.replace(/\/+$/, '')}/run-task`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    task,
                    tenantId: event.tenantId,
                    agentId: event.agentId,
                    triggerId: event.id,
                    source: event.source,
                }),
            });

            if (!response.ok) {
                const body = await response.text().catch(() => '');
                return {
                    ok: false,
                    error: `agent-runtime responded ${response.status}: ${body.slice(0, 200)}`,
                };
            }

            const result = await response.json().catch(() => ({}));
            return { ok: true, taskRunResult: result };
        } catch (err) {
            return {
                ok: false,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
}
