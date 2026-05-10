/**
 * Microsoft Teams Connector (Microsoft Graph API)
 *
 * Provides Teams integration: messages, threads, channels, teams metadata,
 * adaptive cards, online meetings, and incident alerts.
 *
 * Auth: OAuth2 client credentials flow against Microsoft Graph.
 * Token endpoint: https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
 * Scope: https://graph.microsoft.com/.default
 * Token is cached in memory and refreshed when expired.
 *
 * Required env vars: TEAMS_TENANT_ID, TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TeamsConnectorConfig = {
    tenantId: string;
    clientId: string;
    clientSecret: string;
};

export type TeamsMessage = {
    id: string;
    channelId: string;
    teamId: string;
    body: string;
    from: string | null;
    createdAt: string;
    webUrl: string | null;
};

export type TeamsChannel = {
    id: string;
    displayName: string;
    description: string | null;
    membershipType: string;
    webUrl: string | null;
};

export type TeamsTeam = {
    id: string;
    displayName: string;
    description: string | null;
    isArchived: boolean;
};

export type TeamsMeeting = {
    id: string;
    subject: string;
    startDateTime: string;
    endDateTime: string;
    joinUrl: string | null;
    organizer: string | null;
};

export type TeamsQueryResult<T> = {
    ok: boolean;
    data?: T;
    error?: string;
    status?: number;
};

// ---------------------------------------------------------------------------
// Internal token cache
// ---------------------------------------------------------------------------

type CachedToken = {
    accessToken: string;
    expiresAt: number; // Unix ms
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeTeamsText(text: string, maxLength = 28000): string {
    return text.replace(/<script[^>]*>.*?<\/script>/gi, '').slice(0, maxLength);
}

const SEVERITY_COLOR: Record<string, string> = {
    critical: 'attention',
    high: 'warning',
    medium: 'good',
    low: 'default',
};

// ---------------------------------------------------------------------------
// TeamsConnector class
// ---------------------------------------------------------------------------

export class TeamsConnector {
    private readonly config: TeamsConnectorConfig;
    private readonly graphBaseUrl = 'https://graph.microsoft.com/v1.0';
    private tokenCache: CachedToken | null = null;

    constructor(config: TeamsConnectorConfig) {
        if (!config.tenantId || config.tenantId.trim().length === 0) {
            throw new Error('TeamsConnector: tenantId is required (TEAMS_TENANT_ID)');
        }
        if (!config.clientId || config.clientId.trim().length === 0) {
            throw new Error('TeamsConnector: clientId is required (TEAMS_CLIENT_ID)');
        }
        if (!config.clientSecret || config.clientSecret.trim().length === 0) {
            throw new Error('TeamsConnector: clientSecret is required (TEAMS_CLIENT_SECRET)');
        }
        this.config = config;
    }

    static fromEnv(): TeamsConnector {
        const tenantId = process.env['TEAMS_TENANT_ID'];
        const clientId = process.env['TEAMS_CLIENT_ID'];
        const clientSecret = process.env['TEAMS_CLIENT_SECRET'];
        if (!tenantId || !clientId || !clientSecret) {
            throw new Error('TeamsConnector.fromEnv: TEAMS_TENANT_ID, TEAMS_CLIENT_ID, TEAMS_CLIENT_SECRET are required');
        }
        return new TeamsConnector({ tenantId, clientId, clientSecret });
    }

    // ── Token management ───────────────────────────────────────────────────

    /**
     * Returns a valid access token, fetching a new one if the cached token
     * is absent or will expire within 60 seconds.
     */
    async getAccessToken(): Promise<string> {
        const nowMs = Date.now();
        if (this.tokenCache && this.tokenCache.expiresAt > nowMs + 60_000) {
            return this.tokenCache.accessToken;
        }

        const tokenUrl = `https://login.microsoftonline.com/${this.config.tenantId}/oauth2/v2.0/token`;
        const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            scope: 'https://graph.microsoft.com/.default',
        });

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`TeamsConnector: failed to obtain access token (${response.status}): ${text.slice(0, 256)}`);
        }

        const json = await response.json() as { access_token: string; expires_in: number };
        this.tokenCache = {
            accessToken: json.access_token,
            expiresAt: nowMs + json.expires_in * 1000,
        };

        return this.tokenCache.accessToken;
    }

    /** Expire the cached token (for testing / forced refresh). */
    invalidateToken(): void {
        this.tokenCache = null;
    }

    private async authHeaders(): Promise<Record<string, string>> {
        const token = await this.getAccessToken();
        return {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        };
    }

    private async request<T>(
        method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        path: string,
        body?: unknown,
    ): Promise<TeamsQueryResult<T>> {
        const url = path.startsWith('https://') ? path : `${this.graphBaseUrl}${path}`;
        const headers = await this.authHeaders();

        const response = await fetch(url, {
            method,
            headers,
            ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            return {
                ok: false,
                error: `Graph API returned ${response.status}: ${text.slice(0, 256)}`,
                status: response.status,
            };
        }

        if (response.status === 204) {
            return { ok: true, status: 204 };
        }

        const json = await response.json() as T;
        return { ok: true, data: json, status: response.status };
    }

    // ── Messages ───────────────────────────────────────────────────────────

    async sendMessage(channelId: string, teamId: string, message: string): Promise<TeamsQueryResult<TeamsMessage>> {
        if (!channelId || !teamId || !message) {
            return { ok: false, error: 'channelId, teamId, and message are required' };
        }

        const sanitized = sanitizeTeamsText(message);
        const result = await this.request<{
            id: string;
            body: { content: string };
            from?: { user?: { displayName: string } };
            createdDateTime: string;
            webUrl?: string;
        }>('POST', `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`, {
            body: { contentType: 'text', content: sanitized },
        });

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: {
                id: result.data.id,
                channelId,
                teamId,
                body: sanitized,
                from: result.data.from?.user?.displayName ?? null,
                createdAt: result.data.createdDateTime,
                webUrl: result.data.webUrl ?? null,
            },
        };
    }

    async replyToThread(
        channelId: string,
        teamId: string,
        messageId: string,
        text: string,
    ): Promise<TeamsQueryResult<TeamsMessage>> {
        if (!channelId || !teamId || !messageId || !text) {
            return { ok: false, error: 'channelId, teamId, messageId, and text are required' };
        }

        const sanitized = sanitizeTeamsText(text);
        const result = await this.request<{
            id: string;
            body: { content: string };
            from?: { user?: { displayName: string } };
            createdDateTime: string;
            webUrl?: string;
        }>('POST', `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages/${encodeURIComponent(messageId)}/replies`, {
            body: { contentType: 'text', content: sanitized },
        });

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: {
                id: result.data.id,
                channelId,
                teamId,
                body: sanitized,
                from: result.data.from?.user?.displayName ?? null,
                createdAt: result.data.createdDateTime,
                webUrl: result.data.webUrl ?? null,
            },
        };
    }

    // ── Channels ───────────────────────────────────────────────────────────

    async listChannels(teamId: string): Promise<TeamsQueryResult<TeamsChannel[]>> {
        if (!teamId || teamId.trim().length === 0) {
            return { ok: false, error: 'teamId is required' };
        }

        const result = await this.request<{
            value: Array<{
                id: string;
                displayName: string;
                description?: string | null;
                membershipType: string;
                webUrl?: string;
            }>;
        }>('GET', `/teams/${encodeURIComponent(teamId)}/channels`);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: result.data.value.map((c) => ({
                id: c.id,
                displayName: c.displayName,
                description: c.description ?? null,
                membershipType: c.membershipType,
                webUrl: c.webUrl ?? null,
            })),
        };
    }

    async getChannelInfo(channelId: string, teamId: string): Promise<TeamsQueryResult<TeamsChannel>> {
        if (!channelId || !teamId) {
            return { ok: false, error: 'channelId and teamId are required' };
        }

        const result = await this.request<{
            id: string;
            displayName: string;
            description?: string | null;
            membershipType: string;
            webUrl?: string;
        }>('GET', `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}`);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: {
                id: result.data.id,
                displayName: result.data.displayName,
                description: result.data.description ?? null,
                membershipType: result.data.membershipType,
                webUrl: result.data.webUrl ?? null,
            },
        };
    }

    // ── Teams ──────────────────────────────────────────────────────────────

    async listTeams(): Promise<TeamsQueryResult<TeamsTeam[]>> {
        const result = await this.request<{
            value: Array<{
                id: string;
                displayName: string;
                description?: string | null;
                isArchived: boolean;
            }>;
        }>('GET', '/groups?$filter=resourceProvisioningOptions/Any(x:x eq \'Team\')&$select=id,displayName,description,isArchived');

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: result.data.value.map((t) => ({
                id: t.id,
                displayName: t.displayName,
                description: t.description ?? null,
                isArchived: t.isArchived ?? false,
            })),
        };
    }

    // ── Adaptive Cards ─────────────────────────────────────────────────────

    async sendAdaptiveCard(
        channelId: string,
        teamId: string,
        cardPayload: Record<string, unknown>,
    ): Promise<TeamsQueryResult<TeamsMessage>> {
        if (!channelId || !teamId || !cardPayload) {
            return { ok: false, error: 'channelId, teamId, and cardPayload are required' };
        }

        const result = await this.request<{
            id: string;
            createdDateTime: string;
            webUrl?: string;
        }>('POST', `/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/messages`, {
            body: {
                contentType: 'html',
                content: '<attachment id="adaptive_card"></attachment>',
            },
            attachments: [
                {
                    id: 'adaptive_card',
                    contentType: 'application/vnd.microsoft.card.adaptive',
                    contentUrl: null,
                    content: JSON.stringify(cardPayload),
                    name: null,
                    thumbnailUrl: null,
                },
            ],
        });

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: {
                id: result.data.id,
                channelId,
                teamId,
                body: '[Adaptive Card]',
                from: null,
                createdAt: result.data.createdDateTime,
                webUrl: result.data.webUrl ?? null,
            },
        };
    }

    // ── Meetings ───────────────────────────────────────────────────────────

    async createMeeting(
        subject: string,
        startTime: string,
        endTime: string,
        attendees: string[],
    ): Promise<TeamsQueryResult<TeamsMeeting>> {
        if (!subject || !startTime || !endTime) {
            return { ok: false, error: 'subject, startTime, and endTime are required' };
        }

        const result = await this.request<{
            id: string;
            subject: string;
            start: { dateTime: string };
            end: { dateTime: string };
            joinUrl?: string;
            organizer?: { emailAddress?: { name?: string } };
        }>('POST', '/me/onlineMeetings', {
            subject,
            startDateTime: startTime,
            endDateTime: endTime,
            participants: {
                attendees: attendees.map((email) => ({
                    upn: email,
                    role: 'attendee',
                })),
            },
        });

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: {
                id: result.data.id,
                subject: result.data.subject,
                startDateTime: result.data.start.dateTime,
                endDateTime: result.data.end.dateTime,
                joinUrl: result.data.joinUrl ?? null,
                organizer: result.data.organizer?.emailAddress?.name ?? null,
            },
        };
    }

    async getMeetingInfo(meetingId: string): Promise<TeamsQueryResult<TeamsMeeting>> {
        if (!meetingId || meetingId.trim().length === 0) {
            return { ok: false, error: 'meetingId is required' };
        }

        const result = await this.request<{
            id: string;
            subject: string;
            start: { dateTime: string };
            end: { dateTime: string };
            joinUrl?: string;
            organizer?: { emailAddress?: { name?: string } };
        }>('GET', `/me/onlineMeetings/${encodeURIComponent(meetingId)}`);

        if (!result.ok || !result.data) {
            return { ok: result.ok, error: result.error, status: result.status };
        }

        return {
            ok: true,
            data: {
                id: result.data.id,
                subject: result.data.subject,
                startDateTime: result.data.start.dateTime,
                endDateTime: result.data.end.dateTime,
                joinUrl: result.data.joinUrl ?? null,
                organizer: result.data.organizer?.emailAddress?.name ?? null,
            },
        };
    }

    // ── Incident Alerts ────────────────────────────────────────────────────

    async sendIncidentAlert(
        channelId: string,
        teamId: string,
        title: string,
        severity: 'critical' | 'high' | 'medium' | 'low',
        description: string,
    ): Promise<TeamsQueryResult<TeamsMessage>> {
        if (!channelId || !teamId || !title || !severity) {
            return { ok: false, error: 'channelId, teamId, title, and severity are required' };
        }

        const color = SEVERITY_COLOR[severity] ?? 'default';
        const cardPayload = {
            type: 'AdaptiveCard',
            version: '1.4',
            body: [
                {
                    type: 'TextBlock',
                    text: `🚨 Incident Alert: ${title}`,
                    weight: 'Bolder',
                    size: 'Large',
                    color,
                },
                {
                    type: 'FactSet',
                    facts: [
                        { title: 'Severity', value: severity.toUpperCase() },
                        { title: 'Description', value: sanitizeTeamsText(description, 500) },
                    ],
                },
            ],
            '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
        };

        return this.sendAdaptiveCard(channelId, teamId, cardPayload);
    }
}
