export async function emitBudgetAlert(params: {
    scope: string;
    level: 'warning' | 'exhausted';
    consumed: number;
    limit: number;
    tenantId?: string;
    workspaceId?: string;
}): Promise<void> {
    const baseUrl = process.env['API_GATEWAY_URL'] ?? 'http://localhost:3000';
    const eventTrigger =
        params.level === 'exhausted' ? 'token_budget_exhausted' : 'token_budget_warning';
    try {
        await fetch(`${baseUrl}/v1/notifications/log`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tenantId: params.tenantId ?? 'system',
                workspaceId: params.workspaceId ?? null,
                channel: 'internal',
                eventTrigger,
                status: 'sent',
                payload: {
                    scope: params.scope,
                    consumed: params.consumed,
                    limit: params.limit,
                    percentUsed: Math.round((params.consumed / params.limit) * 100),
                },
            }),
        });
    } catch (err) {
        console.error('[budget-alert]', err);
    }
}
