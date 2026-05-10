import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { GitLabConnector } from '../connectors/gitlab-connector.js';

// ---------------------------------------------------------------------------
// Fetch mock infrastructure (mirrors jira-connector.test.ts pattern)
// ---------------------------------------------------------------------------

type FetchMock = (url: string | URL | Request, init?: RequestInit) => Promise<Response>;

let originalFetch: typeof globalThis.fetch;
let mockFetch: FetchMock | null = null;

const installMock = (impl: FetchMock): void => {
    mockFetch = impl;
};

const mockResponse = (body: unknown, status = 200): Response => {
    const json = JSON.stringify(body);
    return new Response(json, {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
};

beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = (url, init) => {
        if (!mockFetch) throw new Error('fetch called but no mock installed');
        return mockFetch(url as string, init);
    };
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    mockFetch = null;
});

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MOCK_ISSUE = {
    iid: 1,
    id: 100,
    title: 'Fix auth bug',
    description: 'OAuth flow broken',
    state: 'opened' as const,
    labels: ['bug'],
    assignees: [{ username: 'alice' }],
    created_at: '2026-05-01T10:00:00.000Z',
    updated_at: '2026-05-02T11:00:00.000Z',
    web_url: 'https://gitlab.com/group/repo/-/issues/1',
    author: { username: 'bob' },
};

const MOCK_MR = {
    iid: 5,
    id: 500,
    title: 'Add dark mode',
    description: null,
    state: 'opened' as const,
    source_branch: 'feature/dark-mode',
    target_branch: 'main',
    created_at: '2026-05-01T10:00:00.000Z',
    updated_at: '2026-05-02T11:00:00.000Z',
    merged_at: null,
    web_url: 'https://gitlab.com/group/repo/-/merge_requests/5',
    author: { username: 'carol' },
};

const MOCK_PIPELINE = {
    id: 999,
    iid: 10,
    status: 'created',
    ref: 'main',
    sha: 'abc1234',
    created_at: '2026-05-01T10:00:00.000Z',
    updated_at: '2026-05-01T10:00:00.000Z',
    web_url: 'https://gitlab.com/group/repo/-/pipelines/999',
};

const makeConnector = (): GitLabConnector =>
    new GitLabConnector({
        token: 'glpat-test-token',
        tokenType: 'private',
        host: 'gitlab.com',
    });

// Build via static fromEnv using injected env vars
const makeConnectorFromEnv = (overrides: NodeJS.ProcessEnv): GitLabConnector => {
    const saved: Record<string, string | undefined> = {
        GITLAB_TOKEN: process.env['GITLAB_TOKEN'],
        GITLAB_OAUTH_TOKEN: process.env['GITLAB_OAUTH_TOKEN'],
        GITLAB_HOST: process.env['GITLAB_HOST'],
    };
    try {
        Object.assign(process.env, overrides);
        return GitLabConnector.fromEnv();
    } finally {
        for (const [k, v] of Object.entries(saved)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
};

// ---------------------------------------------------------------------------
// Test 1 — listIssues returns array
// ---------------------------------------------------------------------------

describe('GitLabConnector.listIssues', () => {
    test('returns array of issues on success', async () => {
        installMock(() => Promise.resolve(mockResponse([MOCK_ISSUE])));

        const connector = makeConnector();
        const result = await connector.listIssues(42);

        assert.ok(result.ok, 'result.ok should be true');
        assert.ok(Array.isArray(result.data), 'data should be an array');
        assert.equal(result.data!.length, 1);
        assert.equal(result.data![0]!.iid, 1);
        assert.equal(result.data![0]!.title, 'Fix auth bug');
        assert.deepEqual(result.data![0]!.assignees, ['alice']);
        assert.equal(result.data![0]!.author, 'bob');
    });

    test('returns empty array when no issues exist', async () => {
        installMock(() => Promise.resolve(mockResponse([])));
        const connector = makeConnector();
        const result = await connector.listIssues('group/project');
        assert.ok(result.ok);
        assert.deepEqual(result.data, []);
    });

    test('applies state filter in query string', async () => {
        let capturedUrl = '';
        installMock((url) => {
            capturedUrl = url.toString();
            return Promise.resolve(mockResponse([]));
        });
        const connector = makeConnector();
        await connector.listIssues(42, { state: 'closed' });
        assert.ok(capturedUrl.includes('state=closed'), `URL should contain state filter: ${capturedUrl}`);
    });
});

// ---------------------------------------------------------------------------
// Test 2 — createIssue returns issue with iid
// ---------------------------------------------------------------------------

describe('GitLabConnector.createIssue', () => {
    test('returns created issue with iid', async () => {
        const created = { ...MOCK_ISSUE, iid: 7, title: 'New Feature' };
        installMock(() => Promise.resolve(mockResponse(created, 201)));

        const connector = makeConnector();
        const result = await connector.createIssue(42, 'New Feature', 'Some description', ['enhancement']);

        assert.ok(result.ok, 'result.ok should be true');
        assert.equal(result.data!.iid, 7);
        assert.equal(result.data!.title, 'New Feature');
    });

    test('returns error if title is empty', async () => {
        const connector = makeConnector();
        const result = await connector.createIssue(42, '', 'desc');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('title is required'));
    });
});

// ---------------------------------------------------------------------------
// Test 3 — addComment returns note id
// ---------------------------------------------------------------------------

describe('GitLabConnector.addComment', () => {
    test('returns note with id', async () => {
        installMock(() =>
            Promise.resolve(
                mockResponse({
                    id: 55,
                    body: 'LGTM!',
                    author: { username: 'reviewer' },
                    created_at: '2026-05-01T10:00:00.000Z',
                    updated_at: '2026-05-01T10:00:00.000Z',
                }),
            ),
        );

        const connector = makeConnector();
        const result = await connector.addComment(42, 1, 'LGTM!');

        assert.ok(result.ok, 'result.ok should be true');
        assert.equal(result.data!.id, 55);
        assert.equal(result.data!.body, 'LGTM!');
        assert.equal(result.data!.author, 'reviewer');
    });

    test('returns error if body is empty', async () => {
        const connector = makeConnector();
        const result = await connector.addComment(42, 1, '');
        assert.equal(result.ok, false);
    });
});

// ---------------------------------------------------------------------------
// Test 4 — createMergeRequest returns MR with iid
// ---------------------------------------------------------------------------

describe('GitLabConnector.createMergeRequest', () => {
    test('returns created MR with iid', async () => {
        const created = { ...MOCK_MR, iid: 12 };
        installMock(() => Promise.resolve(mockResponse(created, 201)));

        const connector = makeConnector();
        const result = await connector.createMergeRequest(42, 'feature/x', 'main', 'Add feature X');

        assert.ok(result.ok, 'result.ok should be true');
        assert.equal(result.data!.iid, 12);
        assert.equal(result.data!.source_branch, 'feature/dark-mode'); // from mock shape
        assert.equal(result.data!.state, 'opened');
    });

    test('returns error if title is empty', async () => {
        const connector = makeConnector();
        const result = await connector.createMergeRequest(42, 'feature/x', 'main', '');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('required'));
    });
});

