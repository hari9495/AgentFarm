import type { NotificationChannelConfig, NotificationDispatchResult, NotificationRecord } from '@agentfarm/shared-types';

/**
 * Builds the Slack API request payload.
 * Supports both Incoming Webhook URLs and the chat.postMessage Bot Token API.
 */
export function buildSlackRequest(
    webhookUrlOrApiUrl: string,
    text: string,
    channelId?: string,
): { url: string; body: Record<string, unknown> } {
    // Incoming webhook: body is just { text }
    // Bot Token + chat.postMessage: body includes { channel, text }
    const body: Record<string, unknown> = { text };
    if (channelId) body['channel'] = channelId;
    return { url: webhookUrlOrApiUrl, body };
}

export async function sendSlack(
    record: NotificationRecord,
    channelConfig: NotificationChannelConfig,
    fetcher: (url: string, body: Record<string, unknown>) => Promise<string | undefined> = _defaultFetch,
): Promise<NotificationDispatchResult> {
    const { webhookUrl, botToken, channelId } = channelConfig.config;

    // Accept either an incoming webhook URL or a bot-token + channel combination
    const url = webhookUrl ?? (botToken ? 'https://slack.com/api/chat.postMessage' : undefined);

    if (!url) {
        return {
            notificationId: record.id,
            channel: 'slack',
            success: false,
            errorMessage: 'slack: missing webhookUrl or botToken in channel config',
        };
    }

    const text = `*${record.title}*\n${record.body}`;
    const req = buildSlackRequest(url, text, channelId);
    if (botToken) {
        (req.body as Record<string, unknown>)['Authorization'] = `Bearer ${botToken}`;
    }

    try {
        const platformMessageId = await fetcher(req.url, req.body);
        return { notificationId: record.id, channel: 'slack', success: true, platformMessageId };
    } catch (err) {
        return {
            notificationId: record.id,
            channel: 'slack',
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
            { hostname: parsedUrl.hostname, path: `${parsedUrl.pathname}${parsedUrl.search}`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
            (res) => {
                let raw = '';
                res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(raw) as { ts?: string };
                        resolve(json.ts);
                    } catch { resolve(undefined); }
                });
            },
        );
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}
