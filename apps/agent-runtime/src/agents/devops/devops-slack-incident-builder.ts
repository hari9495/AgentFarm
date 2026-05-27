// ============================================================================
// DEVOPS SLACK INCIDENT BUILDER
//
// Builders for Slack incident channel lifecycle management used by the
// workspace_devops_slack_incident action.
//
// Uses the Slack Web API (curl-based). Requires a Slack Bot Token with
// channels:manage, chat:write, pins:write, users:read, groups:write scopes.
//
// Sub-actions:
//   channel_create      — conversations.create (create incident channel)
//   channel_invite      — conversations.invite (add responders)
//   channel_topic       — conversations.setTopic (set incident topic)
//   channel_archive     — conversations.archive (close incident channel)
//   channel_info        — conversations.info
//   message_post        — chat.postMessage
//   message_update      — chat.update
//   pin_message         — pins.add
//   unpin_message       — pins.remove
//   channel_list        — conversations.list (find incident channels)
//   user_lookup         — users.lookupByEmail
//   war_room_setup      — Combined: create + invite + topic + pin welcome message
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlackChannel {
    id:          string;
    name:        string;
    is_archived: boolean;
    topic?:      string;
    purpose?:    string;
    members?:    string[];
    created:     number;
}

export interface SlackMessage {
    ts:      string;
    channel: string;
    text:    string;
    user?:   string;
    blocks?: unknown[];
}

export interface IncidentWarRoomSpec {
    incidentId:  string;
    severity:    'p1' | 'p2' | 'p3' | 'p4';
    title:       string;
    responders:  string[];   // Slack user IDs
    service?:    string;
    runbookUrl?: string;
    dashboardUrl?: string;
}

export interface WarRoomResult {
    channelId:   string;
    channelName: string;
    pinnedTs?:   string;
    invitedCount: number;
}

// ---------------------------------------------------------------------------
// Slack API builder helpers
// ---------------------------------------------------------------------------

const SLACK_API = 'https://slack.com/api';

function slackCurlBase(token: string): string[] {
    return [
        'curl', '-s',
        '-H', `Authorization: Bearer ${token}`,
        '-H', 'Content-Type: application/json; charset=utf-8',
    ];
}

function buildSlackPostArgs(token: string, method: string, body: Record<string, unknown>): string[] {
    return [
        ...slackCurlBase(token),
        '-X', 'POST',
        '-d', JSON.stringify(body),
        `${SLACK_API}/${method}`,
    ];
}

function buildSlackGetArgs(token: string, method: string, qs?: Record<string, string>): string[] {
    const query = qs ? '?' + Object.entries(qs).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&') : '';
    return [...slackCurlBase(token), `${SLACK_API}/${method}${query}`];
}

// ---------------------------------------------------------------------------
// Channel management
// ---------------------------------------------------------------------------

export function buildSlackChannelCreateArgs(params: {
    token:     string;
    name:      string;
    isPrivate?: boolean;
}): string[] {
    return buildSlackPostArgs(params.token, 'conversations.create', {
        name:       params.name.toLowerCase().replace(/\s+/g, '-'),
        is_private: params.isPrivate ?? false,
    });
}

export function buildSlackChannelInviteArgs(params: {
    token:   string;
    channel: string;  // channel ID
    users:   string[];  // user IDs
}): string[] {
    return buildSlackPostArgs(params.token, 'conversations.invite', {
        channel: params.channel,
        users:   params.users.join(','),
    });
}

export function buildSlackChannelTopicArgs(params: {
    token:   string;
    channel: string;
    topic:   string;
}): string[] {
    return buildSlackPostArgs(params.token, 'conversations.setTopic', {
        channel: params.channel,
        topic:   params.topic,
    });
}

export function buildSlackChannelArchiveArgs(params: {
    token:   string;
    channel: string;
}): string[] {
    return buildSlackPostArgs(params.token, 'conversations.archive', {
        channel: params.channel,
    });
}

export function buildSlackChannelInfoArgs(params: {
    token:   string;
    channel: string;
}): string[] {
    return buildSlackGetArgs(params.token, 'conversations.info', { channel: params.channel });
}

