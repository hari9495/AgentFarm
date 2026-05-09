import { PrismaClient } from '@prisma/client';

// Mirror of RuntimeMemoryStore from runtime-server.ts (that type is not exported)
type RuntimeMemoryStore = {
    readMemoryForTask: (workspaceId: string, maxResults?: number) => Promise<{
        recentMemories: unknown[];
        memoryCountThisWeek: number;
        mostCommonConnectors: string[];
        approvalRejectionRate: number;
        codeReviewPatterns?: string[];
    }>;
    writeMemoryAfterTask: (request: {
        workspaceId: string;
        tenantId: string;
        taskId: string;
        actionsTaken: string[];
        approvalOutcomes: Array<{
            action: string;
            decision: 'approved' | 'rejected';
            reason?: string;
        }>;
        connectorsUsed: string[];
        llmProvider?: string;
        executionStatus: 'success' | 'approval_required' | 'failed';
        summary: string;
        correlationId: string;
    }) => Promise<void>;
    getRepoKnowledge: (
        tenantId: string,
        workspaceId: string,
        repoName: string,
        role: string
    ) => Promise<Array<{ key: string; value: unknown }>>;
    setRepoKnowledge: (
        tenantId: string,
        workspaceId: string,
        repoName: string,
        role: string,
        key: string,
        value: unknown
    ) => Promise<void>;
};

const deriveRepoName = (): string | null => {
    const fromEnv = process.env['GITHUB_REPO'];
    if (fromEnv) {
        return fromEnv;
    }
    const base = process.env['AF_WORKSPACE_BASE'];
    if (base) {
        return base.split(/[/\\]/).filter(Boolean).pop() ?? null;
    }
    return null;
};

export function createPrismaMemoryStore(prisma: PrismaClient): RuntimeMemoryStore {
    return {
        async readMemoryForTask(workspaceId: string, maxResults = 20) {
            try {
                const currentRepoName = deriveRepoName();

                const baseWhere = { workspaceId };
                const where = currentRepoName !== null
                    ? { ...baseWhere, OR: [{ repoName: currentRepoName }, { repoName: null }] }
                    : baseWhere;

                const records = await prisma.agentShortTermMemory.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    take: maxResults,
                });

                // Relevance ranking: score and re-sort records
                const now = Date.now();
                const oneDay = 24 * 60 * 60 * 1000;
                const sevenDays = 7 * oneDay;
                records.sort((a, b) => {
                    const score = (r: typeof a): number => {
                        let s = 0;
                        if (currentRepoName !== null && r.repoName === currentRepoName) s += 3;
                        const age = now - new Date(r.createdAt).getTime();
                        if (age < oneDay) {
                            s += 2;
                        } else if (age < sevenDays) {
                            s += 1;
                        }
                        if (r.executionStatus === 'success') s += 1;
                        return s;
                    };
                    return score(b) - score(a);
                });

                // Compute approval rejection rate
                let rejectedCount = 0;
                for (const record of records) {
                    const outcomes = record.approvalOutcomes as Array<{ decision: string }>;
                    if (Array.isArray(outcomes) && outcomes.some((o) => o.decision === 'rejected')) {
                        rejectedCount += 1;
                    }
                }
                const approvalRejectionRate =
                    records.length > 0
                        ? Math.round((rejectedCount / records.length) * 100) / 100
                        : 0;

                // Compute most common connectors
                const connectorCounts: Record<string, number> = {};
                for (const record of records) {
                    const connectors = record.connectorsUsed as string[];
                    if (Array.isArray(connectors)) {
                        for (const connector of connectors) {
                            connectorCounts[connector] = (connectorCounts[connector] ?? 0) + 1;
                        }
                    }
                }
                const mostCommonConnectors = Object.entries(connectorCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([name]) => name);

                // Code review patterns as "actionType:executionStatus" strings
                const codeReviewPatterns = records.map((r) => {
                    const actions = r.actionsTaken as string[];
                    const actionType = Array.isArray(actions) ? (actions[0] ?? 'unknown') : 'unknown';
                    return `${actionType}:${r.executionStatus ?? 'unknown'}`;
                });

                return {
                    recentMemories: records,
                    memoryCountThisWeek: records.length,
                    mostCommonConnectors,
                    approvalRejectionRate,
                    codeReviewPatterns,
                };
            } catch {
                return {
                    recentMemories: [],
                    memoryCountThisWeek: 0,
                    mostCommonConnectors: [],
                    approvalRejectionRate: 0,
                    codeReviewPatterns: [],
                };
            }
        },

        async writeMemoryAfterTask(request) {
            try {
                const repoName = deriveRepoName();
                const expiresAt = null;

                await prisma.agentShortTermMemory.create({
                    data: {
                        workspaceId: request.workspaceId,
                        tenantId: request.tenantId,
                        taskId: request.taskId,
                        actionsTaken: request.actionsTaken,
                        approvalOutcomes: request.approvalOutcomes,
                        connectorsUsed: request.connectorsUsed,
                        llmProvider: request.llmProvider ?? null,
                        executionStatus: request.executionStatus,
                        summary: request.summary,
                        correlationId: request.correlationId,
                        expiresAt,
                        ...(repoName !== null ? { repoName } : {}),
                    },
                });

                const pattern = request.actionsTaken[0] ?? 'unknown';
                await prisma.agentLongTermMemory.upsert({
                    where: {
                        tenantId_pattern: {
                            tenantId: request.tenantId,
                            pattern,
                        },
                    },
                    update: {
                        observedCount: { increment: 1 },
                        confidence: { increment: 0.01 },
                        lastSeen: new Date(),
                    },
                    create: {
                        tenantId: request.tenantId,
                        workspaceId: request.workspaceId,
                        pattern,
                        confidence: 0.5,
                        observedCount: 1,
                        lastSeen: new Date(),
                        ...(repoName !== null ? { repoName } : {}),
                    },
                });
            } catch (err) {
                console.error('[prisma-memory-store] writeMemoryAfterTask failed:', err);
            }
        },

        async getRepoKnowledge(tenantId, workspaceId, repoName, role) {
            try {
                const rows = await prisma.agentRepoKnowledge.findMany({
                    where: { tenantId, workspaceId, repoName, role },
                    select: { key: true, value: true },
                });
                return rows.map((r) => ({ key: r.key, value: r.value as unknown }));
            } catch {
                return [];
            }
        },

        async setRepoKnowledge(tenantId, workspaceId, repoName, role, key, value) {
            try {
                await prisma.agentRepoKnowledge.upsert({
                    where: {
                        tenantId_repoName_role_key: { tenantId, repoName, role, key },
                    },
                    update: { value: value as object },
                    create: { tenantId, workspaceId, repoName, role, key, value: value as object },
                });
            } catch (err) {
                console.error('[prisma-memory-store] setRepoKnowledge failed:', err);
            }
        },
    };
}
