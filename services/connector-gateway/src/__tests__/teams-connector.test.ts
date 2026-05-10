import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { TeamsConnector } from '../connectors/teams-connector.js';

// ---------------------------------------------------------------------------
// Fetch mock infrastructure
// ---------------------------------------------------------------------------

type FetchCall = { url: string; init?: RequestInit };

let originalFetch: typeof globalThis.fetch;
let fetchCalls: FetchCall[] = [];
let mockResponseQueue: Array<() => Promise<Response>> = [];

const queueResponse = (body: unknown, status = 200): void => {
    const json = JSON.stringify(body);
    mockResponseQueue.push(() =>
        Promise.resolve(new Response(json, { status, headers: { 'Content-Type': 'application/json' } })),
    );
};

const queueRawResponse = (response: Response): void => {
    mockResponseQueue.push(() => Promise.resolve(response));
};

const mockToken = (expiresIn = 3600) => ({ access_token: 'mock-access-token', expires_in: expiresIn });

beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchCalls = [];
    mockResponseQueue = [];
    globalThis.fetch = (url, init) => {
        fetchCalls.push({ url: url.toString(), init });
        const next = mockResponseQueue.shift();
        if (!next) throw new Error(`Unexpected fetch call to: ${url.toString()}`);
        return next();
    };
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    fetchCalls = [];
    mockResponseQueue = [];
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeConnector = (): TeamsConnector =>
    new TeamsConnector({
        tenantId: 'tenant-id-test',
        clientId: 'client-id-test',
        clientSecret: 'client-secret-test',
    });

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('TeamsConnector construction', () => {
    test('throws if tenantId is missing', () => {
        assert.throws(
            () => new TeamsConnector({ tenantId: '', clientId: 'cid', clientSecret: 'cs' }),
            /tenantId is required/,
        );
    });

    test('throws if clientId is missing', () => {
        assert.throws(
            () => new TeamsConnector({ tenantId: 'tid', clientId: '', clientSecret: 'cs' }),
            /clientId is required/,
        );
    });

    test('throws if clientSecret is missing', () => {
        assert.throws(
            () => new TeamsConnector({ tenantId: 'tid', clientId: 'cid', clientSecret: '' }),
            /clientSecret is required/,
        );
    });

    test('fromEnv throws when env vars are missing', () => {
        const saved = {
            tenant: process.env['TEAMS_TENANT_ID'],
            client: process.env['TEAMS_CLIENT_ID'],
            secret: process.env['TEAMS_CLIENT_SECRET'],
        };
        delete process.env['TEAMS_TENANT_ID'];
        delete process.env['TEAMS_CLIENT_ID'];
        delete process.env['TEAMS_CLIENT_SECRET'];
        try {
            assert.throws(() => TeamsConnector.fromEnv(), /TEAMS_TENANT_ID/);
        } finally {
            if (saved.tenant) process.env['TEAMS_TENANT_ID'] = saved.tenant;
            if (saved.client) process.env['TEAMS_CLIENT_ID'] = saved.client;
            if (saved.secret) process.env['TEAMS_CLIENT_SECRET'] = saved.secret;
        }
    });
});

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

