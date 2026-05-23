import type { SalesEmailProvider } from '@agentfarm/shared-types';
import type { IEmailProvider } from './email-provider.js';
import { SmtpEmailProvider } from './smtp-email-provider.js';
import { SendgridEmailProvider } from './sendgrid-email-provider.js';
import { MailgunEmailProvider } from './mailgun-email-provider.js';

const providers: Partial<Record<SalesEmailProvider, IEmailProvider>> = {
    smtp: new SmtpEmailProvider(),
    sendgrid: new SendgridEmailProvider(),
    mailgun: new MailgunEmailProvider(),
};

export function getEmailProvider(providerName: SalesEmailProvider): IEmailProvider {
    const provider = providers[providerName];
    if (!provider) {
        throw new Error(
            `Email provider not implemented: ${providerName}. Available: ${Object.keys(providers).join(', ')}`,
        );
    }
    return provider;
}
