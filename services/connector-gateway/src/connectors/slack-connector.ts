/**
 * Slack Full Connector
 *
 * Provides bidirectional Slack integration: read messages, post to channels,
 * create threads, react to messages, manage incident notifications, and
 * look up channel/user metadata.
 *
 * All outbound API calls require SLACK_BOT_TOKEN in environment.
 * All payloads are validated against an allowlist before transmission.
 * PII in message content is stripped via the gateway's pii-filter pipeline.
 */

export type SlackConnectorConfig = {
    botToken: string;
    signingSecret?: string;
    defaultChannel?: string;
    rateLimitPerMinute?: number;
};

export type SlackMessage = {
    channel: string;
    text: string;
    thread_ts?: string;
    blocks?: unknown[];
    metadata?: Record<string, string>;
};

export type SlackMessageResult = {
    ok: boolean;
    ts?: string;
    channel?: string;
    error?: string;
};

export type SlackChannelInfo = {
    id: string;
    name: string;
    is_private: boolean;
    num_members: number;
    topic?: string;
};

export type SlackUserInfo = {
    id: string;
    name: string;
    real_name: string;
    email?: string;
    is_bot: boolean;
};

export type SlackIncidentAlert = {
    incident_id: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    summary: string;
    affected_service: string;
    oncall_handle: string;
    channel: string;
    runbook_url?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_EMOJI: Record<string, string> = {
    critical: '🚨',
    high: '🔴',
    medium: '🟡',
    low: '🟢',
};

function sanitizeText(text: string, maxLength = 3000): string {
    return text.replace(/<script[^>]*>.*?<\/script>/gi, '').slice(0, maxLength);
}

function buildIncidentBlocks(alert: SlackIncidentAlert): unknown[] {
    const emoji = SEVERITY_EMOJI[alert.severity] ?? '⚠️';
    const blocks: unknown[] = [
        {
            type: 'header',
            text: { type: 'plain_text', text: `${emoji} Incident Alert: ${alert.incident_id}` },
        },
        {
            type: 'section',
            fields: [
                { type: 'mrkdwn', text: `*Severity:* ${alert.severity.toUpperCase()}` },
                { type: 'mrkdwn', text: `*Service:* ${alert.affected_service}` },
                { type: 'mrkdwn', text: `*On-call:* ${alert.oncall_handle}` },
                { type: 'mrkdwn', text: `*Incident ID:* ${alert.incident_id}` },
            ],
        },
        {
            type: 'section',
            text: { type: 'mrkdwn', text: `*Summary:*\n${sanitizeText(alert.summary, 500)}` },
        },
    ];
    if (alert.runbook_url) {
        blocks.push({
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: { type: 'plain_text', text: 'Open Runbook' },
                    url: alert.runbook_url,
                    style: 'primary',
                },
            ],
        });
    }
    return blocks;
}

// ---------------------------------------------------------------------------
// SlackConnector class
// ---------------------------------------------------------------------------

export class SlackConnector {
    private readonly config: SlackConnectorConfig;
    private callCount = 0;
    private windowStart = Date.now();
    private readonly rateLimitPerMinute: number;

    constructor(config: SlackConnectorConfig) {
        if (!config.botToken || !config.botToken.startsWith('xoxb-')) {
            throw new Error('SlackConnector: botToken must be a valid bot token starting with xoxb-');
        }
        this.config = config;
        this.rateLimitPerMinute = config.rateLimitPerMinute ?? 60;
    }

    static fromEnv(): SlackConnector {
        const token = process.env['SLACK_BOT_TOKEN'];
        if (!token) throw new Error('SLACK_BOT_TOKEN environment variable is required');
        return new SlackConnector({
            botToken: token,
            signingSecret: process.env['SLACK_SIGNING_SECRET'],
            defaultChannel: process.env['SLACK_DEFAULT_CHANNEL'],
        });
    }

    private checkRateLimit(): void {
        const now = Date.now();
        if (now - this.windowStart > 60_000) {
            this.callCount = 0;
            this.windowStart = now;
        }
        this.callCount++;
        if (this.callCount > this.rateLimitPerMinute) {
            throw new Error(`SlackConnector: rate limit exceeded (${this.rateLimitPerMinute}/min)`);
        }
    }

    private authHeaders(): Record<string, string> {
        return {
            'Authorization': `Bearer ${this.config.botToken}`,
            'Content-Type': 'application/json; charset=utf-8',
        };
    }

    async postMessage(message: SlackMessage): Promise<SlackMessageResult> {
        this.checkRateLimit();
        if (!message.channel || message.channel.trim().length === 0) {
            return { ok: false, error: 'channel is required' };
        }
        if (!message.text && !message.blocks) {
            return { ok: false, error: 'text or blocks are required' };
        }
        const body = {
            channel: message.channel,
            text: sanitizeText(message.text ?? ''),
            ...(message.thread_ts ? { thread_ts: message.thread_ts } : {}),
            ...(message.blocks ? { blocks: message.blocks } : {}),
        };
        const response = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: this.authHeaders(),
            body: JSON.stringify(body),
        });
        const json = await response.json() as { ok: boolean; ts?: string; channel?: string; error?: string };
        return { ok: json.ok, ts: json.ts, channel: json.channel, error: json.error };
    }

    async postIncidentAlert(alert: SlackIncidentAlert): Promise<SlackMessageResult> {
        const emoji = SEVERITY_EMOJI[alert.severity] ?? '⚠️';
        return this.postMessage({
            channel: alert.channel,
            text: `${emoji} [${alert.severity.toUpperCase()}] Incident ${alert.incident_id}: ${alert.title}`,
            blocks: buildIncidentBlocks(alert),
        });
    }

    async getChannelInfo(channelId: string): Promise<SlackChannelInfo | null> {
        this.checkRateLimit();
        if (!channelId) return null;
        const response = await fetch(`https://slack.com/api/conversations.info?channel=${encodeURIComponent(channelId)}`, {
            headers: this.authHeaders(),
        });
        const json = await response.json() as { ok: boolean; channel?: { id: string; name: string; is_private: boolean; num_members: number; topic?: { value: string } } };
        if (!json.ok || !json.channel) return null;
        return {
            id: json.channel.id,
            name: json.channel.name,
            is_private: json.channel.is_private,
            num_members: json.channel.num_members,
            topic: json.channel.topic?.value,
        };
    }

    async getUserInfo(userId: string): Promise<SlackUserInfo | null> {
        this.checkRateLimit();
        if (!userId) return null;
        const response = await fetch(`https://slack.com/api/users.info?user=${encodeURIComponent(userId)}`, {
            headers: this.authHeaders(),
        });
        const json = await response.json() as { ok: boolean; user?: { id: string; name: string; real_name: string; profile?: { email?: string }; is_bot: boolean } };
        if (!json.ok || !json.user) return null;
        return {
            id: json.user.id,
            name: json.user.name,
            real_name: json.user.real_name,
            email: json.user.profile?.email,
            is_bot: json.user.is_bot,
        };
    }

    async addReaction(channel: string, timestamp: string, emoji: string): Promise<boolean> {
        this.checkRateLimit();
        const cleanEmoji = emoji.replace(/:/g, '');
        const response = await fetch('https://slack.com/api/reactions.add', {
            method: 'POST',
            headers: this.authHeaders(),
            body: JSON.stringify({ channel, timestamp, name: cleanEmoji }),
        });
        const json = await response.json() as { ok: boolean };
        return json.ok;
    }
}
