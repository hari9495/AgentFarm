import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';

/**
 * Unified Governance Policy REST API (Phases 2 + 3).
 *
 * One active `GovernancePolicy` exists per `(tenant, scope, scopeRef)`. This route
 * publishes the FULL desired rule set for a scope as one combined `rulesJson`
 * document — blocked actions (Phase 2) AND connector/MCP access (Phase 3) — so the
 * two runtime enforcers (`getActiveRoleBlocklist`, `getActiveConnectorPolicy`) each
 * read what they need from the same document.
 *
 * Tighten-only: only `deny` rules (incl. `mode:'read_only'`) are written. Session-
 * authed; `tenantId` always from session.
 */

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type Options = { getSession: (request: FastifyRequest) => SessionContext | null };

type Rule = {
    actionType: string;
    effect: 'deny';
    connector?: string;
    tool?: string;
    mode?: 'read_only';
};

type ConnectorInput = { connector?: string; readOnly?: boolean; deniedVerbs?: unknown };

const cleanStrings = (v: unknown): string[] =>
    Array.isArray(v)
        ? Array.from(new Set(v.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).map((s) => s.trim())))
        : [];

export async function registerGovernancePolicyRoutes(
    app: FastifyInstance,
    prisma: PrismaClient,
    options: Options,
) {
    const { getSession } = options;
    const on = (m: 'get' | 'post' | 'delete', p: string, h: (req: FastifyRequest, res: FastifyReply) => Promise<unknown>) => {
        (app as any)[m](`/v1${p}`, h);
        (app as any)[m](`/api/v1${p}`, h); // deprecated alias
    };

    // ========== CREATE + PUBLISH (combined rule document) ==========
    on('post', '/governance/policies', async (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        const body = (req.body ?? {}) as {
            scope?: string;
            roleKey?: string;
            name?: string;
            description?: string;
            blockedActions?: unknown;
            connectors?: unknown;
            deniedTools?: unknown;
        };

        const scope = body.scope === 'tenant' || body.scope === 'role' ? body.scope : null;
        if (!scope) return res.status(400).send({ error: "scope must be 'tenant' or 'role'" });
        const roleKey = typeof body.roleKey === 'string' ? body.roleKey.trim() : '';
        if (scope === 'role' && !roleKey) return res.status(400).send({ error: 'roleKey is required for role scope' });
        const scopeRef = scope === 'role' ? roleKey : '';

        // Build the combined rule set.
        const rules: Rule[] = [];
        for (const action of cleanStrings(body.blockedActions)) {
            rules.push({ actionType: action, effect: 'deny' });
        }
        const connectors = Array.isArray(body.connectors) ? (body.connectors as ConnectorInput[]) : [];
        for (const c of connectors) {
            const connector = typeof c?.connector === 'string' ? c.connector.trim() : '';
            if (!connector) continue;
            if (c.readOnly) rules.push({ actionType: '*', effect: 'deny', connector, mode: 'read_only' });
            for (const verb of cleanStrings(c.deniedVerbs)) {
                rules.push({ actionType: verb, effect: 'deny', connector });
            }
        }
        for (const tool of cleanStrings(body.deniedTools)) {
            rules.push({ actionType: '*', effect: 'deny', tool });
        }

        if (rules.length === 0) {
            return res.status(400).send({ error: 'at least one rule (blockedActions, connectors, or deniedTools) is required' });
        }

        try {
            const created = await prisma.$transaction(async (tx: any) => {
                const priorActive = await tx.governancePolicy.findMany({
                    where: { tenantId: session.tenantId, scope, scopeRef, status: 'active' },
                });
                for (const p of priorActive) {
                    await tx.governancePolicy.update({ where: { id: p.id }, data: { status: 'archived' } });
                }
                const top = await tx.governancePolicy.findFirst({
                    where: { tenantId: session.tenantId, scope, scopeRef },
                    orderBy: { version: 'desc' },
                });
                const version = (Number(top?.version) || 0) + 1;
                return tx.governancePolicy.create({
                    data: {
                        tenantId: session.tenantId,
                        scope,
                        scopeRef,
                        version,
                        status: 'active',
                        name: body.name?.trim() || `${scope === 'role' ? roleKey : 'tenant'} policy v${version}`,
                        description: body.description?.trim() || null,
                        rulesJson: rules as unknown as object,
                        createdBy: session.userId,
                        updatedBy: session.userId,
                    },
                });
            });
            return res.status(201).send({ policy: created, message: 'Policy published' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to publish policy: ${msg}` });
        }
    });

    // ========== GET active policy for a scope ==========
    on('get', '/governance/policies', async (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });

        const { scope, roleKey } = (req.query ?? {}) as { scope?: string; roleKey?: string };
        const sc = scope === 'tenant' || scope === 'role' ? scope : 'role';
        const scopeRef = sc === 'role' ? (roleKey ?? '') : '';
        try {
            const policy = await prisma.governancePolicy.findFirst({
                where: { tenantId: session.tenantId, scope: sc, scopeRef, status: 'active' },
                orderBy: { version: 'desc' },
            });
            return res.send({ policy: policy ?? null });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to load policy: ${msg}` });
        }
    });

    // ========== ARCHIVE ==========
    on('delete', '/governance/policies/:policyId', async (req, res) => {
        const session = getSession(req);
        if (!session) return res.status(401).send({ error: 'Unauthorized' });
        try {
            const { policyId } = req.params as { policyId: string };
            const policy = await prisma.governancePolicy.findUnique({ where: { id: policyId } });
            if (!policy) return res.status(404).send({ error: 'Policy not found' });
            if (policy.tenantId !== session.tenantId) return res.status(403).send({ error: 'Forbidden' });
            await prisma.governancePolicy.update({ where: { id: policyId }, data: { status: 'archived', updatedBy: session.userId } });
            return res.send({ message: 'Policy archived', policyId });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to archive policy: ${msg}` });
        }
    });
}
