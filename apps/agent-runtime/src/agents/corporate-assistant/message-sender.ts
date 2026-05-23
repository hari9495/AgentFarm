/**
 * Corporate Assistant — Message Sender
 *
 * Sends messages to Slack or Microsoft Teams via their respective MCP
 * connector servers. No direct Slack/Teams SDK calls are made here.
 *
 * Connector selection:
 *   - platform 'slack'  → MCP_SLACK_URL env var
 *   - platform 'teams'  → MCP_TEAMS_URL env var
 *   - connector param   → caller-supplied override (used in tests)
 *
 * Design rules:
 *   - Throws MessageConnectorUnavailableError when no connector is configured.
 *   - Never falls back to a different platform — if Slack is requested and
 *     only Teams is configured, it fails fast and tells the caller why.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessagePlatform = 'slack' | 'teams';

export type SendMessageParams = {
    tenantId: string;
    botId: string;
    /** 'slack' or 'teams' */
    platform: MessagePlatform;
    /** Channel ID, @handle, or email address of the recipient. */
    recipient: string;
    /** Plain-text or markdown message body. */
    message: string;
    /** Optional connector name override — used in tests. */
    connector?: string;
};

export type SendMessageResult = {
    sent: boolean;
    messageId: string | null;
    platform: MessagePlatform;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class MessageConnectorUnavailableError extends Error {
    constructor(platform: string) {
        super(
            `Messaging connector for "${platform}" is not available. ` +
            `Set ${platform === 'slack' ? 'MCP_SLACK_URL' : 'MCP_TEAMS_URL'} to enable it.`,
        );
        this.name = 'MessageConnectorUnavailableError';
    }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const PLATFORM_ENV_MAP: Record<MessagePlatform, string> = {
    slack: 'MCP_SLACK_URL',
    teams: 'MCP_TEAMS_URL',
};

function resolveMessagingConnectorUrl(platform: MessagePlatform, connectorOverride?: string): string {
    if (connectorOverride) return connectorOverride;
    const envKey = PLATFORM_ENV_MAP[platform];
    const url = (process.env[envKey] ?? '').trim();
    if (!url) throw new MessageConnectorUnavailableError(platform);
    return url;
}

async function callMessagingMcp<T extends Record<string, unknown>>(
    tool: string,
    input: Record<string, unknown>,
    platform: MessagePlatform,
    connectorOverride?: string,
): Promise<T> {
    const baseUrl = resolveMessagingConnectorUrl(platform, connectorOverride);
    const url = `${baseUrl}/tools/${tool}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });

    if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(
            `Messaging MCP call failed [${platform}/${tool}]: HTTP ${response.status} — ${text.slice(0, 200)}`,
        );
    }

    return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a message to a Slack channel or Teams channel/user.
 *
 * The `recipient` field is passed directly to the MCP connector:
 *   - Slack: channel ID (C01234), @handle, or #channel-name
 *   - Teams: channel ID, UPN (user@company.com), or display name
 */
export async function sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const result = await callMessagingMcp<{
        messageId?: string;
        message_id?: string;
        sent?: boolean;
    }>(
        'send_message',
        {
            tenantId: params.tenantId,
            botId: params.botId,
            recipient: params.recipient,
            message: params.message,
        },
        params.platform,
        params.connector,
    );

    return {
        sent: result.sent ?? true,
        messageId: result.messageId ?? result.message_id ?? null,
        platform: params.platform,
    };
}
