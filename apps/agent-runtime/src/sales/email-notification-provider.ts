import type { INotificationProvider, WinLossNotificationPayload } from './notification-provider.js';
import type { IEmailProvider, EmailProviderConfig } from './email-provider.js';

export class EmailNotificationProvider implements INotificationProvider {
    constructor(
        private readonly toEmail: string,
        private readonly emailProvider: IEmailProvider,
        private readonly emailConfig: EmailProviderConfig,
    ) { }

    async send(payload: WinLossNotificationPayload): Promise<{ sent: boolean; error?: string }> {
        try {
            const icon = payload.outcome === 'won' ? '🏆' : '❌';
            const subject = `${icon} Deal ${payload.outcome.toUpperCase()}: ${payload.prospectName} @ ${payload.company}`;
            const valueText = payload.dealValue != null
                ? `\nDeal value: ${payload.currency} ${payload.dealValue.toLocaleString()}`
                : '';
            const daysText = payload.daysToClose != null
                ? `\nDays to close: ${payload.daysToClose}`
                : '';
            const body = `Deal ${payload.outcome}: ${payload.prospectName} at ${payload.company}${valueText}${daysText}\n\nTenant: ${payload.tenantId} | Bot: ${payload.botId} | Deal: ${payload.dealId}`;

            const result = await this.emailProvider.sendEmail(
                {
                    to: this.toEmail,
                    from: this.emailConfig.fromEmail ?? 'sales@agentfarm.dev',
                    subject,
                    body,
                },
                this.emailConfig,
            );

            return { sent: result.success, error: result.error };
        } catch (err: unknown) {
            return { sent: false, error: String(err) };
        }
    }
}
