/**
 * onboarding-knowledge-seed.test.ts
 *
 * Unit tests for seedOnboardingKnowledge.
 * Uses a stub embedFn and a minimal prisma mock.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { seedOnboardingKnowledge } from './onboarding-knowledge-seed.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type WriteCall = { content: string; sourceType: string };

function makeMocks() {
    const writeCalls: WriteCall[] = [];

    const embedFn = async (_text: string): Promise<number[]> => [0.1, 0.2, 0.3];

    const prismaMock = {
        // writeSemanticMemory uses $executeRaw for the INSERT.
        // The tagged-template call passes interpolated values as rest args.
        // Positions in the INSERT: id, tenantId, botId, content, sourceUrl, sourceType, embeddingModel, ...
        $executeRaw: async (_query: unknown, ...values: unknown[]) => {
            // INSERT positions (after gen_random_uuid()::text which is SQL, not a value):
            // 0=tenantId, 1=botId, 2=content, 3=sourceUrl, 4=sourceType, 5=deployment, 6=vector
            const content = values[2] as string;
            const sourceType = values[4] as string;
            if (content && sourceType) {
                writeCalls.push({ content, sourceType });
            }
            return 1;
        },
        // Keep $queryRaw as no-op so callers that use it don't throw
        $queryRaw: async () => [],
    };

    return { embedFn, prismaMock, writeCalls };
}

const baseParams = {
    botId: 'bot-1',
    tenantId: 'tenant-1',
    workspaceId: 'ws-1',
    roleKey: 'developer',
    botName: 'Alice',
    repoUrl: 'https://github.com/acme/repo',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('seedOnboardingKnowledge', () => {
    it('skips when embedFn is null', async () => {
        const { prismaMock } = makeMocks();
        const result = await seedOnboardingKnowledge(baseParams, null, prismaMock as any);
        assert.equal(result.skipped, true);
        assert.equal(result.seededChunks, 0);
        assert.ok(result.reason?.includes('embedFn'));
    });

    it('seeds role identity and working principles for developer', async () => {
        const { embedFn, prismaMock, writeCalls } = makeMocks();
        const result = await seedOnboardingKnowledge(baseParams, embedFn, prismaMock as any);

        assert.equal(result.skipped, false);
        assert.ok(result.seededChunks >= 2);
        assert.ok(writeCalls.some((c) => c.sourceType === 'onboarding_role_identity'));
        assert.ok(writeCalls.some((c) => c.sourceType === 'onboarding_working_principles'));
    });

    it('includes tech stack chunk when provided', async () => {
        const { embedFn, prismaMock, writeCalls } = makeMocks();
        await seedOnboardingKnowledge(
            { ...baseParams, techStack: 'TypeScript, React, PostgreSQL, pnpm monorepo' },
            embedFn,
            prismaMock as any,
        );
        const techChunk = writeCalls.find((c) => c.sourceType === 'onboarding_tech_stack');
        assert.ok(techChunk, 'Expected onboarding_tech_stack chunk');
        assert.ok(techChunk.content.includes('TypeScript'));
    });

    it('includes team conventions chunk when provided', async () => {
        const { embedFn, prismaMock, writeCalls } = makeMocks();
        await seedOnboardingKnowledge(
            { ...baseParams, teamConventions: 'Use conventional commits, PR reviews required before merge.' },
            embedFn,
            prismaMock as any,
        );
        const convChunk = writeCalls.find((c) => c.sourceType === 'onboarding_team_conventions');
        assert.ok(convChunk, 'Expected onboarding_team_conventions chunk');
        assert.ok(convChunk.content.includes('conventional commits'));
    });

    it('skips tech/conventions chunks when not provided', async () => {
        const { embedFn, prismaMock, writeCalls } = makeMocks();
        await seedOnboardingKnowledge(baseParams, embedFn, prismaMock as any);
        assert.ok(!writeCalls.some((c) => c.sourceType === 'onboarding_tech_stack'));
        assert.ok(!writeCalls.some((c) => c.sourceType === 'onboarding_team_conventions'));
    });

    it('uses unknown role gracefully', async () => {
        const { embedFn, prismaMock, writeCalls } = makeMocks();
        const result = await seedOnboardingKnowledge(
            { ...baseParams, roleKey: 'unknown_role_xyz' },
            embedFn,
            prismaMock as any,
        );
        assert.ok(result.seededChunks >= 2);
        const roleChunk = writeCalls.find((c) => c.sourceType === 'onboarding_role_identity');
        assert.ok(roleChunk?.content.includes('AgentFarm'));
    });

    it('still seeds partial chunks even if one write throws', async () => {
        let callCount = 0;
        const flakyPrisma = {
            // writeSemanticMemory uses $executeRaw — throw on the first call to simulate DB error
            $executeRaw: async (_query: unknown, ..._values: unknown[]) => {
                callCount++;
                if (callCount === 1) throw new Error('DB error');
                return 1;
            },
            $queryRaw: async () => [],
        };
        const embedFn = async (_text: string): Promise<number[]> => [0.1, 0.2];
        const result = await seedOnboardingKnowledge(baseParams, embedFn, flakyPrisma as any);
        // First chunk failed but the rest should still succeed
        assert.ok(result.seededChunks >= 1);
    });
});
