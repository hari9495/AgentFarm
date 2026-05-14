import type { SalesEmailProvider } from '@agentfarm/shared-types';

export interface SendEmailParams {
    to: string;
    from: string;
    subject: string;
    body: string;
    replyTo?: string;
    metadata?: Record<string, string>;
}

export interface SendEmailResult {
    success: boolean;
    messageId?: string;
    error?: string;
    provider: SalesEmailProvider;
}

export interface IEmailProvider {
    readonly providerName: SalesEmailProvider;
    sendEmail(params: SendEmailParams, config: EmailProviderConfig): Promise<SendEmailResult>;
}

export interface EmailProviderConfig {
    apiKey?: string;
    host?: string;
    port?: number;
    secure?: boolean;
    user?: string;
    pass?: string;
    fromEmail?: string;
    fromName?: string;
}
