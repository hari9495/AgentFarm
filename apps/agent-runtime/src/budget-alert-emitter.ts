export async function emitBudgetAlert(params: {
    scope: string;
    level: 'warning' | 'exhausted';
    consumed: number;
    limit: number;
    tenantId?: string;
    workspaceId?: string;
}): Promise<void> {
    const baseUrl = process.env['API_GATEWAY_URL'] ?? 'http://localhost:3000';
    const billingAlertEmail = process.env['BILLING_ALERT_EMAIL']?.trim() ?? '';
    const eventTrigger =
        params.level === 'exhausted' ? 'token_budget_exhausted' : 'token_budget_warning';

    const percentUsed = Math.round((params.consumed / params.limit) * 100);

    // Log to stdout so the alert is always visible even if the gateway is unreachable.
    console.warn(
        `[budget-alert] ${eventTrigger.toUpperCase()} scope=${params.scope}` +
        ` consumed=${params.consumed}/${params.limit} (${percentUsed}%)` +
        (billingAlertEmail ? ` alert-email=${billingAlertEmail}` : ' BILLING_ALERT_EMAIL not set'),
    );

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
                    percentUsed,
                    billingAlertEmail: billingAlertEmail || null,
                },
            }),
        });
    } catch (err) {
        console.error('[budget-alert] failed to post notification', err);
    }
}
