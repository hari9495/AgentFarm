import { PrismaClient } from '@prisma/client';

type TaskComplexity = 'simple' | 'moderate' | 'complex';

type GroupByRow = {
    modelTier: string | null;
    outcome: string;
    _count: { id: number };
};

type DbHandle = {
    taskExecutionRecord: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        groupBy(args: any): Promise<GroupByRow[]>;
    };
};

let _prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
    if (!_prisma) {
        _prisma = new PrismaClient();
    }
    return _prisma;
}

/**
 * Returns a score-nudge map for candidate providers based on the last 7 days of
 * TaskExecutionRecord history for the given workspace.
 *
 * Negative delta means "prefer this provider" (lower composite score wins).
 * Positive delta means "deprioritise this provider" (higher composite score loses).
 *
 * Never throws — on any DB error it returns an empty Map so routing continues
 * without disruption.
 *
 * @param params   - workspaceId, taskComplexity (context), candidateProviders list
 * @param db       - optional DB handle; injected in tests, omit in production
 */
export async function getRoutingAdvice(
    params: {
        workspaceId: string;
        taskComplexity: TaskComplexity;
        candidateProviders: string[];
    },
    db?: DbHandle,
): Promise<Map<string, number>> {
    try {
        const activeDb: DbHandle = db ?? (getPrisma() as unknown as DbHandle);
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const groups: GroupByRow[] = await activeDb.taskExecutionRecord.groupBy({
            by: ['modelTier', 'outcome'],
            where: {
                workspaceId: params.workspaceId,
                executedAt: { gte: since },
            },
            _count: { id: true },
        });

        const result = new Map<string, number>();

        for (const group of groups) {
            const { modelTier, outcome } = group;
            if (!modelTier) continue;

            const count = group._count.id;
            let delta = 0;

            if (outcome === 'success' && count >= 5) {
                delta = -0.15;
            } else if (outcome === 'failed' && count >= 3) {
                delta = 0.20;
            } else {
                continue;
            }

            const tierLower = modelTier.toLowerCase();
            for (const provider of params.candidateProviders) {
                if (provider.toLowerCase().includes(tierLower)) {
                    const current = result.get(provider) ?? 0;
                    result.set(provider, current + delta);
                }
            }
        }

        return result;
    } catch (err) {
        console.error('[routing-advisor]', err);
        return new Map();
    }
}
