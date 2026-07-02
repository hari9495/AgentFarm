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

test('github create_pr opens pull request and returns number in summary', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 201, body: { number: 73, html_url: 'https://github.com/acme/backend/pull/73' } },
    ]);

    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'github',
        actionType: 'create_pr',
        payload: {
            owner: 'acme',
            repo: 'backend',
            title: 'feat: add audit stream',
            head: 'feature/audit-stream',
            base: 'main',
            body: 'Adds audit stream processing.',
        },
        attempt: 1,
        secretRefId: SECRET_REF_GITHUB,
    });

    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('#73'));
    assert.equal(calls[0]!.method, 'POST');
    assert.ok(calls[0]!.url.includes('/repos/acme/backend/pulls'));
});

test('github merge_pr merges pull request and returns success summary', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 200, body: { merged: true, sha: 'abc123' } },
    ]);

    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'github',
        actionType: 'merge_pr',
        payload: {
            owner: 'acme',
            repo: 'backend',
            pull_number: 73,
            merge_method: 'squash',
        },
        attempt: 1,
        secretRefId: SECRET_REF_GITHUB,
    });

    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('merged'));
    assert.equal(calls[0]!.method, 'PUT');
    assert.ok(calls[0]!.url.includes('/repos/acme/backend/pulls/73/merge'));
});

test('github list_prs fetches pull requests and returns count', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 200, body: [{ number: 1 }, { number: 2 }, { number: 3 }] },
    ]);

    const executor = createRealProviderExecutor(makeStore(), fetcher);
    const result = await executor({
        connectorType: 'github',
        actionType: 'list_prs',
        payload: {
            owner: 'acme',
            repo: 'backend',
            state: 'open',
        },
        attempt: 1,
        secretRefId: SECRET_REF_GITHUB,
    });

    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('3 pull request'));
    assert.equal(calls[0]!.method, 'GET');
    assert.ok(calls[0]!.url.includes('/repos/acme/backend/pulls'));
    assert.ok(calls[0]!.url.includes('state=open'));
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

// ===========================================================================
// Task-tracker / code connectors: Asana, Trello, ClickUp, Azure DevOps
// ===========================================================================

const SECRET_REF_ASANA = 'kv://vault/secrets/asana-connector';
const SECRET_REF_TRELLO = 'kv://vault/secrets/trello-connector';
const SECRET_REF_CLICKUP = 'kv://vault/secrets/clickup-connector';
const SECRET_REF_AZDO = 'kv://vault/secrets/azure-devops-connector';

const makeTrackerStore = () =>
    createInMemorySecretStore({
        [SECRET_REF_ASANA]: JSON.stringify({ access_token: 'asana-pat-1' }),
        [SECRET_REF_TRELLO]: JSON.stringify({ api_key: 'trello-key', token: 'trello-token' }),
        [SECRET_REF_CLICKUP]: JSON.stringify({ api_key: 'clickup-pk-1' }),
        [SECRET_REF_AZDO]: JSON.stringify({ access_token: 'azdo-pat-1', organization: 'acme-org' }),
    });

// --- Asana ---

test('asana read_task returns task name and completion state', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: { data: { name: 'Ship release', completed: false } } }]);
    const executor = createRealProviderExecutor(makeTrackerStore(), fetcher);
    const result = await executor({
        connectorType: 'asana',
        actionType: 'read_task',
        payload: { task_gid: '12345' },
        attempt: 1,
        secretRefId: SECRET_REF_ASANA,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('Ship release'));
    assert.ok(result.resultSummary.includes('open'));
    assert.ok(calls[0]!.url.includes('/tasks/12345'));
    assert.equal(calls[0]!.headers!['Authorization'], 'Bearer asana-pat-1');
});

test('asana create_comment posts a story and returns its gid', async () => {
    const { fetcher, calls } = makeFetch([{ status: 201, body: { data: { gid: 'story-9' } } }]);
    const executor = createRealProviderExecutor(makeTrackerStore(), fetcher);
    const result = await executor({
        connectorType: 'asana',
        actionType: 'create_comment',
        payload: { task_gid: '12345', body: 'Looks good' },
        attempt: 1,
        secretRefId: SECRET_REF_ASANA,
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0]!.method, 'POST');
    assert.deepEqual(calls[0]!.body, { data: { text: 'Looks good' } });
    assert.ok(result.resultSummary.includes('story-9'));
});

test('asana update_status marks the task completed', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: { data: { completed: true } } }]);
    const executor = createRealProviderExecutor(makeTrackerStore(), fetcher);
    const result = await executor({
        connectorType: 'asana',
        actionType: 'update_status',
        payload: { task_gid: '12345', completed: true },
        attempt: 1,
        secretRefId: SECRET_REF_ASANA,
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0]!.method, 'PUT');
    assert.deepEqual(calls[0]!.body, { data: { completed: true } });
});

test('asana read_task returns invalid_format when task_gid missing', async () => {
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(makeTrackerStore(), fetcher);
    const result = await executor({
        connectorType: 'asana',
        actionType: 'read_task',
        payload: {},
        attempt: 1,
        secretRefId: SECRET_REF_ASANA,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
});

// --- Trello ---

test('trello read_task returns card name and list', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: { name: 'Design spec', idList: 'list-1' } }]);
    const executor = createRealProviderExecutor(makeTrackerStore(), fetcher);
    const result = await executor({
        connectorType: 'trello',
        actionType: 'read_task',
        payload: { card_id: 'card-7' },
        attempt: 1,
        secretRefId: SECRET_REF_TRELLO,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('Design spec'));
    assert.ok(calls[0]!.url.includes('/cards/card-7'));
    assert.ok(calls[0]!.url.includes('key=trello-key'));
    assert.ok(calls[0]!.url.includes('token=trello-token'));
});

test('trello create_comment posts comment via query param', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: { id: 'comment-3' } }]);
    const executor = createRealProviderExecutor(makeTrackerStore(), fetcher);
    const result = await executor({
        connectorType: 'trello',
        actionType: 'create_comment',
        payload: { card_id: 'card-7', body: 'Nice work' },
        attempt: 1,
        secretRefId: SECRET_REF_TRELLO,
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0]!.method, 'POST');
    assert.ok(calls[0]!.url.includes('text=Nice%20work'));
    assert.ok(result.resultSummary.includes('comment-3'));
});

