import { NextResponse } from 'next/server';
import { getInternalSessionAuthHeader } from '../../../lib/internal-session';
import { prisma } from '../../../lib/prisma';

export async function GET() {
    const authHeader = await getInternalSessionAuthHeader();
    if (!authHeader) {
        return NextResponse.json(
            { error: 'forbidden', message: 'Internal session required.' },
            { status: 403 },
        );
    }

    try {
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
