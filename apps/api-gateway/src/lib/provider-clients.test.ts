import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createRealProviderExecutor,
    createRealConnectorHealthProbe,
} from '../lib/provider-clients.js';
import { createInMemorySecretStore } from '../lib/secret-store.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchCall = { url: string; method: string; body?: unknown; headers?: Record<string, string> };

const makeFetch = (responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) => {
    const calls: FetchCall[] = [];
    let idx = 0;

    const fetcher = async (url: string | URL, init?: RequestInit): Promise<Response> => {
        const entry = responses[idx++];
        if (!entry) {
            throw new Error(`Unexpected fetch call #${idx} to ${String(url)}`);
        }

        calls.push({
            url: String(url),
            method: (init?.method ?? 'GET').toUpperCase(),
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
            headers: init?.headers as Record<string, string> | undefined,
        });

        const respHeaders = new Headers(entry.headers ?? {});
        return new Response(
            entry.body !== undefined ? JSON.stringify(entry.body) : null,
            { status: entry.status, headers: respHeaders },
        ) as Response;
    };

    return { fetcher: fetcher as typeof fetch, calls };
};

const jiraSecret = JSON.stringify({
    access_token: 'jira-token-123',
    base_url: 'https://acme.atlassian.net',
});

const teamsSecret = JSON.stringify({ access_token: 'teams-token-456' });
const githubSecret = JSON.stringify({ access_token: 'gh-token-789' });
const sendgridSecret = JSON.stringify({
    type: 'sendgrid',
    api_key: 'SG.test-key',
    from_address: 'bot@agentfarm.ai',
});

const SECRET_REF_JIRA = 'kv://vault/secrets/jira-connector';
const SECRET_REF_TEAMS = 'kv://vault/secrets/teams-connector';
const SECRET_REF_GITHUB = 'kv://vault/secrets/github-connector';
const SECRET_REF_EMAIL = 'kv://vault/secrets/email-connector';

const makeStore = () =>
    createInMemorySecretStore({
        [SECRET_REF_JIRA]: jiraSecret,
        [SECRET_REF_TEAMS]: teamsSecret,
        [SECRET_REF_GITHUB]: githubSecret,
        [SECRET_REF_EMAIL]: sendgridSecret,
    });

// ---------------------------------------------------------------------------
// Jira: read_task
// ---------------------------------------------------------------------------

test('jira read_task returns issue summary and status', async () => {
    const { fetcher, calls } = makeFetch([
        {
            status: 200,
            body: { key: 'PROJ-42', fields: { summary: 'Fix login bug', status: { name: 'In Progress' } } },
        },
    ]);

    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'jira',
        actionType: 'read_task',
        payload: { issue_key: 'PROJ-42' },
        attempt: 1,
        secretRefId: SECRET_REF_JIRA,
    });

    assert.equal(result.ok, true);
    assert.equal(result.providerResponseCode, '200');
    assert.ok(result.resultSummary.includes('PROJ-42'));
    assert.ok(result.resultSummary.includes('Fix login bug'));
    assert.ok(result.resultSummary.includes('In Progress'));
    assert.equal(calls.length, 1);
    assert.ok(calls[0]!.url.includes('/rest/api/3/issue/PROJ-42'));
    assert.equal(calls[0]!.method, 'GET');
});

test('jira read_task returns invalid_format when issue_key missing', async () => {
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'jira',
        actionType: 'read_task',
        payload: {},
        attempt: 1,
        secretRefId: SECRET_REF_JIRA,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
});

test('jira read_task classifies 401 as permission_denied non-transient', async () => {
    const { fetcher } = makeFetch([{ status: 401 }]);
    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'jira',
        actionType: 'read_task',
        payload: { issue_key: 'PROJ-1' },
        attempt: 1,
        secretRefId: SECRET_REF_JIRA,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'permission_denied');
    assert.equal(result.transient, false);
});

