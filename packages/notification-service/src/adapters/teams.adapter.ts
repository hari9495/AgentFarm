import type { NotificationPayload, NotificationResult } from '@agentfarm/shared-types';
import { NotificationAdapter } from './base.adapter.js';

/**
 * Posts to a Microsoft Teams incoming webhook using the MessageCard schema.
 */
export class TeamsAdapter extends NotificationAdapter {
    readonly adapterName = 'teams';

    constructor(private readonly webhookUrl: string) {
        super();
    }

    async send(payload: NotificationPayload): Promise<NotificationResult> {
        const card = {
            '@type': 'MessageCard',
            '@context': 'http://schema.org/extensions',
            themeColor: '0076D7',
            summary: payload.subject ?? payload.message.slice(0, 80),
            sections: [
                {
                    activityTitle: payload.subject ?? 'Agent Notification',
                    activityText: payload.message,
                    facts:
                        payload.metadata
                            ? Object.entries(payload.metadata).map(([k, v]) => ({
                                name: k,
                                value: String(v),
                            }))
                            : undefined,
                },
            ],
        };

        try {
            const response = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(card),
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
