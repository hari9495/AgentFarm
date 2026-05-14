import type { IEmailProvider, SendEmailParams, SendEmailResult, EmailProviderConfig } from './email-provider.js';

export class SendgridEmailProvider implements IEmailProvider {
    readonly providerName = 'sendgrid' as const;

    async sendEmail(params: SendEmailParams, config: EmailProviderConfig): Promise<SendEmailResult> {
        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.apiKey ?? ''}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                personalizations: [{ to: [{ email: params.to }] }],
                from: { email: config.fromEmail ?? params.from, name: config.fromName },
                subject: params.subject,
                content: [{ type: 'text/html', value: params.body }],
                ...(params.replyTo ? { reply_to: { email: params.replyTo } } : {}),
            }),
        });
        return {
            success: res.ok,
            messageId: res.headers.get('X-Message-Id') ?? undefined,
            error: res.ok ? undefined : await res.text(),
            provider: 'sendgrid',
        };
    }
}