test('jira read_task classifies 429 as rate_limit transient', async () => {
    const { fetcher } = makeFetch([{ status: 429 }]);
    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'jira',
        actionType: 'read_task',
        payload: { issue_key: 'PROJ-1' },
        attempt: 1,
        secretRefId: SECRET_REF_JIRA,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'rate_limit');
    assert.equal(result.transient, true);
});

test('jira read_task classifies 500 as provider_unavailable transient', async () => {
    const { fetcher } = makeFetch([{ status: 500 }]);
    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'jira',
        actionType: 'read_task',
        payload: { issue_key: 'PROJ-1' },
        attempt: 1,
        secretRefId: SECRET_REF_JIRA,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'provider_unavailable');
    assert.equal(result.transient, true);
});

test('jira read_task classifies network throw as provider_unavailable transient', async () => {
    const throwingFetch = async (): Promise<Response> => {
        throw new Error('ECONNREFUSED');
    };

    const executor = createRealProviderExecutor(makeStore(), throwingFetch as typeof fetch);
    const result = await executor({
        connectorType: 'jira',
        actionType: 'read_task',
        payload: { issue_key: 'PROJ-1' },
        attempt: 1,
        secretRefId: SECRET_REF_JIRA,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'provider_unavailable');
    assert.equal(result.transient, true);
    assert.ok(result.errorMessage?.includes('ECONNREFUSED'));
});

// ---------------------------------------------------------------------------
// Jira: create_comment
// ---------------------------------------------------------------------------

test('jira create_comment posts ADF body and returns comment id', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 201, body: { id: 'cmt-99' } },
    ]);

    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'jira',
        actionType: 'create_comment',
        payload: { issue_key: 'PROJ-10', body: 'Automated agent comment' },
        attempt: 1,
        secretRefId: SECRET_REF_JIRA,
    });

    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('cmt-99'));
    assert.ok(result.resultSummary.includes('PROJ-10'));
    assert.equal(calls[0]!.method, 'POST');
    assert.ok(calls[0]!.url.includes('/comment'));
    // Verify ADF format
    const body = calls[0]!.body as { body: { type: string; content: unknown[] } };
    assert.equal(body.body.type, 'doc');
});

test('jira create_comment returns invalid_format when body missing', async () => {
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'jira',
        actionType: 'create_comment',
        payload: { issue_key: 'PROJ-10' },
        attempt: 1,
        secretRefId: SECRET_REF_JIRA,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
});

// ---------------------------------------------------------------------------
// Jira: update_status
// ---------------------------------------------------------------------------

test('jira update_status fetches transitions and applies correct one', async () => {
    const { fetcher, calls } = makeFetch([
        {
            status: 200,
            body: {
                transitions: [
                    { id: '11', name: 'To Do' },
                    { id: '21', name: 'In Progress' },
                    { id: '31', name: 'Done' },
                ],
            },
        },
        { status: 204 },
    ]);

    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'jira',
        actionType: 'update_status',
        payload: { issue_key: 'PROJ-5', transition_name: 'In Progress' },
        attempt: 1,
        secretRefId: SECRET_REF_JIRA,
    });

    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('In Progress'));
    assert.equal(calls.length, 2);
    // First call: GET transitions
    assert.equal(calls[0]!.method, 'GET');
    // Second call: POST transition with correct id
    assert.equal(calls[1]!.method, 'POST');
    const applyBody = calls[1]!.body as { transition: { id: string } };
    assert.equal(applyBody.transition.id, '21');
});

test('jira update_status returns invalid_format when transition not found', async () => {
    const { fetcher } = makeFetch([
        { status: 200, body: { transitions: [{ id: '11', name: 'To Do' }] } },
    ]);

    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'jira',
        actionType: 'update_status',
        payload: { issue_key: 'PROJ-5', transition_name: 'Nonexistent' },
        attempt: 1,
        secretRefId: SECRET_REF_JIRA,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
    assert.ok(result.errorMessage?.includes('To Do'));
});

// ---------------------------------------------------------------------------
// Teams: send_message
// ---------------------------------------------------------------------------

