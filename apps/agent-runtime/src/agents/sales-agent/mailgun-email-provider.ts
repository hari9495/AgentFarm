import type { IEmailProvider, SendEmailParams, SendEmailResult, EmailProviderConfig } from './email-provider.js';

export class MailgunEmailProvider implements IEmailProvider {
    readonly providerName = 'mailgun' as const;

    async sendEmail(params: SendEmailParams, config: EmailProviderConfig): Promise<SendEmailResult> {
        const fromEmail = config.fromEmail;
        if (!fromEmail || !fromEmail.includes('@')) {
            return { success: false, error: 'MailgunEmailProvider: fromEmail is not configured or invalid. Set SALES_FROM_EMAIL env var.', provider: 'mailgun' };
        }
        const domain = fromEmail.split('@')[1]!;
        const auth = Buffer.from(`api:${config.apiKey ?? ''}`).toString('base64');

        const form = new FormData();
        form.append('from', config.fromName
            ? `${config.fromName} <${fromEmail}>`
            : fromEmail);
        form.append('to', params.to);
        form.append('subject', params.subject);
        form.append('html', params.body);

        if (params.attachments && params.attachments.length > 0) {
            for (const att of params.attachments) {
                const arrayBuffer = att.content.buffer.slice(
                    att.content.byteOffset,
                    att.content.byteOffset + att.content.byteLength,
                ) as ArrayBuffer;
                form.append('attachment', new Blob([arrayBuffer], { type: att.contentType }), att.filename);
            }
        }

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