test('trello update_status moves card to target list', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: { id: 'card-7', idList: 'list-2' } }]);
    const executor = createRealProviderExecutor(makeTrackerStore(), fetcher);
    const result = await executor({
        connectorType: 'trello',
        actionType: 'update_status',
        payload: { card_id: 'card-7', list_id: 'list-2' },
        attempt: 1,
        secretRefId: SECRET_REF_TRELLO,
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0]!.method, 'PUT');
    assert.ok(calls[0]!.url.includes('idList=list-2'));
});

test('trello update_status returns invalid_format when list_id missing', async () => {
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(makeTrackerStore(), fetcher);
    const result = await executor({
        connectorType: 'trello',
        actionType: 'update_status',
        payload: { card_id: 'card-7' },
        attempt: 1,
        secretRefId: SECRET_REF_TRELLO,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
});

// --- ClickUp ---

test('clickup read_task returns task name and status', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: { name: 'API work', status: { status: 'in progress' } } }]);
    const executor = createRealProviderExecutor(makeTrackerStore(), fetcher);
    const result = await executor({
        connectorType: 'clickup',
        actionType: 'read_task',
        payload: { task_id: 'abc123' },
        attempt: 1,
        secretRefId: SECRET_REF_CLICKUP,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('API work'));
    assert.ok(result.resultSummary.includes('in progress'));
    assert.equal(calls[0]!.headers!['Authorization'], 'clickup-pk-1');
    assert.ok(calls[0]!.url.includes('/task/abc123'));
});

test('clickup update_status sets the status field', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: { id: 'abc123' } }]);
    const executor = createRealProviderExecutor(makeTrackerStore(), fetcher);
    const result = await executor({
        connectorType: 'clickup',
        actionType: 'update_status',
        payload: { task_id: 'abc123', status: 'done' },
        attempt: 1,
        secretRefId: SECRET_REF_CLICKUP,
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0]!.method, 'PUT');
    assert.deepEqual(calls[0]!.body, { status: 'done' });
});

test('clickup read_task classifies 401 as permission_denied', async () => {
    const { fetcher } = makeFetch([{ status: 401 }]);
    const executor = createRealProviderExecutor(makeTrackerStore(), fetcher);
    const result = await executor({
        connectorType: 'clickup',
        actionType: 'read_task',
        payload: { task_id: 'abc123' },
        attempt: 1,
        secretRefId: SECRET_REF_CLICKUP,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'permission_denied');
});

// --- Azure DevOps ---

test('azure_devops read_task returns work item title and state', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 200, body: { fields: { 'System.Title': 'Login bug', 'System.State': 'Active' } } },
    ]);
    const executor = createRealProviderExecutor(makeTrackerStore(), fetcher);
    const result = await executor({
        connectorType: 'azure_devops',
        actionType: 'read_task',
        payload: { project: 'web', work_item_id: '42' },
        attempt: 1,
        secretRefId: SECRET_REF_AZDO,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('Login bug'));
    assert.ok(result.resultSummary.includes('Active'));
    assert.ok(calls[0]!.url.includes('/acme-org/'));
    assert.ok(calls[0]!.url.includes('/web/_apis/wit/workitems/42'));
    assert.ok(calls[0]!.headers!['Authorization'].startsWith('Basic '));
});

test('azure_devops update_status PATCHes System.State via json-patch', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: { id: 42 } }]);
    const executor = createRealProviderExecutor(makeTrackerStore(), fetcher);
    const result = await executor({
        connectorType: 'azure_devops',
        actionType: 'update_status',
        payload: { project: 'web', work_item_id: '42', state: 'Resolved' },
        attempt: 1,
        secretRefId: SECRET_REF_AZDO,
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0]!.method, 'PATCH');
    assert.equal(calls[0]!.headers!['Content-Type'], 'application/json-patch+json');
    assert.deepEqual(calls[0]!.body, [{ op: 'add', path: '/fields/System.State', value: 'Resolved' }]);
});

