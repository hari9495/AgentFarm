import type { NotificationChannelConfig, NotificationDispatchResult, NotificationRecord } from '@agentfarm/shared-types';

/**
 * Builds the Discord webhook embed payload.
 */
export function buildDiscordRequest(
    webhookUrl: string,
    title: string,
    description: string,
): { url: string; body: Record<string, unknown> } {
    return {
        url: webhookUrl,
        body: {
            embeds: [{ title, description }],
        },
    };
}

export async function sendDiscord(
    record: NotificationRecord,
    channelConfig: NotificationChannelConfig,
    fetcher: (url: string, body: Record<string, unknown>) => Promise<string | undefined> = _defaultFetch,
): Promise<NotificationDispatchResult> {
    const { webhookUrl } = channelConfig.config;

    if (!webhookUrl) {
        return {
            notificationId: record.id,
            channel: 'discord',
            success: false,
            errorMessage: 'discord: missing webhookUrl in channel config',
        };
    }

    const req = buildDiscordRequest(webhookUrl, record.title, record.body);

    try {
        const platformMessageId = await fetcher(req.url, req.body);
        return { notificationId: record.id, channel: 'discord', success: true, platformMessageId };
    } catch (err) {
        return {
            notificationId: record.id,
            channel: 'discord',
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
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const parsedUrl = new URL(url);
        const req = https.request(
            { hostname: parsedUrl.hostname, path: `${parsedUrl.pathname}${parsedUrl.search}`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
            (res) => {
                let raw = '';
                res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
                res.on('end', () => {
                    // Discord returns 204 No Content on success; no message_id in response body
                    resolve(res.headers['x-message-id'] as string | undefined);
                });
            },
        );
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}
