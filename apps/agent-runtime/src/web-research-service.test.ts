/**
 * Feature #1 - Web Research Service tests
 * Frozen 2026-05-07
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    researchForTask,
    buildErrorQuery,
    defaultSynthesise,
    type ResearchContext,
    type FetchFn,
} from './web-research-service.js';

const ctx: ResearchContext = {
    tenantId: 't1',
    workspaceId: 'ws-test-' + Math.random().toString(36).slice(2),
    taskId: 'task-1',
    correlationId: 'corr-1',
};

const okFetch: FetchFn = async (url) => ({
    ok: true,
    status: 200,
    text: async () => `mock content for ${url}`,
});

const failFetch: FetchFn = async () => ({
    ok: false,
    status: 404,
    text: async () => '',
});

describe('researchForTask', () => {
    it('returns a result with sources when fetch succeeds', async () => {
        const query = buildErrorQuery('TypeError cannot read properties of undefined');
        const result = await researchForTask(query, ctx, okFetch);
        assert.ok(result.sources.length > 0);
        assert.match(result.synthesizedAnswer, /TypeError/);
        assert.ok(result.contractVersion);
        assert.equal(result.taskId, 'task-1');
    });

    it('returns an empty sources array when all fetches fail', async () => {
        const query = buildErrorQuery('some error');
        const result = await researchForTask(query, ctx, failFetch);
        assert.equal(result.sources.length, 0);
        assert.match(result.synthesizedAnswer, /No results found/);
    });

    it('respects maxResults cap', async () => {
        const query = buildErrorQuery('error', []);
        query.maxResults = 1;
        const result = await researchForTask(query, ctx, okFetch);
        assert.ok(result.sources.length <= 1);
    });

    it('rejects URLs outside the allowed source base', async () => {
        // Use npm_registry source but supply a fetch that would return something for
        // an off-allowlist URL — should not appear in results
        const maliciousFetch: FetchFn = async (url) => {
            if (url.includes('evil.com')) return { ok: true, status: 200, text: async () => 'pwned' };
            return { ok: true, status: 200, text: async () => 'safe content' };
        };
        const query = buildErrorQuery('test', ['npm_registry']);
        const result = await researchForTask(query, ctx, maliciousFetch);
        for (const source of result.sources) {
            assert.ok(!source.url.includes('evil.com'));
            assert.ok(source.url.startsWith('https://registry.npmjs.org'));
        }
    });
});

describe('defaultSynthesise', () => {
    it('returns a no-results message when snippets is empty', async () => {
        const answer = await defaultSynthesise('my query', []);
        assert.match(answer, /No results found/);
    });

    it('includes the query in the summary', async () => {
        const answer = await defaultSynthesise('useEffect cleanup', ['some doc content']);
        assert.match(answer, /useEffect cleanup/);
    });
});