test('azure_devops returns invalid_format when project missing', async () => {
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(makeTrackerStore(), fetcher);
    const result = await executor({
        connectorType: 'azure_devops',
        actionType: 'read_task',
        payload: { work_item_id: '42' },
        attempt: 1,
        secretRefId: SECRET_REF_AZDO,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
});

// --- credential validation + health probes ---

test('executor returns upgrade_required when azure_devops organization missing', async () => {
    const store = createInMemorySecretStore({ [SECRET_REF_AZDO]: JSON.stringify({ access_token: 'x' }) });
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(store, fetcher);
    const result = await executor({
        connectorType: 'azure_devops',
        actionType: 'read_task',
        payload: { project: 'web', work_item_id: '42' },
        attempt: 1,
        secretRefId: SECRET_REF_AZDO,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'upgrade_required');
});

test('health probe: asana returns ok when /users/me returns 200', async () => {
    const { fetcher } = makeFetch([{ status: 200 }]);
    const probe = createRealConnectorHealthProbe(makeTrackerStore(), fetcher);
    const result = await probe({
        connectorType: 'asana',
        metadata: { connectorId: 'asana:t:w', connectorType: 'asana', secretRefId: SECRET_REF_ASANA, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });
    assert.equal(result.outcome, 'ok');
});

test('health probe: clickup returns auth_failure on 401', async () => {
    const { fetcher } = makeFetch([{ status: 401 }]);
    const probe = createRealConnectorHealthProbe(makeTrackerStore(), fetcher);
    const result = await probe({
        connectorType: 'clickup',
        metadata: { connectorId: 'clickup:t:w', connectorType: 'clickup', secretRefId: SECRET_REF_CLICKUP, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });
    assert.equal(result.outcome, 'auth_failure');
});

// ---------------------------------------------------------------------------
// Gmail / Outlook native mailbox connectors
// ---------------------------------------------------------------------------

const SECRET_REF_GMAIL = 'kv://vault/secrets/gmail-connector';
const SECRET_REF_OUTLOOK = 'kv://vault/secrets/outlook-connector';

const makeMailboxStore = () =>
    createInMemorySecretStore({
        [SECRET_REF_GMAIL]: JSON.stringify({ access_token: 'gmail-oauth-1' }),
        [SECRET_REF_OUTLOOK]: JSON.stringify({ access_token: 'outlook-graph-1' }),
    });

// --- Gmail ---

test('gmail send_email posts base64url raw RFC822 message and returns message id', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: { id: 'msg-abc123' } }]);
    const executor = createRealProviderExecutor(makeMailboxStore(), fetcher);
    const result = await executor({
        connectorType: 'gmail',
        actionType: 'send_email',
        payload: { to: 'alice@example.com', subject: 'Hello', body: 'Hi Alice' },
        attempt: 1,
        secretRefId: SECRET_REF_GMAIL,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('msg-abc123'));
    assert.equal(calls[0]!.method, 'POST');
    assert.ok(calls[0]!.url.includes('/gmail/v1/users/me/messages/send'));
    assert.equal(calls[0]!.headers!['Authorization'], 'Bearer gmail-oauth-1');
    const raw = (calls[0]!.body as { raw: string }).raw;
    // base64url — no +, /, or = padding
    assert.ok(/^[A-Za-z0-9_-]+$/.test(raw));
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    assert.ok(decoded.includes('To: alice@example.com'));
    assert.ok(decoded.includes('Subject: Hello'));
    assert.ok(decoded.includes('Hi Alice'));
});

test('gmail send_email returns invalid_format when to/subject/body missing', async () => {
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(makeMailboxStore(), fetcher);
    const result = await executor({
        connectorType: 'gmail',
        actionType: 'send_email',
        payload: { subject: 'no recipient' },
        attempt: 1,
        secretRefId: SECRET_REF_GMAIL,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
});

test('gmail list_emails passes query and returns message count', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 200, body: { messages: [{ id: 'm1' }, { id: 'm2' }], resultSizeEstimate: 2 } },
    ]);
    const executor = createRealProviderExecutor(makeMailboxStore(), fetcher);
    const result = await executor({
        connectorType: 'gmail',
        actionType: 'list_emails',
        payload: { query: 'is:unread', max_results: 10 },
        attempt: 1,
        secretRefId: SECRET_REF_GMAIL,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('2'));
    assert.ok(result.resultSummary.includes('m1'));
    assert.ok(calls[0]!.url.includes('q=is%3Aunread'));
    assert.ok(calls[0]!.url.includes('maxResults=10'));
});

test('gmail read_email returns subject, from, and snippet', async () => {
    const { fetcher, calls } = makeFetch([
        {
            status: 200,
            body: {
                id: 'm1',
                snippet: 'Quarterly numbers attached',
                payload: {
                    headers: [
                        { name: 'Subject', value: 'Q2 Report' },
                        { name: 'From', value: 'bob@example.com' },
                    ],
                },
            },
        },
    ]);
    const executor = createRealProviderExecutor(makeMailboxStore(), fetcher);
    const result = await executor({
        connectorType: 'gmail',
        actionType: 'read_email',
        payload: { message_id: 'm1' },
        attempt: 1,
        secretRefId: SECRET_REF_GMAIL,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('Q2 Report'));
    assert.ok(result.resultSummary.includes('bob@example.com'));
    assert.ok(result.resultSummary.includes('Quarterly numbers attached'));
    assert.ok(calls[0]!.url.includes('/messages/m1'));
});

test('gmail reply_email fetches original metadata then sends threaded reply', async () => {
    const { fetcher, calls } = makeFetch([
        {
            status: 200,
            body: {
                id: 'm1',
                threadId: 'thread-9',
                payload: {
                    headers: [
                        { name: 'Subject', value: 'Q2 Report' },
                        { name: 'From', value: 'bob@example.com' },
                        { name: 'Message-ID', value: '<orig-msg-id@example.com>' },
                    ],
                },
            },
        },
        { status: 200, body: { id: 'msg-reply-1' } },
    ]);
    const executor = createRealProviderExecutor(makeMailboxStore(), fetcher);
    const result = await executor({
        connectorType: 'gmail',
        actionType: 'reply_email',
        payload: { message_id: 'm1', body: 'Thanks, received.' },
        attempt: 1,
        secretRefId: SECRET_REF_GMAIL,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('msg-reply-1'));
    assert.equal(calls[1]!.method, 'POST');
    const sendBody = calls[1]!.body as { raw: string; threadId: string };
    assert.equal(sendBody.threadId, 'thread-9');
    const decoded = Buffer.from(sendBody.raw, 'base64url').toString('utf8');
    assert.ok(decoded.includes('To: bob@example.com'));
    assert.ok(decoded.includes('Subject: Re: Q2 Report'));
    assert.ok(decoded.includes('In-Reply-To: <orig-msg-id@example.com>'));
    assert.ok(decoded.includes('Thanks, received.'));
});

test('gmail read_thread returns message count and first subject', async () => {
    const { fetcher, calls } = makeFetch([
        {
            status: 200,
            body: {
                id: 'thread-9',
                messages: [
                    { id: 'm1', payload: { headers: [{ name: 'Subject', value: 'Q2 Report' }] } },
                    { id: 'm2', payload: { headers: [] } },
                ],
            },
        },
    ]);
    const executor = createRealProviderExecutor(makeMailboxStore(), fetcher);
    const result = await executor({
        connectorType: 'gmail',
        actionType: 'read_thread',
        payload: { thread_id: 'thread-9' },
        attempt: 1,
        secretRefId: SECRET_REF_GMAIL,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('2 message'));
    assert.ok(result.resultSummary.includes('Q2 Report'));
    assert.ok(calls[0]!.url.includes('/threads/thread-9'));
});

test('gmail send_email classifies 401 as permission_denied', async () => {
    const { fetcher } = makeFetch([{ status: 401 }]);
    const executor = createRealProviderExecutor(makeMailboxStore(), fetcher);
    const result = await executor({
        connectorType: 'gmail',
        actionType: 'send_email',
        payload: { to: 'a@b.c', subject: 's', body: 'b' },
        attempt: 1,
        secretRefId: SECRET_REF_GMAIL,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'permission_denied');
});

test('executor returns upgrade_required when gmail access_token missing', async () => {
    const store = createInMemorySecretStore({ [SECRET_REF_GMAIL]: JSON.stringify({}) });
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(store, fetcher);
    const result = await executor({
        connectorType: 'gmail',
        actionType: 'send_email',
        payload: { to: 'a@b.c', subject: 's', body: 'b' },
        attempt: 1,
        secretRefId: SECRET_REF_GMAIL,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'upgrade_required');
});

// --- Outlook (Microsoft Graph) ---

test('outlook send_email posts Graph sendMail payload and succeeds on 202', async () => {
    const { fetcher, calls } = makeFetch([{ status: 202 }]);
    const executor = createRealProviderExecutor(makeMailboxStore(), fetcher);
    const result = await executor({
        connectorType: 'outlook',
        actionType: 'send_email',
        payload: { to: ['alice@example.com'], subject: 'Hello', body: 'Hi Alice' },
        attempt: 1,
        secretRefId: SECRET_REF_OUTLOOK,
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0]!.method, 'POST');
    assert.ok(calls[0]!.url.includes('graph.microsoft.com/v1.0/me/sendMail'));
    assert.equal(calls[0]!.headers!['Authorization'], 'Bearer outlook-graph-1');
    const body = calls[0]!.body as {
        message: { subject: string; body: { content: string }; toRecipients: Array<{ emailAddress: { address: string } }> };
    };
    assert.equal(body.message.subject, 'Hello');
    assert.equal(body.message.toRecipients[0]!.emailAddress.address, 'alice@example.com');
});

test('outlook send_email returns invalid_format when recipient missing', async () => {
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(makeMailboxStore(), fetcher);
    const result = await executor({
        connectorType: 'outlook',
        actionType: 'send_email',
        payload: { subject: 'no recipient', body: 'x' },
        attempt: 1,
        secretRefId: SECRET_REF_OUTLOOK,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
});

test('outlook list_emails returns subjects of recent messages', async () => {
    const { fetcher, calls } = makeFetch([
        {
            status: 200,
            body: {
                value: [
                    { id: 'o1', subject: 'Standup notes', from: { emailAddress: { address: 'pm@example.com' } } },
                    { id: 'o2', subject: 'Invoice', from: { emailAddress: { address: 'fin@example.com' } } },
                ],
            },
        },
    ]);
    const executor = createRealProviderExecutor(makeMailboxStore(), fetcher);
    const result = await executor({
        connectorType: 'outlook',
        actionType: 'list_emails',
        payload: { max_results: 5 },
        attempt: 1,
        secretRefId: SECRET_REF_OUTLOOK,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('Standup notes'));
    assert.ok(result.resultSummary.includes('Invoice'));
    assert.ok(calls[0]!.url.includes('$top=5'));
});

test('outlook read_email returns subject, from, and preview', async () => {
    const { fetcher, calls } = makeFetch([
        {
            status: 200,
            body: {
                id: 'o1',
                subject: 'Standup notes',
                from: { emailAddress: { address: 'pm@example.com' } },
                bodyPreview: 'Yesterday we shipped...',
            },
        },
    ]);
    const executor = createRealProviderExecutor(makeMailboxStore(), fetcher);
    const result = await executor({
        connectorType: 'outlook',
        actionType: 'read_email',
        payload: { message_id: 'o1' },
        attempt: 1,
        secretRefId: SECRET_REF_OUTLOOK,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('Standup notes'));
    assert.ok(result.resultSummary.includes('pm@example.com'));
    assert.ok(result.resultSummary.includes('Yesterday we shipped'));
    assert.ok(calls[0]!.url.includes('/messages/o1'));
});

test('outlook reply_email posts reply comment to the message', async () => {
    const { fetcher, calls } = makeFetch([{ status: 202 }]);
    const executor = createRealProviderExecutor(makeMailboxStore(), fetcher);
    const result = await executor({
        connectorType: 'outlook',
        actionType: 'reply_email',
        payload: { message_id: 'o1', body: 'Thanks, received.' },
        attempt: 1,
        secretRefId: SECRET_REF_OUTLOOK,
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0]!.method, 'POST');
    assert.ok(calls[0]!.url.includes('/messages/o1/reply'));
    assert.deepEqual(calls[0]!.body, { comment: 'Thanks, received.' });
});

test('outlook read_thread lists messages in a conversation', async () => {
    const { fetcher, calls } = makeFetch([
        {
            status: 200,
            body: {
                value: [
                    { id: 'o1', subject: 'Standup notes' },
                    { id: 'o2', subject: 'RE: Standup notes' },
                ],
            },
        },
    ]);
    const executor = createRealProviderExecutor(makeMailboxStore(), fetcher);
    const result = await executor({
        connectorType: 'outlook',
        actionType: 'read_thread',
        payload: { conversation_id: 'conv-1' },
        attempt: 1,
        secretRefId: SECRET_REF_OUTLOOK,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('2 message'));
    assert.ok(calls[0]!.url.includes('conversationId'));
    assert.ok(calls[0]!.url.includes('conv-1'));
});

test('outlook send_email classifies 429 as rate_limit transient', async () => {
    const { fetcher } = makeFetch([{ status: 429 }]);
    const executor = createRealProviderExecutor(makeMailboxStore(), fetcher);
    const result = await executor({
        connectorType: 'outlook',
        actionType: 'send_email',
        payload: { to: 'a@b.c', subject: 's', body: 'b' },
        attempt: 1,
        secretRefId: SECRET_REF_OUTLOOK,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'rate_limit');
    assert.equal(result.transient, true);
});

// --- Mailbox health probes ---

test('health probe: gmail returns ok when profile endpoint returns 200', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: { emailAddress: 'agent@tenant.com' } }]);
    const probe = createRealConnectorHealthProbe(makeMailboxStore(), fetcher);
    const result = await probe({
        connectorType: 'gmail',
        metadata: { connectorId: 'gmail:t:w', connectorType: 'gmail', secretRefId: SECRET_REF_GMAIL, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });
    assert.equal(result.outcome, 'ok');
    assert.ok(calls[0]!.url.includes('/gmail/v1/users/me/profile'));
});

test('health probe: outlook returns auth_failure when Graph /me returns 401', async () => {
    const { fetcher, calls } = makeFetch([{ status: 401 }]);
    const probe = createRealConnectorHealthProbe(makeMailboxStore(), fetcher);
    const result = await probe({
        connectorType: 'outlook',
        metadata: { connectorId: 'outlook:t:w', connectorType: 'outlook', secretRefId: SECRET_REF_OUTLOOK, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });
    assert.equal(result.outcome, 'auth_failure');
    assert.ok(calls[0]!.url.includes('graph.microsoft.com/v1.0/me'));
});

// ---------------------------------------------------------------------------
// HubSpot / Salesforce native CRM connectors
// ---------------------------------------------------------------------------

const SECRET_REF_HUBSPOT = 'kv://vault/secrets/hubspot-connector';
const SECRET_REF_SALESFORCE = 'kv://vault/secrets/salesforce-connector';

const makeCrmStore = () =>
    createInMemorySecretStore({
        [SECRET_REF_HUBSPOT]: JSON.stringify({ access_token: 'pat-hub-1' }),
        [SECRET_REF_SALESFORCE]: JSON.stringify({
            access_token: 'sf-token-1',
            instance_url: 'https://acme.my.salesforce.com',
        }),
    });

// --- HubSpot ---

test('hubspot get_record fetches a CRM object and summarizes its properties', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 200, body: { id: '501', properties: { firstname: 'Ada', lastname: 'Lovelace', email: 'ada@example.com' } } },
    ]);
    const executor = createRealProviderExecutor(makeCrmStore(), fetcher);
    const result = await executor({
        connectorType: 'hubspot',
        actionType: 'get_record',
        payload: { record_type: 'contacts', record_id: '501' },
        attempt: 1,
        secretRefId: SECRET_REF_HUBSPOT,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('501'));
    assert.ok(result.resultSummary.includes('ada@example.com'));
    assert.ok(calls[0]!.url.includes('/crm/v3/objects/contacts/501'));
    assert.equal(calls[0]!.headers!['Authorization'], 'Bearer pat-hub-1');
});

test('hubspot search_records posts a search query and returns total + ids', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 200, body: { total: 2, results: [{ id: '501' }, { id: '502' }] } },
    ]);
    const executor = createRealProviderExecutor(makeCrmStore(), fetcher);
    const result = await executor({
        connectorType: 'hubspot',
        actionType: 'search_records',
        payload: { record_type: 'deals', query: 'acme renewal', limit: 5 },
        attempt: 1,
        secretRefId: SECRET_REF_HUBSPOT,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('2'));
    assert.ok(result.resultSummary.includes('501'));
    assert.equal(calls[0]!.method, 'POST');
    assert.ok(calls[0]!.url.includes('/crm/v3/objects/deals/search'));
    const body = calls[0]!.body as { query: string; limit: number };
    assert.equal(body.query, 'acme renewal');
    assert.equal(body.limit, 5);
});

test('hubspot create_record posts properties and returns the new id', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 201, body: { id: '777', properties: { dealname: 'Acme renewal' } } },
    ]);
    const executor = createRealProviderExecutor(makeCrmStore(), fetcher);
    const result = await executor({
        connectorType: 'hubspot',
        actionType: 'create_record',
        payload: { record_type: 'deals', properties: { dealname: 'Acme renewal', amount: '4200' } },
        attempt: 1,
        secretRefId: SECRET_REF_HUBSPOT,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('777'));
    assert.deepEqual(calls[0]!.body, { properties: { dealname: 'Acme renewal', amount: '4200' } });
});

test('hubspot update_record patches properties on an existing object', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 200, body: { id: '777', properties: { dealstage: 'closedwon' } } },
    ]);
    const executor = createRealProviderExecutor(makeCrmStore(), fetcher);
    const result = await executor({
        connectorType: 'hubspot',
        actionType: 'update_record',
        payload: { record_type: 'deals', record_id: '777', properties: { dealstage: 'closedwon' } },
        attempt: 1,
        secretRefId: SECRET_REF_HUBSPOT,
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0]!.method, 'PATCH');
    assert.ok(calls[0]!.url.includes('/crm/v3/objects/deals/777'));
});