test('teams send_message posts to Graph and returns message id', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 201, body: { id: 'msg-graph-77' } },
    ]);

    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'teams',
        actionType: 'send_message',
        payload: { team_id: 'team-abc', channel_id: 'chan-xyz', text: 'Sprint stand-up ready' },
        attempt: 1,
        secretRefId: SECRET_REF_TEAMS,
    });

    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('msg-graph-77'));
    assert.ok(calls[0]!.url.includes('graph.microsoft.com'));
    assert.ok(calls[0]!.url.includes('team-abc'));
    assert.ok(calls[0]!.url.includes('chan-xyz'));
    assert.equal(calls[0]!.method, 'POST');
});

test('teams send_message returns invalid_format when channel_id missing', async () => {
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'teams',
        actionType: 'send_message',
        payload: { team_id: 'team-abc', text: 'Hello' },
        attempt: 1,
        secretRefId: SECRET_REF_TEAMS,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
});

test('teams send_message classifies 403 as permission_denied', async () => {
    const { fetcher } = makeFetch([{ status: 403 }]);
    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'teams',
        actionType: 'send_message',
        payload: { team_id: 't', channel_id: 'c', text: 'x' },
        attempt: 1,
        secretRefId: SECRET_REF_TEAMS,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'permission_denied');
    assert.equal(result.transient, false);
});

// ---------------------------------------------------------------------------
// GitHub: create_pr_comment
// ---------------------------------------------------------------------------

test('github create_pr_comment posts comment and returns id', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 201, body: { id: 98765, html_url: 'https://github.com/...' } },
    ]);

    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'github',
        actionType: 'create_pr_comment',
        payload: {
            owner: 'acme',
            repo: 'backend',
            pull_number: 42,
            body: 'LGTM — automated review by developer-agent',
        },
        attempt: 1,
        secretRefId: SECRET_REF_GITHUB,
    });

    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('98765'));
    assert.ok(result.resultSummary.includes('PR #42'));
    assert.ok(calls[0]!.url.includes('api.github.com'));
    assert.ok(calls[0]!.url.includes('acme/backend/pulls/42'));
    assert.equal(calls[0]!.method, 'POST');
    const sentHeaders = calls[0]!.headers ?? {};
    assert.ok(sentHeaders['Accept']?.includes('vnd.github'));
    assert.ok(sentHeaders['X-GitHub-Api-Version'] === '2022-11-28');
});

test('github create_pr_comment includes optional inline comment fields when provided', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 201, body: { id: 1 } },
    ]);

    const executor = createRealProviderExecutor(makeStore(), fetcher);
    await executor({
        connectorType: 'github',
        actionType: 'create_pr_comment',
        payload: {
            owner: 'acme',
            repo: 'backend',
            pull_number: 10,
            body: 'nit: rename variable',
            commit_id: 'abc123',
            path: 'src/index.ts',
            position: 5,
        },
        attempt: 1,
        secretRefId: SECRET_REF_GITHUB,
    });

    const sentBody = calls[0]!.body as Record<string, unknown>;
    assert.equal(sentBody['commit_id'], 'abc123');
    assert.equal(sentBody['path'], 'src/index.ts');
    assert.equal(sentBody['position'], 5);
});

test('github create_pr_comment returns invalid_format when pull_number not integer', async () => {
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'github',
        actionType: 'create_pr_comment',
        payload: { owner: 'o', repo: 'r', pull_number: 'not-a-number', body: 'hi' },
        attempt: 1,
        secretRefId: SECRET_REF_GITHUB,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
});

// ---------------------------------------------------------------------------
// Email: send_email (SendGrid)
// ---------------------------------------------------------------------------

