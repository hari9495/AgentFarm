import type { INotificationProvider, WinLossNotificationPayload } from './notification-provider.js';

export class SlackNotificationProvider implements INotificationProvider {
    constructor(private readonly webhookUrl: string) { }

    async send(payload: WinLossNotificationPayload): Promise<{ sent: boolean; error?: string }> {
        try {
            const icon = payload.outcome === 'won' ? ':trophy:' : ':no_entry:';
            const valueText = payload.dealValue != null
                ? ` — *${payload.currency} ${payload.dealValue.toLocaleString()}*`
                : '';
            const daysText = payload.daysToClose != null ? ` (${payload.daysToClose} days to close)` : '';
            const text = `${icon} Deal *${payload.outcome.toUpperCase()}*: ${payload.prospectName} @ ${payload.company}${valueText}${daysText}`;

            const res = await fetch(this.webhookUrl, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    blocks: [
                        {
                            type: 'section',
                            text: { type: 'mrkdwn', text },
                        },
                    ],
                }),
            });

            if (!res.ok) {
                return { sent: false, error: `Slack responded ${res.status}` };
            }
            return { sent: true };
        } catch (err: unknown) {
            return { sent: false, error: String(err) };
        }
    }
}
