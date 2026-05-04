import type {
    NotificationChannelConfig,
    NotificationDispatchResult,
    NotificationRecord,
} from '@agentfarm/shared-types';
import { sendDiscord } from './channels/discord-adapter.js';
import { sendSlack } from './channels/slack-adapter.js';
import { sendTelegram } from './channels/telegram-adapter.js';
import { sendVoice } from './channels/voice-adapter.js';

export type ChannelFetcher = (url: string, body: Record<string, unknown>) => Promise<string | undefined>;

const APPROVAL_TRIGGERS: ReadonlySet<NotificationRecord['trigger']> = new Set([
    'approval_requested',
    'approval_decided',
]);

/**
 * Routes a NotificationRecord to the correct adapter based on channel.
 * Each adapter is independently non-blocking — failures do not affect other channels.
 *
 * If a channel config has `allowedTriggers` set, it is only activated when
 * `record.trigger` is in that list.
 */
export async function dispatch(
    record: NotificationRecord,
    configs: NotificationChannelConfig[],
    fetcher?: ChannelFetcher,
): Promise<NotificationDispatchResult[]> {
    const activeConfigs = configs.filter(
        (c) =>
            c.enabled &&
            c.channel === record.channel &&
            (c.allowedTriggers === undefined || c.allowedTriggers.includes(record.trigger)),
    );

    if (activeConfigs.length === 0) {
        return [
            {
                notificationId: record.id,
                channel: record.channel,
                success: false,
                errorMessage: `No active config found for channel: ${record.channel}`,
            },
        ];
    }

    const results = await Promise.allSettled(
        activeConfigs.map((cfg) => routeToAdapter(record, cfg, fetcher)),
    );

    return results.map((r) =>
        r.status === 'fulfilled'
            ? r.value
            : {
                notificationId: record.id,
                channel: record.channel,
                success: false,
                errorMessage: r.reason instanceof Error ? r.reason.message : String(r.reason),
            },
    );
}

/**
 * Routes a single record+config pair to the appropriate adapter.
 */
function routeToAdapter(
    record: NotificationRecord,
    cfg: NotificationChannelConfig,
    fetcher?: ChannelFetcher,
): Promise<NotificationDispatchResult> {
    switch (cfg.channel) {
        case 'telegram':
            return sendTelegram(record, cfg, fetcher);
        case 'slack':
            return sendSlack(record, cfg, fetcher);
        case 'discord':
            return sendDiscord(record, cfg, fetcher);
        case 'webhook':
            return sendWebhook(record, cfg, fetcher);
        case 'voice':
            return sendVoice(record, cfg, fetcher);
        case 'email':
            // Email adapter is not yet wired — fail gracefully
            return Promise.resolve({
                notificationId: record.id,
                channel: 'email',
                success: false,
                errorMessage: 'email adapter not yet implemented',
            });
        default: {
            const exhaustive: never = cfg.channel;
            return Promise.resolve({
                notificationId: record.id,
                channel: record.channel,
                success: false,
                errorMessage: `Unknown channel: ${String(exhaustive)}`,
            });
        }
    }
}

/**
 * Generic webhook: POST the notification payload as JSON.
 */
async function sendWebhook(
    record: NotificationRecord,
    cfg: NotificationChannelConfig,
    fetcher?: ChannelFetcher,
): Promise<NotificationDispatchResult> {
    const { url } = cfg.config;
    if (!url) {
        return {
            notificationId: record.id,
            channel: 'webhook',
            success: false,
            errorMessage: 'webhook: missing url in channel config',
        };
    }

    const body: Record<string, unknown> = {
        id: record.id,
        trigger: record.trigger,
        title: record.title,
        body: record.body,
        payload: record.payload,
        correlationId: record.correlationId,
    };

    const send = fetcher ?? _defaultFetch;
    try {
        const platformMessageId = await send(url, body);
        return { notificationId: record.id, channel: 'webhook', success: true, platformMessageId };
    } catch (err) {
        return {
            notificationId: record.id,
            channel: 'webhook',
            success: false,
            errorMessage: err instanceof Error ? err.message : String(err),
        };
    }
}

async function _defaultFetch(
    url: string,
    body: Record<string, unknown>,
): Promise<string | undefined> {
    const { default: https } = await import('node:https');
    const { default: http } = await import('node:http');
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const parsedUrl = new URL(url);
        const lib = parsedUrl.protocol === 'https:' ? https : http;
        const req = lib.request(
            {
                hostname: parsedUrl.hostname,
                path: `${parsedUrl.pathname}${parsedUrl.search}`,
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
            },
            (res) => {
                res.resume(); // drain
                resolve(res.headers['x-request-id'] as string | undefined);
            },
        );
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

/**
 * Approval-only gateway: dispatches a notification only when its trigger is
 * `approval_requested` or `approval_decided`.  Any other trigger is silently
 * skipped and an empty array is returned so callers can detect the no-op.
 *
 * This is the recommended entry point for the approval notification flow.
 */
export async function dispatchApprovalAlert(
    record: NotificationRecord,
    configs: NotificationChannelConfig[],
    fetcher?: ChannelFetcher,
): Promise<NotificationDispatchResult[]> {
    if (!APPROVAL_TRIGGERS.has(record.trigger)) {
        return [];
    }
    // Pin each config to approval triggers so the lower-level filter also
    // rejects configs that have been intentionally restricted to other events.
    const approvalConfigs = configs.map((c) => ({
        ...c,
        allowedTriggers: [...APPROVAL_TRIGGERS] as NotificationRecord['trigger'][],
    }));
    return dispatch(record, approvalConfigs, fetcher);
}