test('hubspot log_activity creates a note associated with the record', async () => {
    const { fetcher, calls } = makeFetch([{ status: 201, body: { id: 'note-9' } }]);
    const executor = createRealProviderExecutor(makeCrmStore(), fetcher);
    const result = await executor({
        connectorType: 'hubspot',
        actionType: 'log_activity',
        payload: { record_type: 'contacts', record_id: '501', body: 'Called Ada, follow up Friday.' },
        attempt: 1,
        secretRefId: SECRET_REF_HUBSPOT,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('note-9'));
    assert.ok(calls[0]!.url.includes('/crm/v3/objects/notes'));
    const body = calls[0]!.body as {
        properties: { hs_note_body: string };
        associations: Array<{ to: { id: string } }>;
    };
    assert.equal(body.properties.hs_note_body, 'Called Ada, follow up Friday.');
    assert.equal(body.associations[0]!.to.id, '501');
});

test('hubspot get_record returns invalid_format when record_type or record_id missing', async () => {
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(makeCrmStore(), fetcher);
    const result = await executor({
        connectorType: 'hubspot',
        actionType: 'get_record',
        payload: { record_type: 'contacts' },
        attempt: 1,
        secretRefId: SECRET_REF_HUBSPOT,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
});

test('hubspot search_records classifies 401 as permission_denied', async () => {
    const { fetcher } = makeFetch([{ status: 401 }]);
    const executor = createRealProviderExecutor(makeCrmStore(), fetcher);
    const result = await executor({
        connectorType: 'hubspot',
        actionType: 'search_records',
        payload: { record_type: 'contacts', query: 'x' },
        attempt: 1,
        secretRefId: SECRET_REF_HUBSPOT,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'permission_denied');
});

// --- Salesforce ---

test('salesforce get_record fetches an sobject from the instance url', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 200, body: { Id: '003xx', Name: 'Ada Lovelace', Email: 'ada@example.com' } },
    ]);
    const executor = createRealProviderExecutor(makeCrmStore(), fetcher);
    const result = await executor({
        connectorType: 'salesforce',
        actionType: 'get_record',
        payload: { record_type: 'Contact', record_id: '003xx' },
        attempt: 1,
        secretRefId: SECRET_REF_SALESFORCE,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('Ada Lovelace'));
    assert.ok(calls[0]!.url.startsWith('https://acme.my.salesforce.com/services/data/'));
    assert.ok(calls[0]!.url.includes('/sobjects/Contact/003xx'));
    assert.equal(calls[0]!.headers!['Authorization'], 'Bearer sf-token-1');
});

test('salesforce search_records runs SOQL and escapes quotes in the query term', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 200, body: { totalSize: 1, records: [{ Id: '006xx', Name: "O'Brien deal" }] } },
    ]);
    const executor = createRealProviderExecutor(makeCrmStore(), fetcher);
    const result = await executor({
        connectorType: 'salesforce',
        actionType: 'search_records',
        payload: { record_type: 'Opportunity', query: "O'Brien", limit: 10 },
        attempt: 1,
        secretRefId: SECRET_REF_SALESFORCE,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('1'));
    assert.ok(result.resultSummary.includes('006xx'));
    const url = decodeURIComponent(calls[0]!.url);
    assert.ok(url.includes("O\\'Brien"), `SOQL term must be escaped, got: ${url}`);
});

