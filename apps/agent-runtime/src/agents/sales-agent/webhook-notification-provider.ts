import { createHmac } from 'node:crypto';
import type { INotificationProvider, WinLossNotificationPayload } from './notification-provider.js';

export class WebhookNotificationProvider implements INotificationProvider {
    constructor(
        private readonly webhookUrl: string,
        private readonly secret?: string,
    ) { }

    async send(payload: WinLossNotificationPayload): Promise<{ sent: boolean; error?: string }> {
        try {
            const bodyStr = JSON.stringify(payload);
            const headers: Record<string, string> = {
                'content-type': 'application/json',
            };

            if (this.secret) {
                const sig = createHmac('sha256', this.secret)
                    .update(bodyStr)
                    .digest('hex');
                headers['x-agentfarm-signature'] = sig;
            }

            const res = await fetch(this.webhookUrl, {
                method: 'POST',
                headers,
                body: bodyStr,
            });

            if (!res.ok) {
                return { sent: false, error: `Webhook responded ${res.status}` };
            }
            return { sent: true };
        } catch (err: unknown) {
            return { sent: false, error: String(err) };
        }
    }
}