describe('TeamsConnector token caching', () => {
    test('token is fetched once and cached for subsequent calls', async () => {
        // First call: token, second call: API
        queueResponse(mockToken());
        queueResponse({ id: 'msg-1', body: { content: 'hello' }, createdDateTime: new Date().toISOString() });
        queueResponse({ id: 'msg-2', body: { content: 'world' }, createdDateTime: new Date().toISOString() });

        const connector = makeConnector();

        await connector.sendMessage('ch-1', 'team-1', 'hello');
        await connector.sendMessage('ch-1', 'team-1', 'world');

        // Token fetched once, two API calls = 3 total
        const tokenCalls = fetchCalls.filter((c) => c.url.includes('oauth2/v2.0/token'));
        const apiCalls = fetchCalls.filter((c) => c.url.includes('graph.microsoft.com'));

        assert.equal(tokenCalls.length, 1, 'Token should be fetched exactly once');
        assert.equal(apiCalls.length, 2, 'Two API calls should have been made');
    });

    test('expired token triggers a refresh fetch', async () => {
        // First sendMessage: token (very short TTL) + API call
        queueResponse({ access_token: 'old-token', expires_in: 1 }); // 1 second = expires immediately
        queueResponse({ id: 'msg-1', body: { content: 'hi' }, createdDateTime: new Date().toISOString() });
        // Second sendMessage: new token + API call
        queueResponse({ access_token: 'new-token', expires_in: 3600 });
        queueResponse({ id: 'msg-2', body: { content: 'world' }, createdDateTime: new Date().toISOString() });

        const connector = makeConnector();

        await connector.sendMessage('ch-1', 'team-1', 'hi');

        // Force expiry by backdating the cached token
        connector.invalidateToken();

        await connector.sendMessage('ch-1', 'team-1', 'world');

        const tokenCalls = fetchCalls.filter((c) => c.url.includes('oauth2/v2.0/token'));
        assert.equal(tokenCalls.length, 2, 'Token should be refreshed after invalidation');
    });

    test('token request uses correct tenant endpoint', async () => {
        queueResponse(mockToken());
        queueResponse({ id: 'msg-1', body: { content: 'hi' }, createdDateTime: new Date().toISOString() });

        const connector = makeConnector();
        await connector.sendMessage('ch-1', 'team-1', 'hi');

        const tokenCall = fetchCalls.find((c) => c.url.includes('oauth2/v2.0/token'));
        assert.ok(tokenCall, 'Token call should exist');
        assert.ok(
            tokenCall!.url.includes('tenant-id-test'),
            `Token URL should include tenantId, got: ${tokenCall!.url}`,
        );
    });
});

// ---------------------------------------------------------------------------
// sendMessage
// ---------------------------------------------------------------------------

describe('TeamsConnector.sendMessage', () => {
    test('returns message id on success', async () => {
        queueResponse(mockToken());
        queueResponse({
            id: 'msg-abc-123',
            body: { content: 'Hello Teams!' },
            from: { user: { displayName: 'AgentBot' } },
            createdDateTime: '2026-05-10T12:00:00Z',
            webUrl: 'https://teams.microsoft.com/link/msg-abc-123',
        });

        const connector = makeConnector();
        const result = await connector.sendMessage('ch-general', 'team-eng', 'Hello Teams!');

        assert.ok(result.ok);
        assert.equal(result.data!.id, 'msg-abc-123');
        assert.equal(result.data!.from, 'AgentBot');
    });

    test('returns error if required fields are missing', async () => {
        const connector = makeConnector();
        const result = await connector.sendMessage('', 'team-1', 'msg');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('required'));
    });

    test('sanitizes script tags from message content', async () => {
        queueResponse(mockToken());
        let capturedBody = '';
        globalThis.fetch = (url, init) => {
            fetchCalls.push({ url: url.toString(), init });
            capturedBody = typeof init?.body === 'string' ? init.body : '';
            if (url.toString().includes('oauth2')) {
                return Promise.resolve(new Response(JSON.stringify(mockToken()), { status: 200 }));
            }
            return Promise.resolve(new Response(JSON.stringify({ id: 'm1', createdDateTime: new Date().toISOString() }), { status: 200 }));
        };

        const connector = makeConnector();
        await connector.sendMessage('ch-1', 'team-1', 'safe<script>alert(1)</script>content');
        assert.ok(!capturedBody.includes('<script>'), 'script tags should be stripped from message');
    });
});

// ---------------------------------------------------------------------------
// replyToThread
// ---------------------------------------------------------------------------

describe('TeamsConnector.replyToThread', () => {
    test('returns reply message id on success', async () => {
        queueResponse(mockToken());
        queueResponse({
            id: 'reply-001',
            body: { content: 'Thread reply' },
            createdDateTime: '2026-05-10T12:01:00Z',
        });

        const connector = makeConnector();
        const result = await connector.replyToThread('ch-1', 'team-1', 'msg-parent', 'Thread reply');

        assert.ok(result.ok);
        assert.equal(result.data!.id, 'reply-001');
    });
});

// ---------------------------------------------------------------------------
// listChannels
// ---------------------------------------------------------------------------