test('salesforce search_records accepts a raw soql payload', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 200, body: { totalSize: 3, records: [{ Id: 'a' }, { Id: 'b' }, { Id: 'c' }] } },
    ]);
    const executor = createRealProviderExecutor(makeCrmStore(), fetcher);
    const result = await executor({
        connectorType: 'salesforce',
        actionType: 'search_records',
        payload: { soql: "SELECT Id FROM Lead WHERE Status = 'Open' LIMIT 3" },
        attempt: 1,
        secretRefId: SECRET_REF_SALESFORCE,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('3'));
    assert.ok(decodeURIComponent(calls[0]!.url).includes('SELECT Id FROM Lead'));
});

test('salesforce create_record posts fields to the sobject endpoint', async () => {
    const { fetcher, calls } = makeFetch([{ status: 201, body: { id: '00Qxx', success: true } }]);
    const executor = createRealProviderExecutor(makeCrmStore(), fetcher);
    const result = await executor({
        connectorType: 'salesforce',
        actionType: 'create_record',
        payload: { record_type: 'Lead', fields: { LastName: 'Lovelace', Company: 'Analytical Engines' } },
        attempt: 1,
        secretRefId: SECRET_REF_SALESFORCE,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('00Qxx'));
    assert.equal(calls[0]!.method, 'POST');
    assert.deepEqual(calls[0]!.body, { LastName: 'Lovelace', Company: 'Analytical Engines' });
});

test('salesforce update_record PATCHes fields and succeeds on 204 no-content', async () => {
    const { fetcher, calls } = makeFetch([{ status: 204 }]);
    const executor = createRealProviderExecutor(makeCrmStore(), fetcher);
    const result = await executor({
        connectorType: 'salesforce',
        actionType: 'update_record',
        payload: { record_type: 'Opportunity', record_id: '006xx', fields: { StageName: 'Closed Won' } },
        attempt: 1,
        secretRefId: SECRET_REF_SALESFORCE,
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0]!.method, 'PATCH');
    assert.ok(calls[0]!.url.includes('/sobjects/Opportunity/006xx'));
});

test('salesforce log_activity creates a Task linked to the record', async () => {
    const { fetcher, calls } = makeFetch([{ status: 201, body: { id: '00Txx', success: true } }]);
    const executor = createRealProviderExecutor(makeCrmStore(), fetcher);
    const result = await executor({
        connectorType: 'salesforce',
        actionType: 'log_activity',
        payload: { record_id: '006xx', body: 'Demo delivered, sending proposal.' },
        attempt: 1,
        secretRefId: SECRET_REF_SALESFORCE,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('00Txx'));
    assert.ok(calls[0]!.url.includes('/sobjects/Task'));
    const body = calls[0]!.body as { Description: string; WhatId: string };
    assert.equal(body.Description, 'Demo delivered, sending proposal.');
    assert.equal(body.WhatId, '006xx');
});

test('salesforce create_record classifies 429 as rate_limit transient', async () => {
    const { fetcher } = makeFetch([{ status: 429 }]);
    const executor = createRealProviderExecutor(makeCrmStore(), fetcher);
    const result = await executor({
        connectorType: 'salesforce',
        actionType: 'create_record',
        payload: { record_type: 'Lead', fields: { LastName: 'X' } },
        attempt: 1,
        secretRefId: SECRET_REF_SALESFORCE,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'rate_limit');
    assert.equal(result.transient, true);
});

test('executor returns upgrade_required when salesforce instance_url missing', async () => {
    const store = createInMemorySecretStore({ [SECRET_REF_SALESFORCE]: JSON.stringify({ access_token: 'x' }) });
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(store, fetcher);
    const result = await executor({
        connectorType: 'salesforce',
        actionType: 'get_record',
        payload: { record_type: 'Contact', record_id: '003xx' },
        attempt: 1,
        secretRefId: SECRET_REF_SALESFORCE,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'upgrade_required');
});

// --- CRM health probes ---

test('health probe: hubspot returns ok when account-info returns 200', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: { portalId: 1 } }]);
    const probe = createRealConnectorHealthProbe(makeCrmStore(), fetcher);
    const result = await probe({
        connectorType: 'hubspot',
        metadata: { connectorId: 'hubspot:t:w', connectorType: 'hubspot', secretRefId: SECRET_REF_HUBSPOT, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });
    assert.equal(result.outcome, 'ok');
    assert.ok(calls[0]!.url.includes('account-info'));
});

test('health probe: salesforce returns auth_failure when limits endpoint returns 401', async () => {
    const { fetcher, calls } = makeFetch([{ status: 401 }]);
    const probe = createRealConnectorHealthProbe(makeCrmStore(), fetcher);
    const result = await probe({
        connectorType: 'salesforce',
        metadata: { connectorId: 'salesforce:t:w', connectorType: 'salesforce', secretRefId: SECRET_REF_SALESFORCE, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });
    assert.equal(result.outcome, 'auth_failure');
    assert.ok(calls[0]!.url.startsWith('https://acme.my.salesforce.com/'));
});

// ---------------------------------------------------------------------------
// Greenhouse (ATS) / WordPress (CMS) native connectors
// ---------------------------------------------------------------------------

const SECRET_REF_GREENHOUSE = 'kv://vault/secrets/greenhouse-connector';
const SECRET_REF_WORDPRESS = 'kv://vault/secrets/wordpress-connector';

const makeAtsCmsStore = () =>
    createInMemorySecretStore({
        [SECRET_REF_GREENHOUSE]: JSON.stringify({ api_key: 'gh-harvest-key', on_behalf_of: '4001' }),
        [SECRET_REF_WORDPRESS]: JSON.stringify({
            base_url: 'https://blog.acme.com',
            username: 'agent',
            app_password: 'abcd efgh ijkl',
        }),
    });

// --- Greenhouse ---

test('greenhouse get_record fetches a candidate with Basic api-key auth', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 200, body: { id: 9001, first_name: 'Ada', last_name: 'Lovelace', title: 'Engineer' } },
    ]);
    const executor = createRealProviderExecutor(makeAtsCmsStore(), fetcher);
    const result = await executor({
        connectorType: 'greenhouse',
        actionType: 'get_record',
        payload: { record_type: 'candidates', record_id: '9001' },
        attempt: 1,
        secretRefId: SECRET_REF_GREENHOUSE,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('Ada'));
    assert.ok(calls[0]!.url.includes('harvest.greenhouse.io/v1/candidates/9001'));
    const expectedBasic = `Basic ${Buffer.from('gh-harvest-key:').toString('base64')}`;
    assert.equal(calls[0]!.headers!['Authorization'], expectedBasic);
});