test('email send_email via sendgrid posts to sendgrid API', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 202 },
    ]);

    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'email',
        actionType: 'send_email',
        payload: {
            to: ['alice@example.com', 'bob@example.com'],
            subject: 'Sprint summary',
            body: 'Here is your summary.',
        },
        attempt: 1,
        secretRefId: SECRET_REF_EMAIL,
    });

    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('alice@example.com'));
    assert.ok(calls[0]!.url.includes('sendgrid.com'));
    assert.equal(calls[0]!.method, 'POST');

    const sgBody = calls[0]!.body as {
        personalizations: Array<{ to: Array<{ email: string }> }>;
        subject: string;
        from: { email: string };
    };
    assert.equal(sgBody.subject, 'Sprint summary');
    assert.equal(sgBody.from.email, 'bot@agentfarm.ai');
    assert.equal(sgBody.personalizations[0]!.to.length, 2);
});

test('email send_email accepts single string to field', async () => {
    const { fetcher, calls } = makeFetch([{ status: 202 }]);
    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'email',
        actionType: 'send_email',
        payload: { to: 'alice@example.com', subject: 'Hello', body: 'World' },
        attempt: 1,
        secretRefId: SECRET_REF_EMAIL,
    });

    assert.equal(result.ok, true);
    const sgBody = calls[0]!.body as { personalizations: Array<{ to: Array<{ email: string }> }> };
    assert.equal(sgBody.personalizations[0]!.to[0]!.email, 'alice@example.com');
});

test('email send_email returns invalid_format when to is empty array', async () => {
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'email',
        actionType: 'send_email',
        payload: { to: [], subject: 'Hi', body: 'Text' },
        attempt: 1,
        secretRefId: SECRET_REF_EMAIL,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
});

test('email send_email classifies 401 from sendgrid as permission_denied', async () => {
    const { fetcher } = makeFetch([{ status: 401 }]);
    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'email',
        actionType: 'send_email',
        payload: { to: ['x@y.com'], subject: 'Hi', body: 'Text' },
        attempt: 1,
        secretRefId: SECRET_REF_EMAIL,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'permission_denied');
    assert.equal(result.transient, false);
});

// ---------------------------------------------------------------------------
// Secret retrieval failures
// ---------------------------------------------------------------------------

test('executor returns upgrade_required when secretRefId is null', async () => {
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'jira',
        actionType: 'read_task',
        payload: { issue_key: 'PROJ-1' },
        attempt: 1,
        secretRefId: null,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'upgrade_required');
});

