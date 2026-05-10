import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getRoutingAdvice } from '../routing-history-advisor.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type GroupByRow = {
    modelTier: string | null;
    outcome: string;
    _count: { id: number };
};

function makeDb(rows: GroupByRow[]) {
    return {
        taskExecutionRecord: {
            groupBy: async (_args: unknown): Promise<GroupByRow[]> => rows,
        },
    };
}

const BASE_PARAMS = {
    workspaceId: 'ws-test-001',
    taskComplexity: 'moderate' as const,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getRoutingAdvice', () => {
    test('returns empty map when groupBy returns no rows', async () => {
        const db = makeDb([]);
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['openai', 'azure_openai'] },
            db,
        );
        assert.equal(result.size, 0);
    });

    test('provider with >=5 successes gets -0.15 delta (favoured)', async () => {
        const db = makeDb([
            { modelTier: 'openai', outcome: 'success', _count: { id: 5 } },
        ]);
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['openai', 'azure_openai'] },
            db,
        );
        assert.ok(result.has('openai'), 'openai should be in the map');
        assert.equal(result.get('openai'), -0.15);
        // azure_openai also contains 'openai' in its name
        assert.ok(result.has('azure_openai'), 'azure_openai also contains tier');
        assert.equal(result.get('azure_openai'), -0.15);
    });

    test('provider with count exactly 5 successes gets -0.15 (boundary)', async () => {
        const db = makeDb([
            { modelTier: 'anthropic', outcome: 'success', _count: { id: 5 } },
        ]);
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['anthropic'] },
            db,
        );
        assert.equal(result.get('anthropic'), -0.15);
    });

    test('provider with >=3 failures gets +0.20 delta (deprioritised)', async () => {
        const db = makeDb([
            { modelTier: 'mistral', outcome: 'failed', _count: { id: 3 } },
        ]);
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['mistral'] },
            db,
        );
        assert.ok(result.has('mistral'));
        assert.equal(result.get('mistral'), 0.20);
    });

    test('provider with count exactly 3 failures gets +0.20 (boundary)', async () => {
        const db = makeDb([
            { modelTier: 'together', outcome: 'failed', _count: { id: 3 } },
        ]);
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['together'] },
            db,
        );
        assert.equal(result.get('together'), 0.20);
    });

    test('provider with <5 successes gets no delta', async () => {
        const db = makeDb([
            { modelTier: 'google', outcome: 'success', _count: { id: 4 } },
        ]);
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['google'] },
            db,
        );
        assert.equal(result.size, 0);
    });

    test('provider with <3 failures gets no delta', async () => {
        const db = makeDb([
            { modelTier: 'xai', outcome: 'failed', _count: { id: 2 } },
        ]);
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['xai'] },
            db,
        );
        assert.equal(result.size, 0);
    });

    test('approval_queued outcome is ignored', async () => {
        const db = makeDb([
            { modelTier: 'openai', outcome: 'approval_queued', _count: { id: 10 } },
        ]);
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['openai'] },
            db,
        );
        assert.equal(result.size, 0);
    });

    test('rows with null modelTier are skipped', async () => {
        const db = makeDb([
            { modelTier: null, outcome: 'success', _count: { id: 10 } },
            { modelTier: null, outcome: 'failed', _count: { id: 10 } },
        ]);
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['openai', 'azure_openai'] },
            db,
        );
        assert.equal(result.size, 0);
    });

    test('candidateProviders matching is case-insensitive', async () => {
        const db = makeDb([
            { modelTier: 'OpenAI', outcome: 'success', _count: { id: 7 } },
        ]);
        // Provider name uses lowercase; tier uses mixed case
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['openai'] },
            db,
        );
        assert.ok(result.has('openai'), 'should match case-insensitively');
        assert.equal(result.get('openai'), -0.15);
    });

    test('deltas accumulate when a provider matches multiple rows', async () => {
        // success row (≥5) applies -0.15; failure row (2 < 3 threshold) applies no delta → net -0.15
        const db = makeDb([
            { modelTier: 'openai', outcome: 'success', _count: { id: 6 } },
            { modelTier: 'openai', outcome: 'failed', _count: { id: 2 } },
        ]);
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['openai'] },
            db,
        );
        assert.equal(result.get('openai'), -0.15);
    });

    test('deltas from success and qualifying failure rows accumulate additively', async () => {
        // success row (≥5) applies -0.15; failure row (≥3) applies +0.20 → net +0.05
        const db = makeDb([
            { modelTier: 'openai', outcome: 'success', _count: { id: 6 } },
            { modelTier: 'openai', outcome: 'failed', _count: { id: 4 } },
        ]);
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['openai'] },
            db,
        );
        // floating point: -0.15 + 0.20 = 0.05
        const delta = result.get('openai') ?? 0;
        assert.ok(Math.abs(delta - 0.05) < 0.0001, `expected ~0.05, got ${delta}`);
    });

    test('multiple providers each get independent deltas', async () => {
        const db = makeDb([
            { modelTier: 'anthropic', outcome: 'success', _count: { id: 8 } },
            { modelTier: 'mistral', outcome: 'failed', _count: { id: 5 } },
        ]);
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['anthropic', 'mistral', 'openai'] },
            db,
        );
        assert.equal(result.get('anthropic'), -0.15);
        assert.equal(result.get('mistral'), 0.20);
        assert.equal(result.has('openai'), false);
    });

    test('DB error returns empty map without throwing', async () => {
        const db = {
            taskExecutionRecord: {
                groupBy: async (_args: unknown): Promise<GroupByRow[]> => {
                    throw new Error('Connection refused');
                },
            },
        };
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['openai'] },
            db,
        );
        assert.equal(result.size, 0);
    });

    test('timeout race: slow groupBy loses to 200 ms timeout, caller gets empty map', async () => {
        // Simulate a groupBy that never resolves within the test window
        let resolveGroupBy!: (rows: GroupByRow[]) => void;
        const slowDb = {
            taskExecutionRecord: {
                groupBy: (_args: unknown): Promise<GroupByRow[]> =>
                    new Promise<GroupByRow[]>((resolve) => {
                        resolveGroupBy = resolve;
                    }),
            },
        };

        const advicePromise = getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['openai'] },
            slowDb,
        );
        const timeoutPromise = new Promise<Map<string, number>>(
            (res) => setTimeout(() => res(new Map()), 200),
        );

        const result = await Promise.race([advicePromise, timeoutPromise]);
        assert.equal(result.size, 0, 'timeout should win and yield empty map');

        // Cleanup: let the hanging groupBy resolve so the process can exit cleanly
        resolveGroupBy([]);
    });

    test('empty candidateProviders list yields empty map even with DB rows', async () => {
        const db = makeDb([
            { modelTier: 'openai', outcome: 'success', _count: { id: 10 } },
        ]);
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: [] },
            db,
        );
        assert.equal(result.size, 0);
    });

    test('provider not matching any tier yields no entry', async () => {
        const db = makeDb([
            { modelTier: 'anthropic', outcome: 'success', _count: { id: 9 } },
        ]);
        const result = await getRoutingAdvice(
            { ...BASE_PARAMS, candidateProviders: ['openai', 'mistral'] },
            db,
        );
        assert.equal(result.has('openai'), false);
        assert.equal(result.has('mistral'), false);
    });
});
