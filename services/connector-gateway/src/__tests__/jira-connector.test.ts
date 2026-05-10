import { test, describe, beforeEach, afterEach } from 'node:test';
import * as assert from 'node:assert';
import { JiraConnector } from '../connectors/jira-connector.js';

// ---------------------------------------------------------------------------
// Fetch mock infrastructure
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
// Helpers
// ---------------------------------------------------------------------------

const makeConnector = (): JiraConnector =>
    new JiraConnector({ baseUrl: 'my.atlassian.net', userEmail: 'user@test.com', apiToken: 'test-token-abc' });

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('JiraConnector construction', () => {
    test('throws if baseUrl is missing', () => {
        assert.throws(
            () => new JiraConnector({ baseUrl: '', userEmail: 'u@e.com', apiToken: 'tok' }),
            /baseUrl is required/,
        );
    });

    test('throws if userEmail is missing', () => {
        assert.throws(
            () => new JiraConnector({ baseUrl: 'x.atlassian.net', userEmail: '', apiToken: 'tok' }),
            /userEmail is required/,
        );
    });

    test('throws if apiToken is missing', () => {
        assert.throws(
            () => new JiraConnector({ baseUrl: 'x.atlassian.net', userEmail: 'u@e.com', apiToken: '' }),
            /apiToken is required/,
        );
    });

    test('fromEnv throws when env vars are missing', () => {
        const saved = {
            base: process.env['JIRA_BASE_URL'],
            email: process.env['JIRA_USER_EMAIL'],
            token: process.env['JIRA_API_TOKEN'],
        };
        delete process.env['JIRA_BASE_URL'];
        delete process.env['JIRA_USER_EMAIL'];
        delete process.env['JIRA_API_TOKEN'];
        try {
            assert.throws(() => JiraConnector.fromEnv(), /JIRA_BASE_URL/);
        } finally {
            if (saved.base) process.env['JIRA_BASE_URL'] = saved.base;
            if (saved.email) process.env['JIRA_USER_EMAIL'] = saved.email;
            if (saved.token) process.env['JIRA_API_TOKEN'] = saved.token;
        }
    });
});

// ---------------------------------------------------------------------------
// listIssues
// ---------------------------------------------------------------------------

describe('JiraConnector.listIssues', () => {
    test('returns array of issues on success', async () => {
        installMock(() =>
            Promise.resolve(
                mockResponse({
                    issues: [
                        {
                            id: '10001',
                            key: 'PROJ-1',
                            fields: {
                                summary: 'Fix login bug',
                                description: null,
                                status: { name: 'In Progress' },
                                issuetype: { name: 'Bug' },
                                priority: { name: 'High' },
                                assignee: { displayName: 'Alice' },
                                reporter: { displayName: 'Bob' },
                                created: '2026-05-01T10:00:00.000Z',
                                updated: '2026-05-02T11:00:00.000Z',
                                project: { key: 'PROJ' },
                            },
                        },
                    ],
                }),
            ),
        );

        const connector = makeConnector();
        const result = await connector.listIssues('PROJ');

        assert.ok(result.ok, 'result.ok should be true');
        assert.ok(Array.isArray(result.data), 'data should be an array');
        assert.equal(result.data!.length, 1);
        assert.equal(result.data![0]!.key, 'PROJ-1');
        assert.equal(result.data![0]!.summary, 'Fix login bug');
        assert.equal(result.data![0]!.status, 'In Progress');
        assert.equal(result.data![0]!.assignee, 'Alice');
    });

    test('returns empty array when no issues match', async () => {
        installMock(() => Promise.resolve(mockResponse({ issues: [] })));
        const connector = makeConnector();
        const result = await connector.listIssues('EMPTY');
        assert.ok(result.ok);
        assert.deepEqual(result.data, []);
    });

    test('returns error on non-200 response', async () => {
        installMock(() => Promise.resolve(mockResponse({ errorMessages: ['Project not found'] }, 404)));
        const connector = makeConnector();
        const result = await connector.listIssues('MISSING');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('404'));
    });

    test('passes status filter in JQL', async () => {
        let capturedUrl = '';
        installMock((url) => {
            capturedUrl = url.toString();
            return Promise.resolve(mockResponse({ issues: [] }));
        });
        const connector = makeConnector();
        await connector.listIssues('PROJ', { status: 'Done' });
        assert.ok(capturedUrl.includes('status'), `URL should include status filter: ${capturedUrl}`);
    });
});

// ---------------------------------------------------------------------------
// getIssue
// ---------------------------------------------------------------------------