test('executor returns upgrade_required when secret not found in store', async () => {
    const emptyStore = createInMemorySecretStore({});
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(emptyStore, fetcher);
    const result = await executor({
        connectorType: 'jira',
        actionType: 'read_task',
        payload: { issue_key: 'PROJ-1' },
        attempt: 1,
        secretRefId: 'kv://vault/secrets/missing',
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'upgrade_required');
});

test('executor returns upgrade_required when credentials JSON is invalid', async () => {
    const store = createInMemorySecretStore({ [SECRET_REF_JIRA]: 'not-valid-json' });
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(store, fetcher);
    const result = await executor({
        connectorType: 'jira',
        actionType: 'read_task',
        payload: { issue_key: 'PROJ-1' },
        attempt: 1,
        secretRefId: SECRET_REF_JIRA,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'upgrade_required');
});

test('executor returns upgrade_required when jira credentials missing base_url', async () => {
    const store = createInMemorySecretStore({
        [SECRET_REF_JIRA]: JSON.stringify({ access_token: 'tok' }), // missing base_url
    });
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(store, fetcher);
    const result = await executor({
        connectorType: 'jira',
        actionType: 'read_task',
        payload: { issue_key: 'PROJ-1' },
        attempt: 1,
        secretRefId: SECRET_REF_JIRA,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'upgrade_required');
});

// ---------------------------------------------------------------------------
// Health probes
// ---------------------------------------------------------------------------

test('health probe: jira returns ok when /myself returns 200', async () => {
    const { fetcher } = makeFetch([{ status: 200, body: { displayName: 'Bot' } }]);
    const probe = createRealConnectorHealthProbe(makeStore(), fetcher);
    const result = await probe({
        connectorType: 'jira',
        metadata: { connectorId: 'jira:t:w', connectorType: 'jira', secretRefId: SECRET_REF_JIRA, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });

    assert.equal(result.outcome, 'ok');
});

test('health probe: jira returns auth_failure when /myself returns 401', async () => {
    const { fetcher } = makeFetch([{ status: 401 }]);
    const probe = createRealConnectorHealthProbe(makeStore(), fetcher);
    const result = await probe({
        connectorType: 'jira',
        metadata: { connectorId: 'jira:t:w', connectorType: 'jira', secretRefId: SECRET_REF_JIRA, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });

    assert.equal(result.outcome, 'auth_failure');
});

test('health probe: jira returns rate_limited when /myself returns 429', async () => {
    const { fetcher } = makeFetch([{ status: 429 }]);
    const probe = createRealConnectorHealthProbe(makeStore(), fetcher);
    const result = await probe({
        connectorType: 'jira',
        metadata: { connectorId: 'jira:t:w', connectorType: 'jira', secretRefId: SECRET_REF_JIRA, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });

    assert.equal(result.outcome, 'rate_limited');
});

test('health probe: jira returns network_timeout when fetch throws', async () => {
    const throwingFetch = async (): Promise<Response> => {
        throw new Error('ECONNREFUSED');
    };
    const probe = createRealConnectorHealthProbe(makeStore(), throwingFetch as typeof fetch);
    const result = await probe({
        connectorType: 'jira',
        metadata: { connectorId: 'jira:t:w', connectorType: 'jira', secretRefId: SECRET_REF_JIRA, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });

    assert.equal(result.outcome, 'network_timeout');
});

test('health probe: teams returns ok when Graph /me returns 200', async () => {
    const { fetcher } = makeFetch([{ status: 200, body: { displayName: 'Bot' } }]);
    const probe = createRealConnectorHealthProbe(makeStore(), fetcher);
    const result = await probe({
        connectorType: 'teams',
        metadata: { connectorId: 'teams:t:w', connectorType: 'teams', secretRefId: SECRET_REF_TEAMS, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });

    assert.equal(result.outcome, 'ok');
});

test('health probe: github returns ok when rate_limit returns 200', async () => {
    const { fetcher } = makeFetch([{ status: 200, body: { rate: { limit: 5000 } } }]);
    const probe = createRealConnectorHealthProbe(makeStore(), fetcher);
    const result = await probe({
        connectorType: 'github',
        metadata: { connectorId: 'github:t:w', connectorType: 'github', secretRefId: SECRET_REF_GITHUB, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });

    assert.equal(result.outcome, 'ok');
});

test('health probe: github classifies 403 with 0 remaining as rate_limited', async () => {
    const { fetcher } = makeFetch([{ status: 403, headers: { 'x-ratelimit-remaining': '0' } }]);
    const probe = createRealConnectorHealthProbe(makeStore(), fetcher);
    const result = await probe({
        connectorType: 'github',
        metadata: { connectorId: 'github:t:w', connectorType: 'github', secretRefId: SECRET_REF_GITHUB, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });

    assert.equal(result.outcome, 'rate_limited');
});

test('health probe: sendgrid email returns ok when profile probe returns 200', async () => {
    const { fetcher } = makeFetch([{ status: 200, body: { username: 'bot' } }]);
    const probe = createRealConnectorHealthProbe(makeStore(), fetcher);
    const result = await probe({
        connectorType: 'email',
        metadata: { connectorId: 'email:t:w', connectorType: 'email', secretRefId: SECRET_REF_EMAIL, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });

    assert.equal(result.outcome, 'ok');
});

test('health probe: falls back to metadata-based probe when secretRefId is null', async () => {
    const { fetcher } = makeFetch([]);
    const probe = createRealConnectorHealthProbe(makeStore(), fetcher);
    const result = await probe({
        connectorType: 'jira',
        metadata: {
            connectorId: 'jira:t:w',
            connectorType: 'jira',
            secretRefId: null,
            status: 'permission_invalid',
            scopeStatus: 'insufficient',
            lastErrorClass: null,
        },
    });

    assert.equal(result.outcome, 'auth_failure');
});

test('health probe: falls back when secret not found in store', async () => {
    const emptyStore = createInMemorySecretStore({});
    const { fetcher } = makeFetch([]);
    const probe = createRealConnectorHealthProbe(emptyStore, fetcher);
    const result = await probe({
        connectorType: 'jira',
        metadata: {
            connectorId: 'jira:t:w',
            connectorType: 'jira',
            secretRefId: 'kv://vault/secrets/missing',
            status: 'connected',
            scopeStatus: 'full',
            lastErrorClass: null,
        },
    });

    // Falls back to metadata probe — connected status returns ok
    assert.equal(result.outcome, 'ok');
});

// ---------------------------------------------------------------------------
// Custom API: action execution
// ---------------------------------------------------------------------------

const SECRET_REF_CUSTOM = 'kv://vault/secrets/custom-connector';
const customApiSecretBearerToken = JSON.stringify({
    base_url: 'https://api.acme.com',
    auth_type: 'bearer_token',
    bearer_token: 'my-bearer-tok',
});
const customApiSecretApiKey = JSON.stringify({
    base_url: 'https://api.acme.com',
    auth_type: 'api_key',
    api_key: 'my-api-key',
    api_key_header: 'X-Custom-Key',
});
const customApiSecretBasicAuth = JSON.stringify({
    base_url: 'https://api.acme.com',
    auth_type: 'basic_auth',
    basic_user: 'user1',
    basic_pass: 'pass1',
});
const customApiSecretNone = JSON.stringify({
    base_url: 'https://api.acme.com',
    auth_type: 'none',
});

const makeCustomStore = (secret: string = customApiSecretBearerToken) =>
    createInMemorySecretStore({ [SECRET_REF_CUSTOM]: secret });

test('custom_api: send_message with bearer_token auth succeeds', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: { ok: true } }]);
    const executor = createRealProviderExecutor(makeCustomStore(), fetcher);

    const result = await executor({
        connectorType: 'custom_api',
        actionType: 'send_message',
        payload: { method: 'POST', path: '/messages', body: { text: 'hello' } },
        attempt: 1,
        secretRefId: SECRET_REF_CUSTOM,
    });

    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('POST'));
    const call = calls[0]!;
    assert.ok(call.url.toString().includes('api.acme.com/messages'));
    assert.equal(call.headers?.['Authorization'], 'Bearer my-bearer-tok');
});

test('custom_api: uses api_key header when auth_type is api_key', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: {} }]);
    const executor = createRealProviderExecutor(makeCustomStore(customApiSecretApiKey), fetcher);

    await executor({
        connectorType: 'custom_api',
        actionType: 'read_task',
        payload: { method: 'GET', path: '/items/1' },
        attempt: 1,
        secretRefId: SECRET_REF_CUSTOM,
    });

    const call = calls[0]!;
    assert.equal(call.headers?.['X-Custom-Key'], 'my-api-key');
    assert.equal(call.headers?.['Authorization'], undefined);
});

test('custom_api: sets Basic auth header when auth_type is basic_auth', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: {} }]);
    const executor = createRealProviderExecutor(makeCustomStore(customApiSecretBasicAuth), fetcher);

    await executor({
        connectorType: 'custom_api',
        actionType: 'send_message',
        payload: { path: '/notify' },
        attempt: 1,
        secretRefId: SECRET_REF_CUSTOM,
    });

    const call = calls[0]!;
    const expectedEncoded = Buffer.from('user1:pass1').toString('base64');
    assert.equal(call.headers?.['Authorization'], `Basic ${expectedEncoded}`);
});

