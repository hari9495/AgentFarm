import type { NotificationPayload, NotificationResult } from '@agentfarm/shared-types';
import { NotificationAdapter } from './base.adapter.js';

/**
 * Universal fallback adapter — POSTs JSON payload to any URL that accepts
 * incoming webhooks (Slack incoming webhooks, Discord, custom endpoints, etc.)
 */
export class WebhookAdapter extends NotificationAdapter {
    readonly adapterName = 'webhook';

    constructor(private readonly webhookUrl: string) {
        super();
    }

    async send(payload: NotificationPayload): Promise<NotificationResult> {
        try {
            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                return {
                    success: false,
                    adapter: this.adapterName,
                    error: `HTTP ${response.status}: ${response.statusText}`,
                };
            }

            return { success: true, adapter: this.adapterName };
        } catch (err) {
            return {
                success: false,
                adapter: this.adapterName,
                error: err instanceof Error ? err.message : String(err),
            };
        }
    }
}
