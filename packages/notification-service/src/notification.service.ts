import type {
    NotificationConfig,
    NotificationPayload,
    NotificationResult,
    CustomerNotificationConfig,
} from '@agentfarm/shared-types';
import type { NotificationAdapter } from './adapters/base.adapter.js';
import { WebhookAdapter } from './adapters/webhook.adapter.js';
import { EmailAdapter } from './adapters/email.adapter.js';
import { SlackAdapter } from './adapters/slack.adapter.js';
import { TeamsAdapter } from './adapters/teams.adapter.js';

// -----------------------------------------------------------------------
// AdapterFactory
// -----------------------------------------------------------------------

export class AdapterFactory {
    static create(config: NotificationConfig): NotificationAdapter {
        switch (config.channel) {
            case 'webhook':
                if (!config.webhookUrl) {
                    throw new Error('NotificationConfig: webhookUrl is required for channel=webhook');
                }
                return new WebhookAdapter(config.webhookUrl);

            case 'email':
                return new EmailAdapter(config);

            case 'slack': {
                // slackToken holds the incoming webhook URL for simplicity
                const url = config.slackToken ?? config.webhookUrl;
                if (!url) {
                    throw new Error('NotificationConfig: slackToken (webhook URL) is required for channel=slack');
                }
                return new SlackAdapter(url);
            }

            case 'teams':
                if (!config.teamsWebhookUrl) {
                    throw new Error('NotificationConfig: teamsWebhookUrl is required for channel=teams');
                }
                return new TeamsAdapter(config.teamsWebhookUrl);

            default: {
                // runtime guard for unrecognised channels
                throw new Error(`NotificationConfig: unknown channel: ${String(config.channel)}`);
            }
        }
    }
}

// -----------------------------------------------------------------------
// CustomerNotificationStore
// -----------------------------------------------------------------------

export class CustomerNotificationStore {
    private readonly configs = new Map<string, CustomerNotificationConfig>();

    registerCustomer(config: CustomerNotificationConfig): void {
        this.configs.set(config.customerId, config);
    }

    getConfig(customerId: string): CustomerNotificationConfig | undefined {
        return this.configs.get(customerId);
    }

    has(customerId: string): boolean {
        return this.configs.has(customerId);
    }
}

// -----------------------------------------------------------------------
// NotificationService
// -----------------------------------------------------------------------

export class NotificationService {
    constructor(private readonly store: CustomerNotificationStore) { }

    async send(customerId: string, payload: NotificationPayload): Promise<NotificationResult> {
        const entry = this.store.getConfig(customerId);

        if (!entry) {
            return {
                success: false,
                adapter: 'none',
                error: `No notification config registered for customer: ${customerId}`,
            };
        }

        let adapter: NotificationAdapter;
        try {
            adapter = AdapterFactory.create(entry.config);
        } catch (err) {
            return {
                success: false,
                adapter: 'none',
                error: err instanceof Error ? err.message : String(err),
            };
        }

        return adapter.send(payload);
    }
}
