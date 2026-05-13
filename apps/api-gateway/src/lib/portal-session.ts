import type { PrismaClient } from '@prisma/client';
import type { FastifyRequest, FastifyReply } from 'fastify';

export const PORTAL_SESSION_COOKIE = 'portal_session';

export type PortalSessionData = {
    accountId: string;
    tenantId: string;
    email: string;
    role: string;
    displayName: string | null;
};

const readPortalToken = (request: FastifyRequest): string | null => {
    const rawCookie = request.headers['cookie'];
    if (typeof rawCookie !== 'string') return null;
    const item = rawCookie
        .split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith(`${PORTAL_SESSION_COOKIE}=`));
    if (!item) return null;
    return decodeURIComponent(item.slice(PORTAL_SESSION_COOKIE.length + 1));
};

/**
 * Verify a portal session token against the database.
 * Deletes expired sessions automatically.
 * Updates lastSeenAt on valid sessions.
 * Returns null if the token is invalid or expired.
 */
export const verifyPortalSession = async (
    token: string,
    prisma: PrismaClient,
): Promise<PortalSessionData | null> => {
    const record = await prisma.tenantPortalSession.findUnique({
        where: { token },
        include: { account: true },
    });
    if (!record) return null;

    if (record.expiresAt < new Date()) {
        await prisma.tenantPortalSession.delete({ where: { id: record.id } });
        return null;
    }

    await prisma.tenantPortalSession.update({
        where: { id: record.id },
        data: { lastSeenAt: new Date() },
    });

    return {
        accountId: record.account.id,
        tenantId: record.tenantId,
        email: record.account.email,
        role: record.account.role as string,
        displayName: record.account.displayName,
    };
};

/**
 * Middleware helper: reads the portal_session cookie, verifies it, and replies
 * with 401 if invalid.  Returns null when the caller must halt further processing.
 *
 * Usage (in a portal data route):
 *   const session = await requirePortalSession(request, reply, prisma);
 *   if (!session) return;
 */
export const requirePortalSession = async (
    request: FastifyRequest,
    reply: FastifyReply,
    prisma: PrismaClient,
): Promise<PortalSessionData | null> => {
    const token = readPortalToken(request);
    if (!token) {
        void reply.code(401).send({ error: 'unauthorized' });
        return null;
    }
    const data = await verifyPortalSession(token, prisma);
    if (!data) {
        void reply.code(401).send({ error: 'unauthorized' });
        return null;
    }
    return data;
};
