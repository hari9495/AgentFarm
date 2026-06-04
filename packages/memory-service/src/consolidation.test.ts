import test from 'node:test';
import assert from 'node:assert/strict';
import {
    consolidateLessons,
    parseLessonPattern,
    buildConsolidatedSummary,
    computeConsolidatedConfidence,
    CONSOLIDATION_THRESHOLD,
} from './consolidation.js';
import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLesson(overrides: {
    id?: string;
    tenantId?: string;
    workspaceId?: string;
    pattern: string;
    summary?: string | null;
    confidence?: number;
    observedCount?: number;
    lastSeen?: Date;
}) {
    return {
        id: overrides.id ?? `id-${Math.random()}`,
        tenantId: overrides.tenantId ?? 'tenant-1',
        workspaceId: overrides.workspaceId ?? 'ws-1',
        pattern: overrides.pattern,
        summary: overrides.summary !== undefined ? overrides.summary : `[scope] Lesson about ${overrides.pattern}`,
        confidence: overrides.confidence ?? 0.7,
        observedCount: overrides.observedCount ?? 1,
        lastSeen: overrides.lastSeen ?? new Date('2026-01-01T00:00:00Z'),
    };
}

function makeMockPrisma(rows: ReturnType<typeof makeLesson>[]) {
    const executeRawArgs: unknown[][] = [];

    const mock = {
        $queryRaw: (..._args: unknown[]) => Promise.resolve(rows),
        $executeRaw: (...args: unknown[]) => {
            executeRawArgs.push(args);
            return Promise.resolve(1);
        },
        _executeRawArgs: executeRawArgs,
    };

    return mock as unknown as PrismaClient & { _executeRawArgs: unknown[][] };
}

// ---------------------------------------------------------------------------
// parseLessonPattern
// ---------------------------------------------------------------------------

test('parseLessonPattern — new format with lessonId', () => {
    const result = parseLessonPattern('ba:lesson:scope:ws-abc:lesson-uuid-123');
    assert.deepEqual(result, { agentPrefix: 'ba', category: 'scope' });
});

test('parseLessonPattern — old format without lessonId', () => {
    const result = parseLessonPattern('ba:lesson:scope:ws-abc');
    assert.deepEqual(result, { agentPrefix: 'ba', category: 'scope' });
});

test('parseLessonPattern — consolidated entry returns null', () => {
    assert.equal(parseLessonPattern('ba:lesson:scope:ws-abc:consolidated'), null);
});

test('parseLessonPattern — unrelated pattern returns null', () => {
    assert.equal(parseLessonPattern('ba:draft_brd:success'), null);
});

test('parseLessonPattern — multi-word agent prefix', () => {
    const result = parseLessonPattern('customer_support:lesson:empathy:ws-xyz:id-1');
    assert.deepEqual(result, { agentPrefix: 'customer_support', category: 'empathy' });
});

// ---------------------------------------------------------------------------
// buildConsolidatedSummary
// ---------------------------------------------------------------------------

test('buildConsolidatedSummary — strips [category] prefix and deduplicates', () => {
    const lessons = [
        makeLesson({ pattern: 'ba:lesson:scope:ws-1:a', summary: '[scope] Do not include DevOps items' }),
        makeLesson({ pattern: 'ba:lesson:scope:ws-1:b', summary: '[scope] Do not include DevOps items' }), // duplicate
        makeLesson({ pattern: 'ba:lesson:scope:ws-1:c', summary: '[scope] Always confirm scope boundaries' }),
    ];
    const result = buildConsolidatedSummary('scope', lessons);
    assert.ok(result.includes('Consolidated (3 instances)'));
    assert.ok(result.includes('1. Do not include DevOps items'));
    assert.ok(result.includes('2. Always confirm scope boundaries'));
    // Duplicate should not appear twice
    assert.equal((result.match(/Do not include DevOps items/g) ?? []).length, 1);
});

test('buildConsolidatedSummary — fallback when all summaries are too short', () => {
    const lessons = [
        makeLesson({ pattern: 'ba:lesson:scope:ws-1:a', summary: '[scope] ok' }),
        makeLesson({ pattern: 'ba:lesson:scope:ws-1:b', summary: null }),
    ];
    const result = buildConsolidatedSummary('scope', lessons);
    assert.ok(result.includes('Consolidated pattern (2 instances)'));
});

test('buildConsolidatedSummary — caps at 4 bullet points', () => {
    const lessons = Array.from({ length: 10 }, (_, i) =>
        makeLesson({ pattern: `ba:lesson:scope:ws-1:${i}`, summary: `[scope] Unique lesson number ${i} with enough text` }),
    );
    const result = buildConsolidatedSummary('scope', lessons);
    const bulletCount = (result.match(/\d+\. /g) ?? []).length;
    assert.equal(bulletCount, 4);
});

// ---------------------------------------------------------------------------
// computeConsolidatedConfidence
// ---------------------------------------------------------------------------

test('computeConsolidatedConfidence — grows with count, caps at 0.95', () => {
    const base = Array.from({ length: 5 }, () =>
        makeLesson({ pattern: 'ba:lesson:scope:ws-1:x', confidence: 0.7 }),
    );
    const conf5 = computeConsolidatedConfidence(base);
    assert.ok(conf5 > 0.7, 'confidence should increase with 5 samples');

    const large = Array.from({ length: 100 }, () =>
        makeLesson({ pattern: 'ba:lesson:scope:ws-1:x', confidence: 0.9 }),
    );
    const confLarge = computeConsolidatedConfidence(large);
    assert.equal(confLarge, 0.95, 'confidence should be capped at 0.95');
});