export function buildSlackChannelListArgs(params: {
    token:       string;
    namePrefix?: string;   // filter by name prefix client-side
    limit?:      number;
    excludeArchived?: boolean;
}): string[] {
    return buildSlackGetArgs(params.token, 'conversations.list', {
        limit:            String(params.limit ?? 200),
        exclude_archived: String(params.excludeArchived ?? false),
        types:            'public_channel,private_channel',
    });
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export function buildSlackMessagePostArgs(params: {
    token:    string;
    channel:  string;
    text:     string;
    blocks?:  unknown[];
    threadTs?: string;
    username?: string;
    iconEmoji?: string;
}): string[] {
    const body: Record<string, unknown> = {
        channel: params.channel,
        text:    params.text,
    };
    if (params.blocks)    { body['blocks']    = params.blocks; }
    if (params.threadTs)  { body['thread_ts'] = params.threadTs; }
    if (params.username)  { body['username']  = params.username; }
    if (params.iconEmoji) { body['icon_emoji'] = params.iconEmoji; }
    return buildSlackPostArgs(params.token, 'chat.postMessage', body);
}

export function buildSlackMessageUpdateArgs(params: {
    token:   string;
    channel: string;
    ts:      string;
    text:    string;
    blocks?: unknown[];
}): string[] {
    const body: Record<string, unknown> = {
        channel: params.channel,
        ts:      params.ts,
        text:    params.text,
    };
    if (params.blocks) { body['blocks'] = params.blocks; }
    return buildSlackPostArgs(params.token, 'chat.update', body);
}

export function buildSlackPinAddArgs(params: {
    token:   string;
    channel: string;
    ts:      string;
}): string[] {
    return buildSlackPostArgs(params.token, 'pins.add', {
        channel:   params.channel,
        timestamp: params.ts,
    });
}

export function buildSlackPinRemoveArgs(params: {
    token:   string;
    channel: string;
    ts:      string;
}): string[] {
    return buildSlackPostArgs(params.token, 'pins.remove', {
        channel:   params.channel,
        timestamp: params.ts,
    });
}

// ---------------------------------------------------------------------------
// User lookup
// ---------------------------------------------------------------------------

export function buildSlackUserLookupArgs(params: {
    token: string;
    email: string;
}): string[] {
    return buildSlackGetArgs(params.token, 'users.lookupByEmail', { email: params.email });
}

// ---------------------------------------------------------------------------
// War room template builders
// ---------------------------------------------------------------------------

export function buildIncidentChannelName(spec: Pick<IncidentWarRoomSpec, 'incidentId' | 'severity'>): string {
    const ts   = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `inc-${spec.severity}-${ts}-${spec.incidentId}`.toLowerCase().slice(0, 80);
}

export function buildWarRoomWelcomeMessage(spec: IncidentWarRoomSpec): string {
    const sev    = spec.severity.toUpperCase();
    const lines  = [
        `*🚨 ${sev} Incident: ${spec.title}*`,
        `*Incident ID:* ${spec.incidentId}`,
        ...(spec.service     ? [`*Affected Service:* ${spec.service}`]    : []),
        ...(spec.runbookUrl  ? [`*Runbook:* ${spec.runbookUrl}`]          : []),
        ...(spec.dashboardUrl ? [`*Dashboard:* ${spec.dashboardUrl}`]     : []),
        '',
        '*Pinned for quick reference. Updates will be posted here.*',
    ];
    return lines.join('\n');
}

export function buildIncidentStatusUpdateBlocks(params: {
    title:     string;
    status:    'investigating' | 'identified' | 'monitoring' | 'resolved';
    update:    string;
    updatedBy: string;
}): unknown[] {
    const statusEmoji: Record<string, string> = {
        investigating: '🔍',
        identified:    '🎯',
        monitoring:    '👁️',
        resolved:      '✅',
    };
    return [
        {
            type: 'header',
            text: { type: 'plain_text', text: `${statusEmoji[params.status] ?? '•'} ${params.title}`, emoji: true },
        },
        {
            type: 'section',
            fields: [
                { type: 'mrkdwn', text: `*Status:*\n${params.status.toUpperCase()}` },
                { type: 'mrkdwn', text: `*Updated by:*\n${params.updatedBy}` },
                { type: 'mrkdwn', text: `*Time:*\n${new Date().toISOString()}` },
                { type: 'mrkdwn', text: `*Update:*\n${params.update}` },
            ],
        },
    ];
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

export function parseSlackChannel(raw: string): SlackChannel | null {
    try {
        const j = JSON.parse(raw);
        if (!j.ok) return null;
        const c = j.channel ?? j;
        return {
            id:          c.id          ?? '',
            name:        c.name        ?? '',
            is_archived: c.is_archived ?? false,
            topic:       c.topic?.value   || undefined,
            purpose:     c.purpose?.value || undefined,
            members:     c.members       || undefined,
            created:     c.created       ?? 0,
        };
    } catch { return null; }
}

export function parseSlackChannelList(raw: string): SlackChannel[] {
    try {
        const j = JSON.parse(raw);
        if (!j.ok) return [];
        const channels: unknown[] = j.channels ?? [];
        return (channels as any[]).map((c) => ({
            id:          c.id          ?? '',
            name:        c.name        ?? '',
            is_archived: c.is_archived ?? false,
            topic:       c.topic?.value   || undefined,
            purpose:     c.purpose?.value || undefined,
            created:     c.created       ?? 0,
        }));
    } catch { return []; }
}

export function parseSlackMessage(raw: string): SlackMessage | null {
    try {
        const j = JSON.parse(raw);
        if (!j.ok) return null;
        const msg = j.message ?? j;
        return {
            ts:      j.ts        ?? msg.ts  ?? '',
            channel: j.channel   ?? '',
            text:    msg.text    ?? '',
            user:    msg.user    || undefined,
        };
    } catch { return null; }
}

export function parseSlackUserId(raw: string): string | null {
    try {
        const j = JSON.parse(raw);
        if (!j.ok) return null;
        return j.user?.id ?? null;
    } catch { return null; }
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function formatSlackIncidentChannelReport(channel: SlackChannel): string {
    const status = channel.is_archived ? '📁 Archived' : '🟢 Active';
    const lines  = [
        `# Slack Channel: #${channel.name}`,
        `- **Status:** ${status}`,
        `- **ID:** \`${channel.id}\``,
        `- **Created:** ${new Date(channel.created * 1000).toISOString()}`,
    ];
    if (channel.topic)   { lines.push(`- **Topic:** ${channel.topic}`); }
    if (channel.purpose) { lines.push(`- **Purpose:** ${channel.purpose}`); }
    if (channel.members) { lines.push(`- **Members:** ${channel.members.length}`); }
    return lines.join('\n');
}

export function formatWarRoomCreatedReport(result: WarRoomResult): string {
    return [
        `# War Room Created`,
        `- **Channel:** #${result.channelName} (\`${result.channelId}\`)`,
        `- **Responders invited:** ${result.invitedCount}`,
        ...(result.pinnedTs ? [`- **Welcome message pinned:** ✅`] : []),
    ].join('\n');
}

export function buildIncidentResolutionMessage(params: {
    incidentId:  string;
    title:       string;
    resolvedBy:  string;
    rootCause?:  string;
    duration?:   string;
    actionItems?: string[];
}): string {
    const lines = [
        `✅ *INCIDENT RESOLVED: ${params.title}*`,
        `*Incident ID:* ${params.incidentId}`,
        `*Resolved by:* ${params.resolvedBy}`,
        ...(params.duration  ? [`*Duration:* ${params.duration}`]      : []),
        ...(params.rootCause ? [`*Root cause:* ${params.rootCause}`]   : []),
    ];
    if (params.actionItems?.length) {
        lines.push('', '*Action items:*');
        for (const item of params.actionItems) { lines.push(`• ${item}`); }
    }
    lines.push('', '_This channel will be archived in 7 days._');
    return lines.join('\n');
}
