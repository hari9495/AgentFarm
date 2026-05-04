import type { NotificationChannelConfig, NotificationDispatchResult, NotificationRecord } from '@agentfarm/shared-types';

/**
 * Builds the Telegram sendMessage API request payload.
 * Exported for unit testing without real HTTP calls.
 */
export function buildTelegramRequest(
    botToken: string,
    chatId: string,
    text: string,
): { url: string; body: Record<string, unknown> } {
    return {
        url: `https://api.telegram.org/bot${botToken}/sendMessage`,
        body: { chat_id: chatId, text, parse_mode: 'Markdown' },
    };
}

/**
 * Sends a notification via the Telegram Bot API.
 * In production this performs a real HTTP POST; the request builder is kept
 * separate so callers can verify the payload in tests without network access.
 */
export async function sendTelegram(
    record: NotificationRecord,
    channelConfig: NotificationChannelConfig,
    fetcher: (url: string, body: Record<string, unknown>) => Promise<string | undefined> = _defaultFetch,
): Promise<NotificationDispatchResult> {
    const { botToken, chatId } = channelConfig.config;

    if (!botToken || !chatId) {
        return {
            notificationId: record.id,
            channel: 'telegram',
            success: false,
            errorMessage: 'telegram: missing botToken or chatId in channel config',
        };
    }

    const text = `*${record.title}*\n${record.body}`;
    const req = buildTelegramRequest(botToken, chatId, text);

    try {
        const platformMessageId = await fetcher(req.url, req.body);
        return {
            notificationId: record.id,
            channel: 'telegram',
            success: true,
            platformMessageId,
        };
    } catch (err) {
        return {
            notificationId: record.id,
            channel: 'telegram',
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
            { hostname: parsedUrl.hostname, path: parsedUrl.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
            (res) => {
                let raw = '';
                res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(raw) as { result?: { message_id?: number } };
                        resolve(json.result?.message_id !== undefined ? String(json.result.message_id) : undefined);
                    } catch {
                        resolve(undefined);
                    }
                });
            },
        );
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}