// ---------------------------------------------------------------------------
// Test 5 — triggerPipeline returns pipeline id
// ---------------------------------------------------------------------------

describe('GitLabConnector.triggerPipeline', () => {
    test('returns pipeline with id', async () => {
        installMock(() => Promise.resolve(mockResponse(MOCK_PIPELINE, 201)));

        const connector = makeConnector();
        const result = await connector.triggerPipeline(42, 'main');

        assert.ok(result.ok, 'result.ok should be true');
        assert.equal(result.data!.id, 999);
        assert.equal(result.data!.ref, 'main');
        assert.equal(result.data!.status, 'created');
    });

    test('supports pipeline variables', async () => {
        let capturedBody = '';
        installMock((_url, init) => {
            capturedBody = init?.body?.toString() ?? '';
            return Promise.resolve(mockResponse(MOCK_PIPELINE, 201));
        });

        const connector = makeConnector();
        await connector.triggerPipeline(42, 'main', { DEPLOY_ENV: 'staging' });

        const parsed = JSON.parse(capturedBody) as { variables: Array<{ key: string; value: string }> };
        assert.ok(Array.isArray(parsed.variables), 'should send variables array');
        assert.equal(parsed.variables[0]!.key, 'DEPLOY_ENV');
        assert.equal(parsed.variables[0]!.value, 'staging');
    });

    test('returns error if ref is empty', async () => {
        const connector = makeConnector();
        const result = await connector.triggerPipeline(42, '');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('ref is required'));
    });
});

// ---------------------------------------------------------------------------
// Test 6 — GITLAB_TOKEN sets PRIVATE-TOKEN header
// ---------------------------------------------------------------------------

describe('Auth header selection', () => {
    test('GITLAB_TOKEN sets PRIVATE-TOKEN header (not Authorization)', async () => {
        let capturedHeaders: Record<string, string> = {};
        installMock((_url, init) => {
            capturedHeaders = (init?.headers as Record<string, string>) ?? {};
            return Promise.resolve(mockResponse([]));
        });

        const connector = makeConnectorFromEnv({ GITLAB_TOKEN: 'glpat-abc123', GITLAB_HOST: 'gitlab.com' });
        await connector.listIssues(1);

        assert.equal(capturedHeaders['PRIVATE-TOKEN'], 'glpat-abc123', 'PRIVATE-TOKEN header should be set');
        assert.equal(capturedHeaders['Authorization'], undefined, 'Authorization header should NOT be set');
    });

    // -----------------------------------------------------------------------
    // Test 7 — GITLAB_OAUTH_TOKEN sets Authorization Bearer header
    // -----------------------------------------------------------------------

    test('GITLAB_OAUTH_TOKEN sets Authorization Bearer header (not PRIVATE-TOKEN)', async () => {
        let capturedHeaders: Record<string, string> = {};
        installMock((_url, init) => {
            capturedHeaders = (init?.headers as Record<string, string>) ?? {};
            return Promise.resolve(mockResponse([]));
        });

        const connector = makeConnectorFromEnv({
            GITLAB_OAUTH_TOKEN: 'oauth-xyz789',
            GITLAB_HOST: 'gitlab.com',
        });
        // Temporarily clear GITLAB_TOKEN so only OAuth is set — already done above in makeConnectorFromEnv
        await connector.listIssues(1);

        assert.equal(capturedHeaders['Authorization'], 'Bearer oauth-xyz789', 'Authorization Bearer header should be set');
        assert.equal(capturedHeaders['PRIVATE-TOKEN'], undefined, 'PRIVATE-TOKEN header should NOT be set');
    });
});