describe('TeamsConnector.listChannels', () => {
    test('returns array of channels', async () => {
        queueResponse(mockToken());
        queueResponse({
            value: [
                { id: 'ch-001', displayName: 'General', description: 'General channel', membershipType: 'standard', webUrl: 'https://...' },
                { id: 'ch-002', displayName: 'Dev', description: null, membershipType: 'standard' },
            ],
        });

        const connector = makeConnector();
        const result = await connector.listChannels('team-eng');

        assert.ok(result.ok);
        assert.equal(result.data!.length, 2);
        assert.equal(result.data![0]!.displayName, 'General');
        assert.equal(result.data![1]!.description, null);
    });

    test('returns error for empty teamId', async () => {
        const connector = makeConnector();
        const result = await connector.listChannels('');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('teamId is required'));
    });
});

// ---------------------------------------------------------------------------
// listTeams
// ---------------------------------------------------------------------------

describe('TeamsConnector.listTeams', () => {
    test('returns array of teams', async () => {
        queueResponse(mockToken());
        queueResponse({
            value: [
                { id: 'team-001', displayName: 'Engineering', description: 'Eng team', isArchived: false },
                { id: 'team-002', displayName: 'Operations', description: null, isArchived: true },
            ],
        });

        const connector = makeConnector();
        const result = await connector.listTeams();

        assert.ok(result.ok);
        assert.equal(result.data!.length, 2);
        assert.equal(result.data![0]!.isArchived, false);
        assert.equal(result.data![1]!.isArchived, true);
    });
});

// ---------------------------------------------------------------------------
// getChannelInfo
// ---------------------------------------------------------------------------

describe('TeamsConnector.getChannelInfo', () => {
    test('returns channel info on success', async () => {
        queueResponse(mockToken());
        queueResponse({
            id: 'ch-001',
            displayName: 'General',
            description: 'Main channel',
            membershipType: 'standard',
            webUrl: 'https://teams.microsoft.com/ch-001',
        });

        const connector = makeConnector();
        const result = await connector.getChannelInfo('ch-001', 'team-eng');

        assert.ok(result.ok);
        assert.equal(result.data!.id, 'ch-001');
        assert.equal(result.data!.displayName, 'General');
    });

    test('returns error on 404', async () => {
        queueResponse(mockToken());
        queueResponse({ error: { code: 'NotFound', message: 'Channel not found' } }, 404);

        const connector = makeConnector();
        const result = await connector.getChannelInfo('ch-missing', 'team-eng');
        assert.equal(result.ok, false);
        assert.equal(result.status, 404);
    });
});

// ---------------------------------------------------------------------------
// sendAdaptiveCard
// ---------------------------------------------------------------------------

describe('TeamsConnector.sendAdaptiveCard', () => {
    test('returns message id after posting card', async () => {
        queueResponse(mockToken());
        queueResponse({ id: 'card-msg-001', createdDateTime: new Date().toISOString() });

        const connector = makeConnector();
        const cardPayload = { type: 'AdaptiveCard', version: '1.4', body: [{ type: 'TextBlock', text: 'Hello' }] };
        const result = await connector.sendAdaptiveCard('ch-1', 'team-1', cardPayload);

        assert.ok(result.ok);
        assert.equal(result.data!.id, 'card-msg-001');
        assert.equal(result.data!.body, '[Adaptive Card]');
    });
});

// ---------------------------------------------------------------------------
// createMeeting
// ---------------------------------------------------------------------------

describe('TeamsConnector.createMeeting', () => {
    test('returns meeting with joinUrl on success', async () => {
        queueResponse(mockToken());
        queueResponse({
            id: 'meeting-xyz',
            subject: 'Sprint Planning',
            start: { dateTime: '2026-05-15T10:00:00Z' },
            end: { dateTime: '2026-05-15T11:00:00Z' },
            joinUrl: 'https://teams.microsoft.com/join/xyz',
            organizer: { emailAddress: { name: 'Alice' } },
        });

        const connector = makeConnector();
        const result = await connector.createMeeting(
            'Sprint Planning',
            '2026-05-15T10:00:00Z',
            '2026-05-15T11:00:00Z',
            ['bob@test.com'],
        );

        assert.ok(result.ok);
        assert.equal(result.data!.subject, 'Sprint Planning');
        assert.equal(result.data!.joinUrl, 'https://teams.microsoft.com/join/xyz');
        assert.equal(result.data!.organizer, 'Alice');
    });

    test('returns error if subject is missing', async () => {
        const connector = makeConnector();
        const result = await connector.createMeeting('', '2026-05-15T10:00:00Z', '2026-05-15T11:00:00Z', []);
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('subject'));
    });
});

