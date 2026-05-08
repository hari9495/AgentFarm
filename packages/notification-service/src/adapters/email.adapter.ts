import type { NotificationConfig, NotificationPayload, NotificationResult } from '@agentfarm/shared-types';
import { NotificationAdapter } from './base.adapter.js';

export class EmailAdapter extends NotificationAdapter {
    readonly adapterName = 'email';

    constructor(private readonly config: NotificationConfig) {
        super();
    }

    async send(payload: NotificationPayload): Promise<NotificationResult> {
        try {
            const nodemailer = await import('nodemailer');

            const transporter = nodemailer.createTransport({
                host: this.config.smtpHost ?? 'localhost',
                port: this.config.smtpPort ?? 587,
                secure: (this.config.smtpPort ?? 587) === 465,
            });

            await transporter.sendMail({
                from: this.config.emailFrom,
                to: this.config.emailTo,
                subject: payload.subject ?? 'Agent Notification',
                text: payload.message,
            });

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