// ---------------------------------------------------------------------------
// Test 8 — Neither token set throws on construction
// ---------------------------------------------------------------------------

describe('GitLabConnector.fromEnv validation', () => {
    test('throws if neither GITLAB_TOKEN nor GITLAB_OAUTH_TOKEN is set', () => {
        const saved = {
            pat: process.env['GITLAB_TOKEN'],
            oauth: process.env['GITLAB_OAUTH_TOKEN'],
        };
        delete process.env['GITLAB_TOKEN'];
        delete process.env['GITLAB_OAUTH_TOKEN'];
        try {
            assert.throws(() => GitLabConnector.fromEnv(), /GITLAB_TOKEN or GITLAB_OAUTH_TOKEN/);
        } finally {
            if (saved.pat) process.env['GITLAB_TOKEN'] = saved.pat;
            if (saved.oauth) process.env['GITLAB_OAUTH_TOKEN'] = saved.oauth;
        }
    });

    test('PAT takes precedence when both GITLAB_TOKEN and GITLAB_OAUTH_TOKEN are set', async () => {
        let capturedHeaders: Record<string, string> = {};
        installMock((_url, init) => {
            capturedHeaders = (init?.headers as Record<string, string>) ?? {};
            return Promise.resolve(mockResponse([]));
        });

        const connector = makeConnectorFromEnv({
            GITLAB_TOKEN: 'glpat-preferred',
            GITLAB_OAUTH_TOKEN: 'oauth-fallback',
            GITLAB_HOST: 'gitlab.com',
        });
        await connector.listIssues(1);

        assert.equal(capturedHeaders['PRIVATE-TOKEN'], 'glpat-preferred', 'PAT should take precedence');
        assert.equal(capturedHeaders['Authorization'], undefined, 'OAuth header should NOT be set when PAT present');
    });
});

// ---------------------------------------------------------------------------
// Test 9 — 404 response returns error with status code
// ---------------------------------------------------------------------------

describe('Error handling', () => {
    test('404 response returns ok=false with status 404', async () => {
        installMock(() => Promise.resolve(mockResponse({ message: '404 Project Not Found' }, 404)));

        const connector = makeConnector();
        const result = await connector.getIssue(99999, 1);

        assert.equal(result.ok, false, 'result.ok should be false');
        assert.equal(result.status, 404, 'status should be 404');
        assert.ok(result.error?.includes('404'), `error should mention 404: ${result.error}`);
    });

    test('503 response returns ok=false with status 503', async () => {
        installMock(() => Promise.resolve(mockResponse({ message: 'Service Unavailable' }, 503)));

        const connector = makeConnector();
        const result = await connector.listProjects();

        assert.equal(result.ok, false);
        assert.equal(result.status, 503);
    });
});

// ---------------------------------------------------------------------------
// Test 10 — Self-hosted: GITLAB_HOST env var changes base URL
// ---------------------------------------------------------------------------

describe('Self-hosted GitLab support', () => {
    test('GITLAB_HOST env var changes base URL to self-hosted instance', async () => {
        let capturedUrl = '';
        installMock((url) => {
            capturedUrl = url.toString();
            return Promise.resolve(mockResponse([]));
        });

        const connector = makeConnectorFromEnv({
            GITLAB_TOKEN: 'glpat-selfhosted',
            GITLAB_HOST: 'git.mycompany.internal',
        });
        await connector.listProjects();

        assert.ok(
            capturedUrl.startsWith('https://git.mycompany.internal/api/v4/'),
            `URL should use self-hosted host. Got: ${capturedUrl}`,
        );
        assert.ok(
            !capturedUrl.includes('gitlab.com'),
            `URL must not contain gitlab.com for self-hosted. Got: ${capturedUrl}`,
        );
    });

    test('default host is gitlab.com when GITLAB_HOST is unset', async () => {
        let capturedUrl = '';
        installMock((url) => {
            capturedUrl = url.toString();
            return Promise.resolve(mockResponse([]));
        });

        const connector = makeConnectorFromEnv({ GITLAB_TOKEN: 'glpat-default' });
        await connector.listProjects();

        assert.ok(
            capturedUrl.startsWith('https://gitlab.com/api/v4/'),
            `URL should default to gitlab.com. Got: ${capturedUrl}`,
        );
    });
});
