import type { NotificationChannelConfig, NotificationDispatchResult, NotificationRecord } from '@agentfarm/shared-types';

/**
 * Builds the HTTP relay request payload for an email notification.
 * The relay endpoint receives a JSON body and is responsible for SMTP delivery.
 */
export function buildEmailRequest(
    relayUrl: string,
    to: string,
    from: string,
    subject: string,
    text: string,
): { url: string; body: Record<string, unknown> } {
    return {
        url: relayUrl,
        body: { to, from, subject, text },
    };
}

export async function sendEmail(
    record: NotificationRecord,
    channelConfig: NotificationChannelConfig,
    fetcher: (url: string, body: Record<string, unknown>) => Promise<string | undefined> = _defaultFetch,
): Promise<NotificationDispatchResult> {
    const { to, from, relayUrl } = channelConfig.config;

    if (!to) {
        return {
            notificationId: record.id,
            channel: 'email',
            success: false,
            errorMessage: 'email: missing to address in channel config',
        };
    }

    if (!relayUrl) {
        return {
            notificationId: record.id,
            channel: 'email',
            success: false,
            errorMessage: 'email: missing relayUrl in channel config',
        };
    }

    const subject = record.title;
    const text = record.body;
    const sender = from ?? 'noreply@agentfarm.dev';
    const req = buildEmailRequest(relayUrl, to, sender, subject, text);

    try {
        const platformMessageId = await fetcher(req.url, req.body);
        return { notificationId: record.id, channel: 'email', success: true, platformMessageId };
    } catch (err) {
        return {
            notificationId: record.id,
            channel: 'email',
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
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                },
            },
            (res) => {
                let raw = '';
                res.on('data', (chunk: Buffer) => { raw += chunk.toString(); });
                res.on('end', () => {
                    try {
                        const json = JSON.parse(raw) as { messageId?: string };
                        resolve(json.messageId);
                    } catch { resolve(undefined); }
                });
            },
        );
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}