test('greenhouse search_records lists candidates by email query', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 200, body: [{ id: 9001, first_name: 'Ada', last_name: 'Lovelace' }] },
    ]);
    const executor = createRealProviderExecutor(makeAtsCmsStore(), fetcher);
    const result = await executor({
        connectorType: 'greenhouse',
        actionType: 'search_records',
        payload: { record_type: 'candidates', query: 'ada@example.com', limit: 5 },
        attempt: 1,
        secretRefId: SECRET_REF_GREENHOUSE,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('9001'));
    assert.ok(calls[0]!.url.includes('email=ada%40example.com'));
    assert.ok(calls[0]!.url.includes('per_page=5'));
});

test('greenhouse create_record posts a candidate with On-Behalf-Of header', async () => {
    const { fetcher, calls } = makeFetch([{ status: 201, body: { id: 9002 } }]);
    const executor = createRealProviderExecutor(makeAtsCmsStore(), fetcher);
    const result = await executor({
        connectorType: 'greenhouse',
        actionType: 'create_record',
        payload: {
            record_type: 'candidates',
            fields: { first_name: 'Grace', last_name: 'Hopper', applications: [{ job_id: 77 }] },
        },
        attempt: 1,
        secretRefId: SECRET_REF_GREENHOUSE,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('9002'));
    assert.equal(calls[0]!.method, 'POST');
    assert.equal(calls[0]!.headers!['On-Behalf-Of'], '4001');
    assert.deepEqual(calls[0]!.body, { first_name: 'Grace', last_name: 'Hopper', applications: [{ job_id: 77 }] });
});

test('greenhouse create_record fails invalid_format when on_behalf_of missing for writes', async () => {
    const store = createInMemorySecretStore({ [SECRET_REF_GREENHOUSE]: JSON.stringify({ api_key: 'k' }) });
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(store, fetcher);
    const result = await executor({
        connectorType: 'greenhouse',
        actionType: 'create_record',
        payload: { record_type: 'candidates', fields: { first_name: 'X' } },
        attempt: 1,
        secretRefId: SECRET_REF_GREENHOUSE,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
});

test('greenhouse update_record on applications moves the candidate stage', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: { id: 555, status: 'active' } }]);
    const executor = createRealProviderExecutor(makeAtsCmsStore(), fetcher);
    const result = await executor({
        connectorType: 'greenhouse',
        actionType: 'update_record',
        payload: {
            record_type: 'applications',
            record_id: '555',
            fields: { from_stage_id: 10, to_stage_id: 11 },
        },
        attempt: 1,
        secretRefId: SECRET_REF_GREENHOUSE,
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0]!.method, 'POST');
    assert.ok(calls[0]!.url.includes('/v1/applications/555/move'));
    assert.deepEqual(calls[0]!.body, { from_stage_id: 10, to_stage_id: 11 });
});