describe('JiraConnector.getIssue', () => {
    test('returns issue on success', async () => {
        installMock(() =>
            Promise.resolve(
                mockResponse({
                    id: '10002',
                    key: 'PROJ-2',
                    fields: {
                        summary: 'Add dark mode',
                        description: 'Implement dark mode toggle',
                        status: { name: 'To Do' },
                        issuetype: { name: 'Story' },
                        priority: { name: 'Medium' },
                        assignee: null,
                        reporter: { displayName: 'Carol' },
                        created: '2026-05-01T10:00:00.000Z',
                        updated: '2026-05-01T10:00:00.000Z',
                        project: { key: 'PROJ' },
                    },
                }),
            ),
        );

        const connector = makeConnector();
        const result = await connector.getIssue('PROJ-2');

        assert.ok(result.ok);
        assert.equal(result.data!.key, 'PROJ-2');
        assert.equal(result.data!.summary, 'Add dark mode');
        assert.equal(result.data!.assignee, null);
    });

    test('returns error for empty issueKey', async () => {
        const connector = makeConnector();
        const result = await connector.getIssue('');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('issueKey is required'));
    });

    test('returns error on 404 with status code', async () => {
        installMock(() => Promise.resolve(mockResponse({ errorMessages: ['Issue Does Not Exist'] }, 404)));
        const connector = makeConnector();
        const result = await connector.getIssue('PROJ-9999');
        assert.equal(result.ok, false);
        assert.equal(result.status, 404);
        assert.ok(result.error?.includes('404'), `Expected 404 in error, got: ${result.error}`);
    });
});

// ---------------------------------------------------------------------------
// createIssue
// ---------------------------------------------------------------------------

describe('JiraConnector.createIssue', () => {
    test('returns issue with key on success', async () => {
        let callCount = 0;
        installMock(() => {
            callCount++;
            if (callCount === 1) {
                // POST /issue → returns created key
                return Promise.resolve(mockResponse({ id: '10003', key: 'PROJ-3', self: 'https://...' }, 201));
            }
            // GET /issue/PROJ-3 → returns full issue
            return Promise.resolve(
                mockResponse({
                    id: '10003',
                    key: 'PROJ-3',
                    fields: {
                        summary: 'New feature',
                        description: 'A new feature request',
                        status: { name: 'To Do' },
                        issuetype: { name: 'Story' },
                        priority: { name: 'Medium' },
                        assignee: null,
                        reporter: { displayName: 'Dave' },
                        created: '2026-05-10T12:00:00.000Z',
                        updated: '2026-05-10T12:00:00.000Z',
                        project: { key: 'PROJ' },
                    },
                }),
            );
        });

        const connector = makeConnector();
        const result = await connector.createIssue('PROJ', 'New feature', 'A new feature request', 'Story', 'Medium');

        assert.ok(result.ok);
        assert.ok(result.data!.key.length > 0, 'issue key should be present');
        assert.equal(result.data!.key, 'PROJ-3');
    });

    test('returns error if projectKey is empty', async () => {
        const connector = makeConnector();
        const result = await connector.createIssue('', 'Summary', 'Desc');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('projectKey and summary are required'));
    });

    test('sanitizes script tags from description', async () => {
        let capturedBody = '';
        installMock((_, init) => {
            if (init?.method === 'POST') {
                capturedBody = typeof init.body === 'string' ? init.body : '';
                return Promise.resolve(mockResponse({ id: '10004', key: 'PROJ-4', self: '' }, 201));
            }
            return Promise.resolve(
                mockResponse({
                    id: '10004',
                    key: 'PROJ-4',
                    fields: {
                        summary: 'XSS test',
                        description: 'safe text',
                        status: { name: 'To Do' },
                        issuetype: { name: 'Task' },
                        priority: null,
                        assignee: null,
                        reporter: null,
                        created: new Date().toISOString(),
                        updated: new Date().toISOString(),
                        project: { key: 'PROJ' },
                    },
                }),
            );
        });

        const connector = makeConnector();
        await connector.createIssue('PROJ', 'XSS test', 'safe text<script>alert(1)</script>');
        assert.ok(!capturedBody.includes('<script>'), 'script tags should be sanitized');
    });
});

// ---------------------------------------------------------------------------
// addComment
// ---------------------------------------------------------------------------

describe('JiraConnector.addComment', () => {
    test('returns comment id on success', async () => {
        installMock(() =>
            Promise.resolve(
                mockResponse({
                    id: 'cmt-001',
                    body: { type: 'doc', content: [] },
                    author: { displayName: 'Agent' },
                    created: '2026-05-10T12:00:00.000Z',
                    updated: '2026-05-10T12:00:00.000Z',
                }),
            ),
        );

        const connector = makeConnector();
        const result = await connector.addComment('PROJ-1', 'This is a test comment');

        assert.ok(result.ok);
        assert.equal(result.data!.id, 'cmt-001');
        assert.equal(result.data!.author, 'Agent');
    });

    test('returns error if body is empty', async () => {
        const connector = makeConnector();
        const result = await connector.addComment('PROJ-1', '');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('body are required'));
    });

    test('404 response returns error with status code', async () => {
        installMock(() => Promise.resolve(mockResponse({ errorMessages: ['Issue not found'] }, 404)));
        const connector = makeConnector();
        const result = await connector.addComment('PROJ-9999', 'comment body');
        assert.equal(result.ok, false);
        assert.equal(result.status, 404);
    });
});

