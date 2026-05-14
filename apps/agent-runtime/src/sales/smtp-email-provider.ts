import type { IEmailProvider, SendEmailParams, SendEmailResult, EmailProviderConfig } from './email-provider.js';

export class SmtpEmailProvider implements IEmailProvider {
    readonly providerName = 'smtp' as const;

    async sendEmail(params: SendEmailParams, config: EmailProviderConfig): Promise<SendEmailResult> {
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const nodemailer = await import('nodemailer') as any;
            const transporter = nodemailer.createTransport({
                host: config.host,
                port: config.port ?? 587,
                secure: config.secure ?? false,
                auth: config.user ? { user: config.user, pass: config.pass ?? '' } : undefined,
            });
            const from =
                config.fromName && config.fromEmail
                    ? `${config.fromName} <${config.fromEmail}>`
                    : (config.fromEmail ?? params.from);
            const info = await transporter.sendMail({
                from,
                to: params.to,
                subject: params.subject,
                html: params.body,
            });
            return { success: true, messageId: info.messageId as string | undefined, provider: 'smtp' };
        } catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : String(err),
                provider: 'smtp',
            };
        }
    }
}
