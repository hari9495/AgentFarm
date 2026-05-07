import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../../lib/internal-session';
import type { BrowserActionType, PrismaClient } from '@prisma/client';

let prismaClientSingleton: PrismaClient | undefined;

const resolveRiskLevelFromActionType = (actionType: BrowserActionType): 'low' | 'medium' | 'high' => {
    switch (actionType) {
        case 'submit':
            return 'high';
        case 'fill':
        case 'select':
        case 'key_press':
            return 'medium';
        default:
            return 'low';
    }
};

const getPrismaClient = async (): Promise<PrismaClient> => {
    if (prismaClientSingleton !== undefined) {
        return prismaClientSingleton;
    }

    if (!process.env.DATABASE_URL?.trim()) {
        throw new Error('DATABASE_URL is required for Prisma-backed session replay.');
    }

    try {
        const prismaModule = await import('@prisma/client');
        prismaClientSingleton = new prismaModule.PrismaClient();
        return prismaClientSingleton;
    } catch {
        throw new Error('Failed to initialize @prisma/client for session replay route.');
    }
};

const mapPrismaReplayRows = (session: {
    taskId: string;
    tenantId: string;
    agentInstanceId: string;
    id: string;
    actions: Array<{
        id: string;
        actionType: BrowserActionType;
        targetSelector: string;
        targetText: string;
        inputValue: string | null;
        pageUrl: string;
        screenshotBeforeUrl: string;
        screenshotAfterUrl: string;
        domSnapshotHashAfter: string | null;
        networkLog: unknown;
        durationMs: number;
        success: boolean;
        errorMessage: string | null;
        timestamp: Date;
        correctnessAssertion: unknown;
    }>;
}) => session.actions.map((action) => {
    const completedAt = action.timestamp.toISOString();
    const startedAt = new Date(action.timestamp.getTime() - Math.max(0, action.durationMs)).toISOString();
    const target = action.targetSelector || action.targetText || action.pageUrl;
    const networkRequests = Array.isArray(action.networkLog)
        ? action.networkLog as Array<{ method: string; url: string; status?: number }>
        : [];

    return {
        id: action.id,
        agentId: session.agentInstanceId,
        workspaceId: '',
        taskId: session.taskId,
        sessionId: session.id,
        actionType: action.actionType,
        target,
        payload: {
            targetText: action.targetText,
            inputValue: action.inputValue,
            pageUrl: action.pageUrl,
        },
        screenshotBeforeUrl: action.screenshotBeforeUrl,
        screenshotAfterUrl: action.screenshotAfterUrl,
        diffImageUrl: null,
        assertions: Array.isArray(action.correctnessAssertion)
            ? action.correctnessAssertion as Array<{ id: string; description: string; passed: boolean }>
            : [],
        verified: action.success,
        domSnapshotHash: action.domSnapshotHashAfter,
        networkRequests,
        evidenceBundle: {
            screenshotBefore: { url: action.screenshotBeforeUrl, provider: action.screenshotBeforeUrl.startsWith('http') ? 'azure_blob' : 'inline' },
            screenshotAfter: { url: action.screenshotAfterUrl, provider: action.screenshotAfterUrl.startsWith('http') ? 'azure_blob' : 'inline' },
            domCheckpoint: null,
            domSnapshotStored: false,
        },
        riskLevel: resolveRiskLevelFromActionType(action.actionType),
        startedAt,
        completedAt,
        durationMs: action.durationMs,
        success: action.success,
        errorMessage: action.errorMessage,
    };
});

export async function GET(
    _request: Request,
    context: { params: Promise<{ sessionId: string }> },
) {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json({ error: 'forbidden', message: 'Internal session required.' }, { status: 403 });
    }

    const { sessionId } = await context.params;
    if (!sessionId || !sessionId.trim()) {
        return NextResponse.json({ error: 'invalid_request', message: 'sessionId is required.' }, { status: 400 });
    }

    try {
        const prisma = await getPrismaClient();
        const session = await prisma.agentSession.findUnique({
            where: { id: sessionId },
            select: {
                id: true,
                taskId: true,
                tenantId: true,
                agentInstanceId: true,
                actions: {
                    orderBy: { sequence: 'asc' },
                    select: {
                        id: true,
                        actionType: true,
                        targetSelector: true,
                        targetText: true,
                        inputValue: true,
                        pageUrl: true,
                        screenshotBeforeUrl: true,
                        screenshotAfterUrl: true,
                        domSnapshotHashAfter: true,
                        networkLog: true,
                        durationMs: true,
                        success: true,
                        errorMessage: true,
                        timestamp: true,
                        correctnessAssertion: true,
                    },
                },
            },
        });

        if (session) {
            const items = mapPrismaReplayRows(session).map((item) => ({
                ...item,
                sessionId,
            }));

            return NextResponse.json({ sessionId, total: items.length, source: 'prisma', items });
        }

        return NextResponse.json(
            { error: 'session_not_found', message: 'Session not found in Prisma-backed audit store.' },
            { status: 404 },
        );
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown database error';
        return NextResponse.json(
            { error: 'audit_read_failed', message },
            { status: 500 },
        );
    }
}
