/**
 * Feature #1 — Web Research Service tests
 * Frozen 2026-05-07
 */

import { describe, it, expect } from 'vitest';
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
        expect(result.sources.length).toBeGreaterThan(0);
        expect(result.synthesizedAnswer).toContain('TypeError');
        expect(result.contractVersion).toBeDefined();
        expect(result.taskId).toBe('task-1');
    });

    it('returns an empty sources array when all fetches fail', async () => {
        const query = buildErrorQuery('some error');
        const result = await researchForTask(query, ctx, failFetch);
        expect(result.sources).toHaveLength(0);
        expect(result.synthesizedAnswer).toContain('No results found');
    });

    it('respects maxResults cap', async () => {
        const query = buildErrorQuery('error', []);
        query.maxResults = 1;
        const result = await researchForTask(query, ctx, okFetch);
        expect(result.sources.length).toBeLessThanOrEqual(1);
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
            expect(source.url).not.toContain('evil.com');
            expect(source.url.startsWith('https://registry.npmjs.org')).toBe(true);
        }
    });
});

describe('defaultSynthesise', () => {
    it('returns a no-results message when snippets is empty', async () => {
        const answer = await defaultSynthesise('my query', []);
        expect(answer).toContain('No results found');
    });

    it('includes the query in the summary', async () => {
        const answer = await defaultSynthesise('useEffect cleanup', ['some doc content']);
        expect(answer).toContain('useEffect cleanup');
    });
});
