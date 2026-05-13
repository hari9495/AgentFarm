/**
 * Tests for GitHubConnector — real fetch calls mocked via globalThis.fetch.
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach } from 'node:test';
import { GitHubConnector } from './github-connector.js';

// ── fetch mock helpers ─────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
    const responseHeaders = new Headers({
        'content-type': 'application/json',
        'x-ratelimit-remaining': '4999',
        'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
        ...headers,
    });

    globalThis.fetch = async (_url: string | URL | Request, _init?: RequestInit) => {
        return new Response(status === 204 ? null : JSON.stringify(body), {
            status,
            headers: responseHeaders,
        });
    };
}

function mockFetchError() {
    globalThis.fetch = async () => {
        throw new Error('Network error');
    };
}

// ── Fixtures ───────────────────────────────────────────────────────────────

const RAW_ISSUE = {
    number: 42,
    title: 'Fix the bug',
    body: 'Something is broken',
    state: 'open',
    labels: [{ name: 'bug' }],
    assignees: [{ login: 'alice' }],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    html_url: 'https://github.com/org/repo/issues/42',
    user: { login: 'alice' },
};

const RAW_PR = {
    number: 10,
    title: 'Add feature',
    body: 'Adds a new feature',
    state: 'open',
    base: { ref: 'main' },
    head: { ref: 'feature/x' },
    draft: false,
    additions: 5,
    deletions: 2,
    changed_files: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    merged_at: null,
    html_url: 'https://github.com/org/repo/pull/10',
    user: { login: 'bob' },
    requested_reviewers: [{ login: 'charlie' }],
};

const RAW_COMMIT = {
    sha: 'abc1234567890',
    commit: { message: 'Initial commit', author: { name: 'Alice', date: '2024-01-01T00:00:00Z' } },
    html_url: 'https://github.com/org/repo/commit/abc1234567890',
};

const RAW_WORKFLOW_RUN = {
    id: 99,
    name: 'CI',
    status: 'completed',
    conclusion: 'success',
    head_branch: 'main',
    head_sha: 'abc123',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-02T00:00:00Z',
    html_url: 'https://github.com/org/repo/actions/runs/99',
};

// ── Tests ──────────────────────────────────────────────────────────────────

describe('GitHubConnector constructor', () => {
    it('throws when token is missing', () => {
        assert.throws(
            () => new GitHubConnector({ token: '', owner: 'org', repo: 'r' }),
            /token is required/,
        );
    });

    it('throws when owner or repo is missing', () => {
        assert.throws(
            () => new GitHubConnector({ token: 'tk', owner: '', repo: 'r' }),
            /owner and repo are required/,
        );
    });
});

describe('GitHubConnector.getIssue', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns mapped issue on success', async () => {
        mockFetch(200, RAW_ISSUE);
        const result = await connector.getIssue(42);
        assert.ok(result.ok);
        assert.equal(result.data?.number, 42);
        assert.equal(result.data?.title, 'Fix the bug');
        assert.deepEqual(result.data?.labels, ['bug']);
        assert.deepEqual(result.data?.assignees, ['alice']);
        assert.equal(result.data?.author, 'alice');
        assert.equal(result.rate_limit_remaining, 4999);
    });

    it('returns error result on 404', async () => {
        mockFetch(404, { message: 'Not Found' });
        const result = await connector.getIssue(9999);
        assert.ok(!result.ok);
        assert.match(result.error!, /404/);
    });

    it('validates issue number', async () => {
        const result = await connector.getIssue(-1);
        assert.ok(!result.ok);
        assert.match(result.error!, /Invalid issue number/);
    });
});

describe('GitHubConnector.createIssue', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('creates an issue and maps response', async () => {
        mockFetch(201, RAW_ISSUE);
        const result = await connector.createIssue({ title: 'Fix the bug', body: 'Something is broken', labels: ['bug'] });
        assert.ok(result.ok);
        assert.equal(result.data?.number, 42);
    });

    it('strips script tags from body', async () => {
        let capturedBody: string | null = null;
        globalThis.fetch = async (_url: string | URL | Request, init?: RequestInit) => {
            capturedBody = init?.body as string;
            return new Response(JSON.stringify(RAW_ISSUE), { status: 201, headers: { 'content-type': 'application/json' } });
        };
        await connector.createIssue({ title: 'Test', body: '<script>alert(1)</script>Hello' });
        assert.ok(capturedBody !== null);
        const parsed = JSON.parse(capturedBody!) as { body: string };
        assert.ok(!parsed.body.includes('<script>'));
        assert.ok(parsed.body.includes('Hello'));
    });
});

describe('GitHubConnector.listOpenIssues', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns array of mapped issues', async () => {
        mockFetch(200, [RAW_ISSUE]);
        const result = await connector.listOpenIssues();
        assert.ok(result.ok);
        assert.equal(result.data?.length, 1);
        assert.equal(result.data?.[0]?.number, 42);
    });

    it('returns empty array when no issues', async () => {
        mockFetch(200, []);
        const result = await connector.listOpenIssues();
        assert.ok(result.ok);
        assert.equal(result.data?.length, 0);
    });
});

describe('GitHubConnector.closeIssue', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns closed true on success', async () => {
        mockFetch(200, { ...RAW_ISSUE, state: 'closed' });
        const result = await connector.closeIssue(42);
        assert.ok(result.ok);
        assert.ok(result.data?.closed);
    });

    it('validates issue number', async () => {
        const result = await connector.closeIssue(0);
        assert.ok(!result.ok);
    });
});

describe('GitHubConnector.addIssueComment', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns mapped comment', async () => {
        mockFetch(201, { id: 1, body: 'LGTM', user: { login: 'bot' }, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z', html_url: 'https://github.com/org/repo/issues/42#issuecomment-1' });
        const result = await connector.addIssueComment(42, 'LGTM');
        assert.ok(result.ok);
        assert.equal(result.data?.body, 'LGTM');
        assert.equal(result.data?.author, 'bot');
    });
});

describe('GitHubConnector.getPR', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns mapped PR', async () => {
        mockFetch(200, RAW_PR);
        const result = await connector.getPR(10);
        assert.ok(result.ok);
        assert.equal(result.data?.number, 10);
        assert.equal(result.data?.state, 'open');
        assert.equal(result.data?.author, 'bob');
        assert.deepEqual(result.data?.reviewers, ['charlie']);
    });

    it('marks PR as merged when merged_at is set', async () => {
        mockFetch(200, { ...RAW_PR, merged_at: '2024-01-05T00:00:00Z' });
        const result = await connector.getPR(10);
        assert.ok(result.ok);
        assert.equal(result.data?.state, 'merged');
    });

    it('validates PR number', async () => {
        const result = await connector.getPR(0);
        assert.ok(!result.ok);
    });
});

describe('GitHubConnector.createPR', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('creates and maps PR', async () => {
        mockFetch(201, RAW_PR);
        const result = await connector.createPR({ title: 'Add feature', body: 'desc', head: 'feature/x', base: 'main' });
        assert.ok(result.ok);
        assert.equal(result.data?.base_branch, 'main');
        assert.equal(result.data?.head_branch, 'feature/x');
    });
});

describe('GitHubConnector.listOpenPRs', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns list of PRs', async () => {
        mockFetch(200, [RAW_PR]);
        const result = await connector.listOpenPRs();
        assert.ok(result.ok);
        assert.equal(result.data?.length, 1);
    });
});

describe('GitHubConnector.requestPRReview', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns requested reviewers', async () => {
        mockFetch(201, { requested_reviewers: [{ login: 'alice' }] });
        const result = await connector.requestPRReview(10, ['alice']);
        assert.ok(result.ok);
        assert.deepEqual(result.data?.requested, ['alice']);
    });
});

describe('GitHubConnector.listPRReviews', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns mapped reviews', async () => {
        mockFetch(200, [{ id: 1, state: 'APPROVED', body: 'LGTM', user: { login: 'alice' }, submitted_at: '2024-01-01T00:00:00Z' }]);
        const result = await connector.listPRReviews(10);
        assert.ok(result.ok);
        assert.equal(result.data?.[0]?.state, 'APPROVED');
        assert.equal(result.data?.[0]?.author, 'alice');
    });
});

describe('GitHubConnector.listCommits', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns mapped commits', async () => {
        mockFetch(200, [RAW_COMMIT]);
        const result = await connector.listCommits();
        assert.ok(result.ok);
        assert.equal(result.data?.[0]?.sha, 'abc1234567890');
        assert.equal(result.data?.[0]?.author, 'Alice');
    });
});

describe('GitHubConnector.getCommit', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns mapped commit', async () => {
        mockFetch(200, RAW_COMMIT);
        const result = await connector.getCommit('abc1234567890');
        assert.ok(result.ok);
        assert.equal(result.data?.sha, 'abc1234567890');
    });

    it('validates SHA length', async () => {
        const result = await connector.getCommit('abc');
        assert.ok(!result.ok);
        assert.match(result.error!, /Invalid SHA/);
    });
});

describe('GitHubConnector.triggerWorkflow', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns triggered true on 204', async () => {
        mockFetch(204, null);
        const result = await connector.triggerWorkflow('ci.yml', 'main');
        assert.ok(result.ok);
        assert.ok(result.data?.triggered);
    });

    it('validates workflowId and ref', async () => {
        const result = await connector.triggerWorkflow('', 'main');
        assert.ok(!result.ok);
    });
});

describe('GitHubConnector.listWorkflowRuns', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns mapped runs', async () => {
        mockFetch(200, { workflow_runs: [RAW_WORKFLOW_RUN] });
        const result = await connector.listWorkflowRuns('ci.yml');
        assert.ok(result.ok);
        assert.equal(result.data?.[0]?.id, 99);
        assert.equal(result.data?.[0]?.conclusion, 'success');
    });
});

describe('GitHubConnector.getWorkflowRun', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns mapped run', async () => {
        mockFetch(200, RAW_WORKFLOW_RUN);
        const result = await connector.getWorkflowRun(99);
        assert.ok(result.ok);
        assert.equal(result.data?.id, 99);
        assert.equal(result.data?.status, 'completed');
    });
});

describe('GitHubConnector webhooks', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('listWebhooks returns mapped list', async () => {
        mockFetch(200, [{ id: 1, config: { url: 'https://example.com/hook' }, events: ['push'] }]);
        const result = await connector.listWebhooks();
        assert.ok(result.ok);
        assert.equal(result.data?.[0]?.id, 1);
        assert.equal(result.data?.[0]?.url, 'https://example.com/hook');
    });

    it('createWebhook returns id and active', async () => {
        mockFetch(201, { id: 5, config: { url: 'https://example.com/hook' }, active: true });
        const result = await connector.createWebhook({ url: 'https://example.com/hook', events: ['push'] });
        assert.ok(result.ok);
        assert.equal(result.data?.id, 5);
        assert.ok(result.data?.active);
    });

    it('createWebhook rejects non-HTTPS URLs without calling fetch', async () => {
        const result = await connector.createWebhook({ url: 'http://insecure.com/hook', events: ['push'] });
        assert.ok(!result.ok);
        assert.match(result.error!, /HTTPS/);
    });

    it('deleteWebhook returns deleted true on 204', async () => {
        mockFetch(204, null);
        const result = await connector.deleteWebhook(5);
        assert.ok(result.ok);
        assert.ok(result.data?.deleted);
    });
});

describe('GitHubConnector.getRepoInfo', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns repo metadata', async () => {
        mockFetch(200, { full_name: 'org/repo', default_branch: 'main', private: true, stargazers_count: 42 });
        const result = await connector.getRepoInfo();
        assert.ok(result.ok);
        assert.equal(result.data?.full_name, 'org/repo');
        assert.equal(result.data?.stargazers_count, 42);
    });
});

describe('GitHubConnector.listBranches', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns branches list', async () => {
        mockFetch(200, [{ name: 'main', protected: true }, { name: 'dev', protected: false }]);
        const result = await connector.listBranches();
        assert.ok(result.ok);
        assert.equal(result.data?.length, 2);
        assert.ok(result.data?.[0]?.protected);
    });
});

describe('GitHubConnector error handling', () => {
    const connector = new GitHubConnector({ token: 'test-token', owner: 'org', repo: 'repo' });

    it('returns error result on 403', async () => {
        mockFetch(403, { message: 'Forbidden' });
        const result = await connector.getIssue(1);
        assert.ok(!result.ok);
        assert.match(result.error!, /403/);
    });

    it('returns error result on 500', async () => {
        mockFetch(500, { message: 'Internal Server Error' });
        const result = await connector.getIssue(1);
        assert.ok(!result.ok);
        assert.match(result.error!, /500/);
    });

    it('propagates fetch network error', async () => {
        mockFetchError();
        await assert.rejects(() => connector.getIssue(1), /Network error/);
    });
});
