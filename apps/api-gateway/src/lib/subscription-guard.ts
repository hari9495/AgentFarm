import type { FastifyRequest } from 'fastify';
import type { SessionPayload } from './session-auth.js';

// Minimal reply surface needed — FastifyReply satisfies this in production.
// Using a structural sub-type keeps the test mock simple without `as any` casts.
type MinimalReply = {
    code(n: number): any;
    send(b: unknown): any;
    header(k: string, v: string): any;
};

// db.ts exports `prisma` directly — use the same dynamic-import pattern as billing.ts
// so tests can inject a mock via the optional prisma parameter.
const getPrisma = async () => {
    const db = await import('./db.js');
    return db.prisma;
};

type ResolvedPrisma = Awaited<ReturnType<typeof getPrisma>>;

const SUSPENDED_ALLOWLIST: string[] = [
    '/v1/auth',
    '/v1/billing',
    '/v1/audit',
    '/health',
];

export async function checkSubscription(
    request: FastifyRequest,
    reply: MinimalReply,
    prisma?: ResolvedPrisma,
): Promise<void> {
    const session = (request as any).session as SessionPayload | undefined;
    if (!session) {
        return;
    }

    const url = (request.url.split('?')[0]) ?? '';
    const allowed = SUSPENDED_ALLOWLIST.some((prefix) => url.startsWith(prefix));
    if (allowed) {
        return;
    }

    const db = prisma ?? await getPrisma();

    const tenantSub = await db.tenantSubscription.findUnique({
        where: { tenantId: session.tenantId },
        select: { status: true },
    });

    if (tenantSub?.status === 'suspended') {
        reply.code(403).send({
            code: 'SUBSCRIPTION_SUSPENDED',
            message: 'Your subscription has been suspended. Please renew to continue.',
        });
        return;
    }

    if (tenantSub?.status === 'expired') {
        reply.header('x-subscription-warning', 'expired');
        return;
    }
}

// Used by agent-runtime guard (Phase C) to enforce per-agent subscription.
// Agent-level active subscription overrides a suspended tenant subscription.
export async function isSubscriptionSuspended(
    tenantId: string,
    agentId: string,
    prisma?: ResolvedPrisma,
): Promise<boolean> {
    const db = prisma ?? await getPrisma();

    // Agent-level override: if the agent has an active subscription, allow it
    // even if the tenant subscription is suspended.
    const agentSub = await db.agentSubscription.findUnique({
        where: { tenantId_agentId: { tenantId, agentId } },
        select: { status: true },
    });

    if (agentSub?.status === 'active') {
        return false;
    }

    const tenantSub = await db.tenantSubscription.findUnique({
        where: { tenantId },
        select: { status: true },
    });

    if (tenantSub?.status === 'suspended') {
        return true;
    }

    return false;
}