// ---------------------------------------------------------------------------
// getMeetingInfo
// ---------------------------------------------------------------------------

describe('TeamsConnector.getMeetingInfo', () => {
    test('returns meeting info on success', async () => {
        queueResponse(mockToken());
        queueResponse({
            id: 'meeting-abc',
            subject: 'Standup',
            start: { dateTime: '2026-05-10T09:00:00Z' },
            end: { dateTime: '2026-05-10T09:15:00Z' },
            joinUrl: null,
        });

        const connector = makeConnector();
        const result = await connector.getMeetingInfo('meeting-abc');

        assert.ok(result.ok);
        assert.equal(result.data!.id, 'meeting-abc');
        assert.equal(result.data!.joinUrl, null);
    });
});

// ---------------------------------------------------------------------------
// sendIncidentAlert
// ---------------------------------------------------------------------------

describe('TeamsConnector.sendIncidentAlert', () => {
    test('posts adaptive card and returns message id', async () => {
        queueResponse(mockToken());
        queueResponse({ id: 'alert-msg-001', createdDateTime: new Date().toISOString() });

        const connector = makeConnector();
        const result = await connector.sendIncidentAlert(
            'ch-incidents',
            'team-ops',
            'Database down',
            'critical',
            'Primary DB unresponsive since 12:00 UTC',
        );

        assert.ok(result.ok);
        assert.equal(result.data!.id, 'alert-msg-001');
    });

    test('returns error if channelId is missing', async () => {
        const connector = makeConnector();
        const result = await connector.sendIncidentAlert('', 'team-1', 'title', 'high', 'desc');
        assert.equal(result.ok, false);
    });
});

// ---------------------------------------------------------------------------
// fetch never called for API key read
// ---------------------------------------------------------------------------

test('TeamsConnector does not read API key env vars', async () => {
    // Confirm the connector reads only TEAMS_* vars, not GITHUB_TOKEN, SLACK_BOT_TOKEN, etc.
    const saved = {
        github: process.env['GITHUB_TOKEN'],
        slack: process.env['SLACK_BOT_TOKEN'],
        jiraToken: process.env['JIRA_API_TOKEN'],
    };
    // Set them to sentinel values
    process.env['GITHUB_TOKEN'] = 'SHOULD_NOT_APPEAR';
    process.env['SLACK_BOT_TOKEN'] = 'xoxb-SHOULD_NOT_APPEAR';
    process.env['JIRA_API_TOKEN'] = 'SHOULD_NOT_APPEAR';

    queueResponse(mockToken());
    queueResponse({ id: 'msg-ok', body: { content: 'hi' }, createdDateTime: new Date().toISOString() });

    const connector = makeConnector();
    await connector.sendMessage('ch-1', 'team-1', 'hi');

    const authHeader = fetchCalls
        .filter((c) => c.url.includes('graph.microsoft.com'))
        .map((c) => (c.init?.headers as Record<string, string>)?.['Authorization'] ?? '')
        .at(0) ?? '';

    assert.ok(!authHeader.includes('SHOULD_NOT_APPEAR'), 'API call should use OAuth token, not other env var secrets');

    // Restore
    if (saved.github !== undefined) process.env['GITHUB_TOKEN'] = saved.github;
    else delete process.env['GITHUB_TOKEN'];
    if (saved.slack !== undefined) process.env['SLACK_BOT_TOKEN'] = saved.slack;
    else delete process.env['SLACK_BOT_TOKEN'];
    if (saved.jiraToken !== undefined) process.env['JIRA_API_TOKEN'] = saved.jiraToken;
    else delete process.env['JIRA_API_TOKEN'];
});
