import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ROLE_RANK } from '../lib/require-role.js';
import {
    listListings,
    installSkill,
    uninstallSkill,
    publishListing,
} from '../lib/marketplace-service.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

export type RegisterMarketplaceRoutesOptions = {
    getSession: (req: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerMarketplaceRoutes = async (
    app: FastifyInstance,
    options: RegisterMarketplaceRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // ── GET /v1/marketplace/listings — viewer+ ──────────────────────────────
    app.get<{ Querystring: { status?: string; tag?: string } }>(
        '/v1/marketplace/listings',
        async (req, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
                return reply.code(403).send({
                    error: 'insufficient_role',
                    required: 'viewer',
                    actual: session.role,
                });
            }

            const db = await resolvePrisma();
            const listings = await listListings(db, {
                status: req.query.status,
                tag: req.query.tag,
            });
            return reply.code(200).send({ listings });
        },
    );

    // ── GET /v1/marketplace/listings/:listingId — viewer+ ───────────────────
    app.get<{ Params: { listingId: string } }>(
        '/v1/marketplace/listings/:listingId',
        async (req, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
                return reply.code(403).send({
                    error: 'insufficient_role',
                    required: 'viewer',
                    actual: session.role,
                });
            }

            const db = await resolvePrisma();
            const listing = await (db as any).marketplaceListing.findUnique({
                where: { id: req.params.listingId },
            });
            if (!listing) return reply.code(404).send({ error: 'not_found' });
            return reply.code(200).send(listing);
        },
    );

    // ── POST /v1/marketplace/listings — admin+ ──────────────────────────────
    app.post<{
        Body: {
            skillId?: unknown;
            name?: unknown;
            description?: unknown;
            version?: unknown;
            author?: unknown;
            permissions?: unknown;
            source?: unknown;
            tags?: unknown;
        };
    }>(
        '/v1/marketplace/listings',
        async (req, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['admin'] ?? 99)) {
                return reply.code(403).send({
                    error: 'insufficient_role',
                    required: 'admin',
                    actual: session.role,
                });
            }

            const { skillId, name, description, version, author, permissions, source, tags } =
                req.body ?? {};

            if (typeof skillId !== 'string' || skillId.trim().length === 0) {
                return reply.code(400).send({ error: 'skillId is required' });
            }
            if (typeof name !== 'string' || name.trim().length === 0) {
                return reply.code(400).send({ error: 'name is required' });
            }
            if (typeof version !== 'string' || version.trim().length === 0) {
                return reply.code(400).send({ error: 'version is required' });
            }

            const db = await resolvePrisma();
            const listing = await publishListing(db, {
                skillId: skillId.trim(),
                name: name.trim(),
                description: typeof description === 'string' ? description : undefined,
                version: version.trim(),
                author: typeof author === 'string' ? author : undefined,
                permissions: Array.isArray(permissions)
                    ? permissions.filter((p): p is string => typeof p === 'string')
                    : undefined,
                source: typeof source === 'string' ? source : undefined,
                tags: Array.isArray(tags)
                    ? tags.filter((t): t is string => typeof t === 'string')
                    : undefined,
            });
            return reply.code(201).send(listing);
        },
    );

    // ── PATCH /v1/marketplace/listings/:listingId — admin+ ──────────────────
    app.patch<{
        Params: { listingId: string };
        Body: {
            name?: unknown;
            description?: unknown;
            version?: unknown;
            status?: unknown;
            tags?: unknown;
        };
    }>(
        '/v1/marketplace/listings/:listingId',
        async (req, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['admin'] ?? 99)) {
                return reply.code(403).send({
                    error: 'insufficient_role',
                    required: 'admin',
                    actual: session.role,
                });
            }

            const db = await resolvePrisma();
            const existing = await (db as any).marketplaceListing.findUnique({
                where: { id: req.params.listingId },
            });
            if (!existing) return reply.code(404).send({ error: 'not_found' });

            const { name, description, version, status, tags } = req.body ?? {};
            const update: Record<string, unknown> = {};
            if (typeof name === 'string') update['name'] = name;
            if (typeof description === 'string') update['description'] = description;
            if (typeof version === 'string') update['version'] = version;
            if (typeof status === 'string') update['status'] = status;
            if (Array.isArray(tags)) {
                update['tags'] = tags.filter((t): t is string => typeof t === 'string');
            }

            const updated = await (db as any).marketplaceListing.update({
                where: { id: req.params.listingId },
                data: update,
            });
            return reply.code(200).send(updated);
        },
    );

    // ── GET /v1/marketplace/installs — viewer+ ──────────────────────────────
    app.get(
        '/v1/marketplace/installs',
        async (req, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
                return reply.code(403).send({
                    error: 'insufficient_role',
                    required: 'viewer',
                    actual: session.role,
                });
            }

            const db = await resolvePrisma();
            const installs = await (db as any).marketplaceInstall.findMany({
                where: { tenantId: session.tenantId },
                include: {
                    listing: { select: { name: true, version: true, skillId: true } },
                },
                orderBy: { installedAt: 'desc' },
            });
            return reply.code(200).send({ installs });
        },
    );

    // ── POST /v1/marketplace/installs — operator+ ───────────────────────────
    app.post<{
        Body: {
            skillId?: unknown;
            approvedPermissions?: unknown;
            pinVersion?: unknown;
            workspaceKey?: unknown;
        };
    }>(
        '/v1/marketplace/installs',
        async (req, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
                return reply.code(403).send({
                    error: 'insufficient_role',
                    required: 'operator',
                    actual: session.role,
                });
            }

            const { skillId, approvedPermissions, pinVersion, workspaceKey } = req.body ?? {};

            if (typeof skillId !== 'string' || skillId.trim().length === 0) {
                return reply.code(400).send({ error: 'skillId is required' });
            }

            const db = await resolvePrisma();
            try {
                const install = await installSkill(db, {
                    tenantId: session.tenantId,
                    skillId: skillId.trim(),
                    approvedPermissions: Array.isArray(approvedPermissions)
                        ? approvedPermissions.filter((p): p is string => typeof p === 'string')
                        : [],
                    pinVersion: typeof pinVersion === 'boolean' ? pinVersion : false,
                    workspaceKey: typeof workspaceKey === 'string' ? workspaceKey : undefined,
                });
                return reply.code(201).send(install);
            } catch (err: any) {
                return reply.code(err.statusCode ?? 500).send({ error: err.message });
            }
        },
    );

    // ── GET /v1/marketplace/installs/:skillId — viewer+ ────────────────────
    app.get<{ Params: { skillId: string } }>(
        '/v1/marketplace/installs/:skillId',
        async (req, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['viewer'] ?? 99)) {
                return reply.code(403).send({ error: 'insufficient_role', required: 'viewer', actual: session.role });
            }

            const db = await resolvePrisma();
            const install = await (db as any).marketplaceInstall.findUnique({
                where: { tenantId_skillId: { tenantId: session.tenantId, skillId: req.params.skillId } },
                include: { listing: { select: { name: true, version: true, skillId: true } } },
            });
            if (!install) return reply.code(404).send({ error: 'not_found' });
            return reply.code(200).send(install);
        },
    );

    // ── PATCH /v1/marketplace/installs/:skillId — operator+ ─────────────────
    app.patch<{
        Params: { skillId: string };
        Body: { enabled?: unknown; config?: unknown };
    }>(
        '/v1/marketplace/installs/:skillId',
        async (req, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
                return reply.code(403).send({ error: 'insufficient_role', required: 'operator', actual: session.role });
            }

            const db = await resolvePrisma();
            const existing = await (db as any).marketplaceInstall.findUnique({
                where: { tenantId_skillId: { tenantId: session.tenantId, skillId: req.params.skillId } },
            });
            if (!existing) return reply.code(404).send({ error: 'not_found' });

            const { enabled } = req.body ?? {};
            const update: Record<string, unknown> = {};
            if (typeof enabled === 'boolean') {
                // Map enabled flag onto the status field (no dedicated column in schema)
                update['status'] = enabled ? 'installed' : 'disabled';
            }

            if (Object.keys(update).length === 0) {
                return reply.code(400).send({ error: 'no_fields', message: 'Provide at least one field to update.' });
            }

            const updated = await (db as any).marketplaceInstall.update({
                where: { tenantId_skillId: { tenantId: session.tenantId, skillId: req.params.skillId } },
                data: update,
                include: { listing: { select: { name: true, version: true, skillId: true } } },
            });
            return reply.code(200).send(updated);
        },
    );

    // ── DELETE /v1/marketplace/installs/:skillId — operator+ ────────────────
    app.delete<{
        Params: { skillId: string };
        Querystring: { workspaceKey?: string };
    }>(
        '/v1/marketplace/installs/:skillId',
        async (req, reply) => {
            const session = options.getSession(req);
            if (!session) return reply.code(401).send({ error: 'unauthorized' });
            if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
                return reply.code(403).send({
                    error: 'insufficient_role',
                    required: 'operator',
                    actual: session.role,
                });
            }

            const db = await resolvePrisma();
            try {
                const install = await uninstallSkill(db, {
                    tenantId: session.tenantId,
                    skillId: req.params.skillId,
                    workspaceKey: req.query.workspaceKey,
                });
                return reply.code(200).send(install);
            } catch (err: any) {
                return reply.code(err.statusCode ?? 500).send({ error: err.message });
            }
        },
    );
};
