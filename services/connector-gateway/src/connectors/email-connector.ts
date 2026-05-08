/**
 * Email Connector
 *
 * Provides outbound email via nodemailer over generic SMTP.
 * Gmail and Outlook adapters are stubbed pending OAuth configuration.
 *
 * SMTP config from env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
 * list_emails / read_email / reply_email are not supported on generic SMTP
 * and direct callers to use the gmail or outlook adapter instead.
 */

import nodemailer from 'nodemailer';

export type EmailConnectorConfig = {
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPass: string;
    fromAddress?: string;
};

export type SendEmailInput = {
    to: string | string[];
    subject: string;
    body: string;
    html?: string;
    cc?: string | string[];
    bcc?: string | string[];
    replyTo?: string;
};

export type EmailConnectorResult = {
    ok: boolean;
    output: string;
    reason?: string;
    messageId?: string;
    error?: string;
};

// ---------------------------------------------------------------------------
// EmailConnector class
// ---------------------------------------------------------------------------

export class EmailConnector {
    private readonly config: EmailConnectorConfig;

    constructor(config: EmailConnectorConfig) {
        if (!config.smtpHost) throw new Error('EmailConnector: smtpHost is required');
        if (!config.smtpUser) throw new Error('EmailConnector: smtpUser is required');
        if (!config.smtpPass) throw new Error('EmailConnector: smtpPass is required');
        this.config = config;
    }

    static fromEnv(): EmailConnector {
        const host = process.env['SMTP_HOST'];
        const port = process.env['SMTP_PORT'];
        const user = process.env['SMTP_USER'];
        const pass = process.env['SMTP_PASS'];
        if (!host) throw new Error('SMTP_HOST environment variable is required');
        if (!user) throw new Error('SMTP_USER environment variable is required');
        if (!pass) throw new Error('SMTP_PASS environment variable is required');
        return new EmailConnector({
            smtpHost: host,
            smtpPort: port ? parseInt(port, 10) : 587,
            smtpUser: user,
            smtpPass: pass,
        });
    }

    private createTransport(): nodemailer.Transporter {
        return nodemailer.createTransport({
            host: this.config.smtpHost,
            port: this.config.smtpPort,
            secure: this.config.smtpPort === 465,
            auth: {
                user: this.config.smtpUser,
                pass: this.config.smtpPass,
            },
        });
    }

    // -------------------------------------------------------------------------
    // send_email — generic SMTP
    // -------------------------------------------------------------------------

    async sendEmail(input: SendEmailInput): Promise<EmailConnectorResult> {
        if (!input.to || (Array.isArray(input.to) && input.to.length === 0)) {
            return { ok: false, output: 'validation_error', error: 'to is required' };
        }
        if (!input.subject || !input.subject.trim()) {
            return { ok: false, output: 'validation_error', error: 'subject is required' };
        }
        if (!input.body && !input.html) {
            return { ok: false, output: 'validation_error', error: 'body or html is required' };
        }

        const from = this.config.fromAddress ?? this.config.smtpUser;

        try {
            const transport = this.createTransport();
            const info = await transport.sendMail({
                from,
                to: input.to,
                subject: input.subject,
                text: input.body,
                ...(input.html ? { html: input.html } : {}),
                ...(input.cc ? { cc: input.cc } : {}),
                ...(input.bcc ? { bcc: input.bcc } : {}),
                ...(input.replyTo ? { replyTo: input.replyTo } : {}),
            });
            return { ok: true, output: 'sent', messageId: info.messageId };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { ok: false, output: 'smtp_error', error: message };
        }
    }

    // -------------------------------------------------------------------------
    // list_emails / read_email / reply_email — not supported on generic SMTP
    // -------------------------------------------------------------------------

    listEmails(): EmailConnectorResult {
        return { ok: false, output: 'not_supported', reason: 'use gmail or outlook adapter' };
    }

    readEmail(_messageId: string): EmailConnectorResult {
        return { ok: false, output: 'not_supported', reason: 'use gmail or outlook adapter' };
    }

    replyEmail(_messageId: string, _body: string): EmailConnectorResult {
        return { ok: false, output: 'not_supported', reason: 'use gmail or outlook adapter' };
    }

    // -------------------------------------------------------------------------
    // gmail / outlook — OAuth not yet configured
    // -------------------------------------------------------------------------

    gmailAction(_action: string, _payload: Record<string, unknown>): EmailConnectorResult {
        return { ok: false, output: 'not_supported', reason: 'OAuth not yet configured' };
    }

    outlookAction(_action: string, _payload: Record<string, unknown>): EmailConnectorResult {
        return { ok: false, output: 'not_supported', reason: 'OAuth not yet configured' };
    }
}
