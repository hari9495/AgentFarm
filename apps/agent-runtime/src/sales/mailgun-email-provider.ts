import type { IEmailProvider, SendEmailParams, SendEmailResult, EmailProviderConfig } from './email-provider.js';

export class MailgunEmailProvider implements IEmailProvider {
    readonly providerName = 'mailgun' as const;

    async sendEmail(params: SendEmailParams, config: EmailProviderConfig): Promise<SendEmailResult> {
        const domain = config.fromEmail?.split('@')[1] ?? 'mail.example.com';
        const auth = Buffer.from(`api:${config.apiKey ?? ''}`).toString('base64');

        const form = new FormData();
        form.append('from', config.fromName && config.fromEmail
            ? `${config.fromName} <${config.fromEmail}>`
            : (config.fromEmail ?? params.from));
        form.append('to', params.to);
        form.append('subject', params.subject);
        form.append('html', params.body);

        const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
            method: 'POST',
            headers: { Authorization: `Basic ${auth}` },
            body: form,
        });

        if (!res.ok) {
            return { success: false, error: await res.text(), provider: 'mailgun' };
        }
        const data = await res.json() as { id?: string };
        return { success: true, messageId: data.id ?? undefined, provider: 'mailgun' };
    }
}
