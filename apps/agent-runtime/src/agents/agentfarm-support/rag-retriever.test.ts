/**
 * Tests for rag-retriever.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    retrieveSimilarCases,
    retrieveSupportTemplates,
    retrieveSupportLessons,
    buildSupportRagContext,
    ingestApprovedCase,
} from './rag-retriever.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GW = 'http://gw:3000';
const TOKEN = 'test-token';
const TENANT = 'tenant-1';
const WS = 'ws-1';

function makeQuery(overrides: Record<string, unknown> = {}) {
    return {
        tenantId: TENANT,
        issueDescription: 'Redis connection timeout on agent tasks',
        documentType: 'case_resolution' as const,
        ...overrides,
    };
}

function makeFetchOk(results: unknown[]) {
    return (async () => ({ ok: true, json: async () => ({ results }) })) as unknown as typeof fetch;
}

function makeFetchPatterns(patterns: unknown[]) {
    return (async () => ({ ok: true, json: async () => ({ patterns }) })) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// retrieveSimilarCases
// ---------------------------------------------------------------------------

describe('retrieveSimilarCases', () => {
    it('returns results excluding support_template sourceType', async () => {
        const rawResults = [
            { id: 'r1', content: 'Redis fix applied', sourceType: 'support_approved_case', similarity: 0.9 },
            { id: 'r2', content: 'Template content', sourceType: 'support_template', similarity: 0.85 },
        ];
        const origFetch = globalThis.fetch;
        globalThis.fetch = makeFetchOk(rawResults);
        try {
            const results = await retrieveSimilarCases(makeQuery(), GW, TOKEN);
            assert.equal(results.length, 1);
            assert.equal(results[0]!.id, 'r1');
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('returns empty array when fetch fails', async () => {
        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
        try {
            const results = await retrieveSimilarCases(makeQuery(), GW, TOKEN);
            assert.deepEqual(results, []);
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('returns empty array when response is not ok', async () => {
        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () => ({ ok: false, status: 500 })) as unknown as typeof fetch;
        try {
            const results = await retrieveSimilarCases(makeQuery(), GW, TOKEN);
            assert.deepEqual(results, []);
        } finally {
            globalThis.fetch = origFetch;
        }
    });
});

// ---------------------------------------------------------------------------
// retrieveSupportTemplates
// ---------------------------------------------------------------------------

describe('retrieveSupportTemplates', () => {
    it('returns only support_template results', async () => {
        const rawResults = [
            { id: 't1', content: 'Config fix playbook', sourceType: 'support_template', similarity: 0.88 },
            { id: 'r1', content: 'Prior case', sourceType: 'support_approved_case', similarity: 0.82 },
        ];
        const origFetch = globalThis.fetch;
        globalThis.fetch = makeFetchOk(rawResults);
        try {
            const results = await retrieveSupportTemplates(makeQuery(), GW, TOKEN);
            assert.equal(results.length, 1);
            assert.equal(results[0]!.id, 't1');
        } finally {
            globalThis.fetch = origFetch;
        }
    });
});

// ---------------------------------------------------------------------------
// retrieveSupportLessons
// ---------------------------------------------------------------------------

describe('retrieveSupportLessons', () => {
    it('returns only patterns starting with support:lesson:', async () => {
        const patterns = [
            { pattern: 'support:lesson:config_error:ws-1:abc', summary: 'Check env vars first', confidence: 0.8 },
            { pattern: 'devops:lesson:reliability:ws-1:xyz', summary: 'Unrelated', confidence: 0.7 },
        ];
        const origFetch = globalThis.fetch;
        globalThis.fetch = makeFetchPatterns(patterns);
        try {
            const results = await retrieveSupportLessons(TENANT, WS, GW, TOKEN);
            assert.equal(results.length, 1);
            assert.ok(results[0]!.pattern?.startsWith('support:lesson:'));
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('returns empty array when fetch throws', async () => {
        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () => { throw new Error('down'); }) as unknown as typeof fetch;
        try {
            const results = await retrieveSupportLessons(TENANT, WS, GW, TOKEN);
            assert.deepEqual(results, []);
        } finally {
            globalThis.fetch = origFetch;
        }
    });
});

// ---------------------------------------------------------------------------
// buildSupportRagContext
// ---------------------------------------------------------------------------

describe('buildSupportRagContext', () => {
    it('returns empty contextBlock when all paths return nothing', async () => {
        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () => ({ ok: true, json: async () => ({ results: [], patterns: [] }) })) as unknown as typeof fetch;
        try {
            const ctx = await buildSupportRagContext(makeQuery(), GW, TOKEN, WS);
            assert.equal(ctx.contextBlock, '');
            assert.equal(ctx.similarCaseCount, 0);
            assert.equal(ctx.templateChunkCount, 0);
            assert.equal(ctx.lessonCount, 0);
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('builds contextBlock with prior work section when cases found', async () => {
        const origFetch = globalThis.fetch;
        let callIdx = 0;
        globalThis.fetch = (async () => {
            callIdx++;
            if (callIdx <= 2) {
                return { ok: true, json: async () => ({ results: [{ id: 'c1', content: 'Fixed Redis by increasing maxmemory', sourceType: 'support_approved_case', similarity: 0.91 }] }) };
            }
            return { ok: true, json: async () => ({ patterns: [] }) };
        }) as unknown as typeof fetch;
        try {
            const ctx = await buildSupportRagContext(makeQuery(), GW, TOKEN, WS);
            assert.ok(ctx.contextBlock.includes('Support Context'));
            assert.ok(ctx.contextBlock.includes('Similar Prior Case Resolutions'));
            assert.equal(ctx.similarCaseCount, 1);
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('respects config.useLessons:false', async () => {
        const origFetch = globalThis.fetch;
        let patternsCalled = false;
        globalThis.fetch = (async (url: string) => {
            if (String(url).includes('patterns')) patternsCalled = true;
            return { ok: true, json: async () => ({ results: [], patterns: [] }) };
        }) as unknown as typeof fetch;
        try {
            await buildSupportRagContext(makeQuery(), GW, TOKEN, WS, { usePriorWork: true, useTemplates: true, useLessons: false });
            assert.equal(patternsCalled, false);
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('sets retrievedAt to a valid ISO timestamp', async () => {
        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () => ({ ok: true, json: async () => ({ results: [], patterns: [] }) })) as unknown as typeof fetch;
        try {
            const before = Date.now();
            const ctx = await buildSupportRagContext(makeQuery(), GW, TOKEN, WS);
            const after = Date.now();
            const at = new Date(ctx.retrievedAt).getTime();
            assert.ok(at >= before && at <= after);
        } finally {
            globalThis.fetch = origFetch;
        }
    });
});

// ---------------------------------------------------------------------------
// ingestApprovedCase
// ---------------------------------------------------------------------------

describe('ingestApprovedCase', () => {
    it('returns true on successful write', async () => {
        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () => ({ ok: true })) as unknown as typeof fetch;
        try {
            const result = await ingestApprovedCase({
                tenantId: TENANT,
                caseTitle: 'Redis fix',
                documentType: 'case_resolution',
                content: 'Increased Redis maxmemory-policy to allkeys-lru.',
                gatewayBaseUrl: GW,
                serviceToken: TOKEN,
            });
            assert.equal(result, true);
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('returns false when fetch throws', async () => {
        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () => { throw new Error('network'); }) as unknown as typeof fetch;
        try {
            const result = await ingestApprovedCase({
                tenantId: TENANT,
                caseTitle: 'Redis fix',
                documentType: 'case_resolution',
                content: 'Some fix content.',
                gatewayBaseUrl: GW,
                serviceToken: TOKEN,
            });
            assert.equal(result, false);
        } finally {
            globalThis.fetch = origFetch;
        }
    });

    it('returns false when response is not ok', async () => {
        const origFetch = globalThis.fetch;
        globalThis.fetch = (async () => ({ ok: false, status: 422 })) as unknown as typeof fetch;
        try {
            const result = await ingestApprovedCase({
                tenantId: TENANT,
                caseTitle: 'Redis fix',
                documentType: 'case_resolution',
                content: 'Some fix content.',
                gatewayBaseUrl: GW,
                serviceToken: TOKEN,
            });
            assert.equal(result, false);
        } finally {
            globalThis.fetch = origFetch;
        }
    });
});