// ---------------------------------------------------------------------------
// transitionIssue / listTransitions
// ---------------------------------------------------------------------------

describe('JiraConnector.listTransitions', () => {
    test('returns array of transitions', async () => {
        installMock(() =>
            Promise.resolve(
                mockResponse({
                    transitions: [
                        { id: '11', name: 'To Do', to: { name: 'To Do' } },
                        { id: '21', name: 'In Progress', to: { name: 'In Progress' } },
                        { id: '31', name: 'Done', to: { name: 'Done' } },
                    ],
                }),
            ),
        );

        const connector = makeConnector();
        const result = await connector.listTransitions('PROJ-1');

        assert.ok(result.ok);
        assert.equal(result.data!.length, 3);
        assert.equal(result.data![1]!.name, 'In Progress');
    });
});

describe('JiraConnector.transitionIssue', () => {
    test('returns transitioned:true on success', async () => {
        installMock(() => Promise.resolve(new Response(null, { status: 204 })));
        const connector = makeConnector();
        const result = await connector.transitionIssue('PROJ-1', '21');
        assert.ok(result.ok);
        assert.equal(result.data!.transitioned, true);
    });
});

// ---------------------------------------------------------------------------
// updateIssue
// ---------------------------------------------------------------------------

describe('JiraConnector.updateIssue', () => {
    test('returns updated:true on 204', async () => {
        installMock(() => Promise.resolve(new Response(null, { status: 204 })));
        const connector = makeConnector();
        const result = await connector.updateIssue('PROJ-1', { priority: { name: 'Low' } });
        assert.ok(result.ok);
        assert.equal(result.data!.updated, true);
    });
});

// ---------------------------------------------------------------------------
// assignIssue
// ---------------------------------------------------------------------------

describe('JiraConnector.assignIssue', () => {
    test('returns assigned:true on success', async () => {
        installMock(() => Promise.resolve(new Response(null, { status: 204 })));
        const connector = makeConnector();
        const result = await connector.assignIssue('PROJ-1', 'account-xyz');
        assert.ok(result.ok);
        assert.equal(result.data!.assigned, true);
    });
});

// ---------------------------------------------------------------------------
// listProjects
// ---------------------------------------------------------------------------

describe('JiraConnector.listProjects', () => {
    test('returns array of projects', async () => {
        installMock(() =>
            Promise.resolve(
                mockResponse([
                    { id: '10000', key: 'PROJ', name: 'My Project', projectTypeKey: 'software', lead: { displayName: 'PM' } },
                    { id: '10001', key: 'OPS', name: 'Operations', projectTypeKey: 'business' },
                ]),
            ),
        );

        const connector = makeConnector();
        const result = await connector.listProjects();

        assert.ok(result.ok);
        assert.equal(result.data!.length, 2);
        assert.equal(result.data![0]!.key, 'PROJ');
        assert.equal(result.data![0]!.lead, 'PM');
        assert.equal(result.data![1]!.lead, null);
    });
});

// ---------------------------------------------------------------------------
// searchUsers
// ---------------------------------------------------------------------------

describe('JiraConnector.searchUsers', () => {
    test('returns matching users', async () => {
        installMock(() =>
            Promise.resolve(
                mockResponse([
                    { accountId: 'acc-1', displayName: 'Alice Smith', emailAddress: 'alice@test.com', active: true },
                ]),
            ),
        );

        const connector = makeConnector();
        const result = await connector.searchUsers('alice');

        assert.ok(result.ok);
        assert.equal(result.data!.length, 1);
        assert.equal(result.data![0]!.displayName, 'Alice Smith');
    });

    test('returns error for empty query', async () => {
        const connector = makeConnector();
        const result = await connector.searchUsers('');
        assert.equal(result.ok, false);
        assert.ok(result.error?.includes('query is required'));
    });
});

// ---------------------------------------------------------------------------
// Auth header check
// ---------------------------------------------------------------------------

test('JiraConnector sends Basic auth header with base64 credentials', async () => {
    let capturedAuth = '';
    installMock((_, init) => {
        capturedAuth = (init?.headers as Record<string, string>)?.['Authorization'] ?? '';
        return Promise.resolve(mockResponse({ issues: [] }));
    });

    const connector = new JiraConnector({
        baseUrl: 'my.atlassian.net',
        userEmail: 'user@example.com',
        apiToken: 'secret-token',
    });
    await connector.listIssues('TEST');

    assert.ok(capturedAuth.startsWith('Basic '), `Expected Basic auth, got: ${capturedAuth}`);
    const decoded = Buffer.from(capturedAuth.replace('Basic ', ''), 'base64').toString('utf-8');
    assert.equal(decoded, 'user@example.com:secret-token');
});