test('custom_api: no auth header when auth_type is none', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: {} }]);
    const executor = createRealProviderExecutor(makeCustomStore(customApiSecretNone), fetcher);

    await executor({
        connectorType: 'custom_api',
        actionType: 'send_message',
        payload: { path: '/ping' },
        attempt: 1,
        secretRefId: SECRET_REF_CUSTOM,
    });

    const call = calls[0]!;
    assert.equal(call.headers?.['Authorization'], undefined);
});

test('custom_api: classifies 401 as permission_denied', async () => {
    const { fetcher } = makeFetch([{ status: 401, body: {} }]);
    const executor = createRealProviderExecutor(makeCustomStore(), fetcher);

    const result = await executor({
        connectorType: 'custom_api',
        actionType: 'send_message',
        payload: { path: '/secure' },
        attempt: 1,
        secretRefId: SECRET_REF_CUSTOM,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'permission_denied');
    assert.equal(result.transient, false);
});

test('custom_api: returns transient error when fetch throws', async () => {
    const throwingFetch = async (): Promise<Response> => { throw new Error('ECONNREFUSED'); };
    const executor = createRealProviderExecutor(makeCustomStore(), throwingFetch as typeof fetch);

    const result = await executor({
        connectorType: 'custom_api',
        actionType: 'send_message',
        payload: { path: '/down' },
        attempt: 1,
        secretRefId: SECRET_REF_CUSTOM,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'timeout');
    assert.equal(result.transient, true);
});

test('custom_api: returns upgrade_required when credentials missing base_url', async () => {
    const badStore = createInMemorySecretStore({
        [SECRET_REF_CUSTOM]: JSON.stringify({ auth_type: 'none' }), // no base_url
    });
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(badStore, fetcher);

    const result = await executor({
        connectorType: 'custom_api',
        actionType: 'send_message',
        payload: {},
        attempt: 1,
        secretRefId: SECRET_REF_CUSTOM,
    });

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'upgrade_required');
});

// ---------------------------------------------------------------------------
// Custom API: health probe
// ---------------------------------------------------------------------------

test('custom_api health probe: returns ok when HEAD / returns 200', async () => {
    const { fetcher } = makeFetch([{ status: 200, body: {} }]);
    const probe = createRealConnectorHealthProbe(makeCustomStore(), fetcher);

    const result = await probe({
        connectorType: 'custom_api',
        metadata: { connectorId: 'custom_api:t:w', connectorType: 'custom_api', secretRefId: SECRET_REF_CUSTOM, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });

    assert.equal(result.outcome, 'ok');
    assert.ok(result.message.includes('200'));
});

test('custom_api health probe: returns auth_failure when HEAD / returns 401', async () => {
    const { fetcher } = makeFetch([{ status: 401, body: {} }, { status: 401, body: {} }]);
    const probe = createRealConnectorHealthProbe(makeCustomStore(), fetcher);

    const result = await probe({
        connectorType: 'custom_api',
        metadata: { connectorId: 'custom_api:t:w', connectorType: 'custom_api', secretRefId: SECRET_REF_CUSTOM, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });

    assert.equal(result.outcome, 'auth_failure');
});

test('custom_api health probe: returns rate_limited when HEAD / returns 429', async () => {
    const { fetcher } = makeFetch([{ status: 429, body: {} }, { status: 429, body: {} }]);
    const probe = createRealConnectorHealthProbe(makeCustomStore(), fetcher);

    const result = await probe({
        connectorType: 'custom_api',
        metadata: { connectorId: 'custom_api:t:w', connectorType: 'custom_api', secretRefId: SECRET_REF_CUSTOM, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });

    assert.equal(result.outcome, 'rate_limited');
});

test('custom_api health probe: returns network_timeout when fetch throws twice', async () => {
    const throwingFetch = async (): Promise<Response> => { throw new Error('ECONNREFUSED'); };
    const probe = createRealConnectorHealthProbe(makeCustomStore(), throwingFetch as typeof fetch);

    const result = await probe({
        connectorType: 'custom_api',
        metadata: { connectorId: 'custom_api:t:w', connectorType: 'custom_api', secretRefId: SECRET_REF_CUSTOM, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });

    assert.equal(result.outcome, 'network_timeout');
});