test('greenhouse log_activity posts a note on the candidate activity feed', async () => {
    const { fetcher, calls } = makeFetch([{ status: 201, body: { id: 321, body: 'Phone screen done.' } }]);
    const executor = createRealProviderExecutor(makeAtsCmsStore(), fetcher);
    const result = await executor({
        connectorType: 'greenhouse',
        actionType: 'log_activity',
        payload: { record_id: '9001', body: 'Phone screen done.' },
        attempt: 1,
        secretRefId: SECRET_REF_GREENHOUSE,
    });
    assert.equal(result.ok, true);
    assert.ok(calls[0]!.url.includes('/v1/candidates/9001/activity_feed/notes'));
    const body = calls[0]!.body as { body: string; user_id: string; visibility: string };
    assert.equal(body.body, 'Phone screen done.');
    assert.equal(body.user_id, '4001');
});

test('greenhouse get_record classifies 401 as permission_denied', async () => {
    const { fetcher } = makeFetch([{ status: 401 }]);
    const executor = createRealProviderExecutor(makeAtsCmsStore(), fetcher);
    const result = await executor({
        connectorType: 'greenhouse',
        actionType: 'get_record',
        payload: { record_type: 'candidates', record_id: '1' },
        attempt: 1,
        secretRefId: SECRET_REF_GREENHOUSE,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'permission_denied');
});

// --- WordPress ---

test('wordpress publish_content creates a published post via application password', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 201, body: { id: 42, link: 'https://blog.acme.com/hello-world', status: 'publish' } },
    ]);
    const executor = createRealProviderExecutor(makeAtsCmsStore(), fetcher);
    const result = await executor({
        connectorType: 'wordpress',
        actionType: 'publish_content',
        payload: { title: 'Hello World', content: '<p>First post.</p>' },
        attempt: 1,
        secretRefId: SECRET_REF_WORDPRESS,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('42'));
    assert.ok(result.resultSummary.includes('https://blog.acme.com/hello-world'));
    assert.ok(calls[0]!.url.includes('https://blog.acme.com/wp-json/wp/v2/posts'));
    assert.equal(calls[0]!.method, 'POST');
    const expectedBasic = `Basic ${Buffer.from('agent:abcd efgh ijkl').toString('base64')}`;
    assert.equal(calls[0]!.headers!['Authorization'], expectedBasic);
    const body = calls[0]!.body as { title: string; content: string; status: string };
    assert.equal(body.status, 'publish');
});

