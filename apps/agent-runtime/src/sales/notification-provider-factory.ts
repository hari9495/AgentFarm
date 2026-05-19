import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import type { INotificationProvider } from './notification-provider.js';
import { SlackNotificationProvider } from './slack-notification-provider.js';
import { TeamsNotificationProvider } from './teams-notification-provider.js';
import { EmailNotificationProvider } from './email-notification-provider.js';
import { WebhookNotificationProvider } from './webhook-notification-provider.js';
import type { IEmailProvider, EmailProviderConfig } from './email-provider.js';

export function createNotificationProvider(
    config: SalesAgentConfigRecord,
    emailProvider?: IEmailProvider,
): INotificationProvider | null {
    const provider = config.winNotificationProvider;
    const target = config.winNotificationTarget;

    if (!provider || !target) return null;

    switch (provider) {
        case 'slack':
            return new SlackNotificationProvider(target);
        case 'teams':
            return new TeamsNotificationProvider(target);
        case 'email': {
            if (!emailProvider) return null;
            const emailConfig: EmailProviderConfig = {
                apiKey: process.env['SALES_EMAIL_API_KEY'],
                host: process.env['SALES_SMTP_HOST'],
                port: Number(process.env['SALES_SMTP_PORT'] ?? '587'),
                secure: process.env['SALES_SMTP_SECURE'] === 'true',
                user: process.env['SALES_SMTP_USER'],
                pass: process.env['SALES_SMTP_PASS'],
                fromEmail: process.env['SALES_FROM_EMAIL'] ?? 'sales@agentfarm.dev',
                fromName: process.env['SALES_FROM_NAME'],
            };
            return new EmailNotificationProvider(target, emailProvider, emailConfig);
        }
        case 'webhook':
            return new WebhookNotificationProvider(target, config.winNotificationSecret);
        default:
            return null;
    }
}