// ---------------------------------------------------------------------------
// consolidateLessons
// ---------------------------------------------------------------------------

test('consolidateLessons — below threshold produces no consolidation', async () => {
    const rows = Array.from({ length: CONSOLIDATION_THRESHOLD - 1 }, (_, i) =>
        makeLesson({ pattern: `ba:lesson:scope:ws-1:${i}` }),
    );
    const prisma = makeMockPrisma(rows);
    const result = await consolidateLessons(prisma);

    assert.equal(result.groupsScanned, 1);
    assert.equal(result.groupsConsolidated, 0);
    assert.equal(result.patternsWritten, 0);
    assert.equal(prisma._executeRawArgs.length, 0);
});

test('consolidateLessons — at threshold produces one consolidated pattern', async () => {
    const rows = Array.from({ length: CONSOLIDATION_THRESHOLD }, (_, i) =>
        makeLesson({ pattern: `ba:lesson:scope:ws-1:${i}` }),
    );
    const prisma = makeMockPrisma(rows);
    const result = await consolidateLessons(prisma);

    assert.equal(result.groupsScanned, 1);
    assert.equal(result.groupsConsolidated, 1);
    assert.equal(result.patternsWritten, 1);
    assert.equal(prisma._executeRawArgs.length, 1);
});

test('consolidateLessons — multiple groups, only qualifying ones are consolidated', async () => {
    const rows = [
        // ba:scope:ws-1 — 5 lessons (qualifies)
        ...Array.from({ length: 5 }, (_, i) =>
            makeLesson({ pattern: `ba:lesson:scope:ws-1:${i}`, summary: `[scope] Scope lesson ${i} with enough text` }),
        ),
        // ba:clarity:ws-1 — 3 lessons (below threshold)
        ...Array.from({ length: 3 }, (_, i) =>
            makeLesson({ pattern: `ba:lesson:clarity:ws-1:${i}`, summary: `[clarity] Clarity lesson ${i}` }),
        ),
        // pm:scope:ws-1 — 6 lessons (qualifies)
        ...Array.from({ length: 6 }, (_, i) =>
            makeLesson({ pattern: `pm:lesson:scope:ws-1:${i}`, summary: `[scope] PM scope lesson ${i} with enough text` }),
        ),
    ];

    const prisma = makeMockPrisma(rows);
    const result = await consolidateLessons(prisma);

    assert.equal(result.groupsScanned, 3);
    assert.equal(result.groupsConsolidated, 2);
    assert.equal(result.patternsWritten, 2);
    assert.equal(prisma._executeRawArgs.length, 2);
});

test('consolidateLessons — tenantId filter ignores other tenants', async () => {
    const rows = [
        // tenant-1: 5 ba:scope lessons (qualifies)
        ...Array.from({ length: 5 }, (_, i) =>
            makeLesson({ tenantId: 'tenant-1', pattern: `ba:lesson:scope:ws-1:${i}` }),
        ),
        // tenant-2: 5 ba:scope lessons — should be excluded by filter
        ...Array.from({ length: 5 }, (_, i) =>
            makeLesson({ tenantId: 'tenant-2', pattern: `ba:lesson:scope:ws-1:${i}` }),
        ),
    ];

    const prisma = makeMockPrisma(rows);
    const result = await consolidateLessons(prisma, { tenantId: 'tenant-1' });

    assert.equal(result.groupsScanned, 1);
    assert.equal(result.groupsConsolidated, 1);
});

test('consolidateLessons — custom threshold override', async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
        makeLesson({ pattern: `ba:lesson:scope:ws-1:${i}` }),
    );
    const prisma = makeMockPrisma(rows);

    // With default threshold (5): no consolidation
    const r1 = await consolidateLessons(prisma);
    assert.equal(r1.groupsConsolidated, 0);

    // With threshold 3: consolidates
    const r2 = await consolidateLessons(prisma, { threshold: 3 });
    assert.equal(r2.groupsConsolidated, 1);
});

test('consolidateLessons — summed observedCount is written', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
        makeLesson({ pattern: `ba:lesson:scope:ws-1:${i}`, observedCount: 3 }),
    );
    const prisma = makeMockPrisma(rows);
    await consolidateLessons(prisma);

    // The 6th interpolated value in the $executeRaw call is totalObservedCount
    // Args: [TemplateStringsArray, tenantId, workspaceId, pattern, summary, confidence, totalObservedCount]
    const callArgs = prisma._executeRawArgs[0]!;
    const totalObservedCount = callArgs[6] as number;
    assert.equal(totalObservedCount, 15); // 5 lessons × 3 observedCount each
});

test('consolidateLessons — consolidated pattern key has :consolidated suffix', async () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
        makeLesson({ workspaceId: 'ws-99', pattern: `ba:lesson:scope:ws-99:${i}` }),
    );
    const prisma = makeMockPrisma(rows);
    await consolidateLessons(prisma);

    const callArgs = prisma._executeRawArgs[0]!;
    const writtenPattern = callArgs[3] as string;
    assert.equal(writtenPattern, 'ba:lesson:scope:ws-99:consolidated');
});

test('consolidateLessons — empty table returns zero counts', async () => {
    const prisma = makeMockPrisma([]);
    const result = await consolidateLessons(prisma);
    assert.deepEqual(result, { groupsScanned: 0, groupsConsolidated: 0, patternsWritten: 0 });
});