test('wordpress publish_content honors an explicit draft status', async () => {
    const { fetcher, calls } = makeFetch([{ status: 201, body: { id: 43, status: 'draft' } }]);
    const executor = createRealProviderExecutor(makeAtsCmsStore(), fetcher);
    const result = await executor({
        connectorType: 'wordpress',
        actionType: 'publish_content',
        payload: { title: 'WIP', content: 'draft body', status: 'draft' },
        attempt: 1,
        secretRefId: SECRET_REF_WORDPRESS,
    });
    assert.equal(result.ok, true);
    assert.equal((calls[0]!.body as { status: string }).status, 'draft');
});

test('wordpress update_content patches an existing post', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: { id: 42, link: 'https://blog.acme.com/hello-world' } }]);
    const executor = createRealProviderExecutor(makeAtsCmsStore(), fetcher);
    const result = await executor({
        connectorType: 'wordpress',
        actionType: 'update_content',
        payload: { content_id: '42', content: '<p>Updated.</p>' },
        attempt: 1,
        secretRefId: SECRET_REF_WORDPRESS,
    });
    assert.equal(result.ok, true);
    assert.equal(calls[0]!.method, 'POST');
    assert.ok(calls[0]!.url.includes('/wp-json/wp/v2/posts/42'));
});

test('wordpress get_content fetches a post title and status', async () => {
    const { fetcher, calls } = makeFetch([
        { status: 200, body: { id: 42, status: 'publish', title: { rendered: 'Hello World' } } },
    ]);
    const executor = createRealProviderExecutor(makeAtsCmsStore(), fetcher);
    const result = await executor({
        connectorType: 'wordpress',
        actionType: 'get_content',
        payload: { content_id: '42' },
        attempt: 1,
        secretRefId: SECRET_REF_WORDPRESS,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('Hello World'));
    assert.ok(calls[0]!.url.includes('/wp-json/wp/v2/posts/42'));
});

test('wordpress list_content lists recent posts with titles', async () => {
    const { fetcher, calls } = makeFetch([
        {
            status: 200,
            body: [
                { id: 42, status: 'publish', title: { rendered: 'Hello World' } },
                { id: 43, status: 'draft', title: { rendered: 'WIP' } },
            ],
        },
    ]);
    const executor = createRealProviderExecutor(makeAtsCmsStore(), fetcher);
    const result = await executor({
        connectorType: 'wordpress',
        actionType: 'list_content',
        payload: { max_results: 5 },
        attempt: 1,
        secretRefId: SECRET_REF_WORDPRESS,
    });
    assert.equal(result.ok, true);
    assert.ok(result.resultSummary.includes('Hello World'));
    assert.ok(result.resultSummary.includes('WIP'));
    assert.ok(calls[0]!.url.includes('per_page=5'));
});

test('wordpress publish_content returns invalid_format when title or content missing', async () => {
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(makeAtsCmsStore(), fetcher);
    const result = await executor({
        connectorType: 'wordpress',
        actionType: 'publish_content',
        payload: { title: 'no body' },
        attempt: 1,
        secretRefId: SECRET_REF_WORDPRESS,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'invalid_format');
});

test('executor returns upgrade_required when wordpress base_url missing', async () => {
    const store = createInMemorySecretStore({
        [SECRET_REF_WORDPRESS]: JSON.stringify({ username: 'agent', app_password: 'x' }),
    });
    const { fetcher } = makeFetch([]);
    const executor = createRealProviderExecutor(store, fetcher);
    const result = await executor({
        connectorType: 'wordpress',
        actionType: 'get_content',
        payload: { content_id: '42' },
        attempt: 1,
        secretRefId: SECRET_REF_WORDPRESS,
    });
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, 'upgrade_required');
});

// --- ATS / CMS health probes ---

test('health probe: greenhouse returns ok when user_roles endpoint returns 200', async () => {
    const { fetcher, calls } = makeFetch([{ status: 200, body: [] }]);
    const probe = createRealConnectorHealthProbe(makeAtsCmsStore(), fetcher);
    const result = await probe({
        connectorType: 'greenhouse',
        metadata: { connectorId: 'greenhouse:t:w', connectorType: 'greenhouse', secretRefId: SECRET_REF_GREENHOUSE, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });
    assert.equal(result.outcome, 'ok');
    assert.ok(calls[0]!.url.includes('harvest.greenhouse.io'));
});

test('health probe: wordpress returns auth_failure when users/me returns 401', async () => {
    const { fetcher, calls } = makeFetch([{ status: 401 }]);
    const probe = createRealConnectorHealthProbe(makeAtsCmsStore(), fetcher);
    const result = await probe({
        connectorType: 'wordpress',
        metadata: { connectorId: 'wordpress:t:w', connectorType: 'wordpress', secretRefId: SECRET_REF_WORDPRESS, status: 'connected', scopeStatus: 'full', lastErrorClass: null },
    });
    assert.equal(result.outcome, 'auth_failure');
    assert.ok(calls[0]!.url.includes('/wp-json/wp/v2/users/me'));
});
