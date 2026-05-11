import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';
import type { PrismaClient } from '@prisma/client';

let prismaClientSingleton: PrismaClient | undefined;

const getPrismaClient = async (): Promise<PrismaClient> => {
    if (prismaClientSingleton !== undefined) {
        return prismaClientSingleton;
    }

    if (!process.env.DATABASE_URL?.trim()) {
        throw new Error('DATABASE_URL is required for Prisma-backed session index.');
    }

    try {
        const prismaModule = await import('@prisma/client');
        prismaClientSingleton = new prismaModule.PrismaClient();
        return prismaClientSingleton;
    } catch {
        throw new Error('Failed to initialize @prisma/client for sessions index route.');
    }
};

export async function GET() {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    try {
        const prisma = await getPrismaClient();
        const sessions = await prisma.agentSession.findMany({
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: {
                id: true,
                taskId: true,
                status: true,
                startedAt: true,
                createdAt: true,
            },
        });

        return NextResponse.json({ sessions, total: sessions.length });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown database error';
        return NextResponse.json(
            { error: 'audit_read_failed', message },
            { status: 500 },
        );
    }
}
