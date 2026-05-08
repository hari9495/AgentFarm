import type { NotificationPayload, NotificationResult } from '@agentfarm/shared-types';
import { NotificationAdapter } from './base.adapter.js';

/**
 * Posts to a Slack incoming webhook URL.
 * slackToken holds the incoming webhook URL (https://hooks.slack.com/services/...).
 * No bot token or scopes needed — just the webhook URL from the Slack app config.
 */
export class SlackAdapter extends NotificationAdapter {
    readonly adapterName = 'slack';

    constructor(private readonly webhookUrl: string) {
        super();
    }

    async send(payload: NotificationPayload): Promise<NotificationResult> {
        const text = payload.subject
            ? `*${payload.subject}*\n${payload.message}`
            : payload.message;

        try {
            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ text }),
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
