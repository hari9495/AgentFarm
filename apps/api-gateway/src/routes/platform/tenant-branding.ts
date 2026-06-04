/**
 * tenant-branding.ts — White-label branding config per tenant.
 *
 * GET  /v1/tenant/branding         — read current branding (any session)
 * PUT  /v1/tenant/branding         — upsert branding (operator+ session)
 * GET  /portal/data/branding       — read branding via portal session (public-ish)
 */

import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { ROLE_RANK } from '../../lib/require-role.js';

const getPrisma = async () => {
    const db = await import('../../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    role?: string;
    expiresAt: number;
};

type BrandingBody = {
    company_name?: unknown;
    logo_url?: unknown;
    primary_color?: unknown;
    portal_title?: unknown;
    favicon_url?: unknown;
};

type BrandingRow = {
    id: string;
    tenantId: string;
    companyName: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    portalTitle: string | null;
    faviconUrl: string | null;
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/;

const isValidHttpUrl = (v: string) => {
    try {
        const u = new URL(v);
        return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
        return false;
    }
};

const serializeBranding = (row: BrandingRow | null) => ({
    company_name: row?.companyName ?? null,
    logo_url: row?.logoUrl ?? null,
    primary_color: row?.primaryColor ?? null,
    portal_title: row?.portalTitle ?? null,
    favicon_url: row?.faviconUrl ?? null,
    configured: row !== null,
});

export type RegisterTenantBrandingRoutesOptions = {
    getSession: (req: FastifyRequest) => SessionContext | null;
    prisma?: PrismaClient;
};

export const registerTenantBrandingRoutes = async (
    app: FastifyInstance,
    options: RegisterTenantBrandingRoutesOptions,
): Promise<void> => {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // ── GET /v1/tenant/branding ───────────────────────────────────────────────
    app.get('/v1/tenant/branding', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });

        const prisma = await resolvePrisma();
        const rows = await prisma.$queryRaw<BrandingRow[]>`
            SELECT * FROM "TenantBranding" WHERE "tenantId" = ${session.tenantId} LIMIT 1
        `;
        return reply.send({ branding: serializeBranding(rows[0] ?? null) });
    });

    // ── PUT /v1/tenant/branding ───────────────────────────────────────────────
    app.put<{ Body: BrandingBody }>('/v1/tenant/branding', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['operator'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'operator' });
        }

        const body = request.body ?? {};
        const companyName = typeof body.company_name === 'string' ? body.company_name.trim() || null : undefined;
        const logoUrl = typeof body.logo_url === 'string'
            ? (body.logo_url.trim() === '' ? null : body.logo_url.trim())
            : undefined;
        const primaryColor = typeof body.primary_color === 'string'
            ? (body.primary_color.trim() === '' ? null : body.primary_color.trim())
            : undefined;
        const portalTitle = typeof body.portal_title === 'string' ? body.portal_title.trim() || null : undefined;
        const faviconUrl = typeof body.favicon_url === 'string'
            ? (body.favicon_url.trim() === '' ? null : body.favicon_url.trim())
            : undefined;

        // Validate URL fields
        for (const [field, val] of [['logo_url', logoUrl], ['favicon_url', faviconUrl]] as [string, string | null | undefined][]) {
            if (val && !isValidHttpUrl(val)) {
                return reply.code(400).send({ error: `${field} must be a valid URL.` });
            }
        }
        if (primaryColor && !HEX_COLOR_RE.test(primaryColor)) {
            return reply.code(400).send({ error: 'primary_color must be a valid hex color (e.g. #0052cc).' });
        }

        const prisma = await resolvePrisma();
        const existing = await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM "TenantBranding" WHERE "tenantId" = ${session.tenantId} LIMIT 1
        `;

        const now = new Date();
        if (existing.length === 0) {
            const id = randomBytes(12).toString('hex');
            await prisma.$executeRaw`
                INSERT INTO "TenantBranding" ("id","tenantId","companyName","logoUrl","primaryColor","portalTitle","faviconUrl","createdAt","updatedAt")
                VALUES (${id}, ${session.tenantId},
                    ${companyName ?? null}, ${logoUrl ?? null}, ${primaryColor ?? null},
                    ${portalTitle ?? null}, ${faviconUrl ?? null},
                    ${now}, ${now})
            `;
        } else {
            const updates: string[] = ['"updatedAt" = NOW()'];
            if (companyName !== undefined) updates.push(`"companyName" = ${companyName === null ? 'NULL' : `'${companyName.replace(/'/g, "''")}'`}`);
            if (logoUrl !== undefined) updates.push(`"logoUrl" = ${logoUrl === null ? 'NULL' : `'${logoUrl.replace(/'/g, "''")}'`}`);
            if (primaryColor !== undefined) updates.push(`"primaryColor" = ${primaryColor === null ? 'NULL' : `'${primaryColor.replace(/'/g, "''")}'`}`);
            if (portalTitle !== undefined) updates.push(`"portalTitle" = ${portalTitle === null ? 'NULL' : `'${portalTitle.replace(/'/g, "''")}'`}`);
            if (faviconUrl !== undefined) updates.push(`"faviconUrl" = ${faviconUrl === null ? 'NULL' : `'${faviconUrl.replace(/'/g, "''")}'`}`);
            await prisma.$executeRawUnsafe(
                `UPDATE "TenantBranding" SET ${updates.join(', ')} WHERE "tenantId" = $1`,
                session.tenantId,
            );
        }

        const updated = await prisma.$queryRaw<BrandingRow[]>`
            SELECT * FROM "TenantBranding" WHERE "tenantId" = ${session.tenantId} LIMIT 1
        `;
        return reply.send({ branding: serializeBranding(updated[0] ?? null) });
    });

    // ── DELETE /v1/tenant/branding ────────────────────────────────────────────
    app.delete('/v1/tenant/branding', async (request, reply) => {
        const session = options.getSession(request);
        if (!session) return reply.code(401).send({ error: 'unauthorized' });
        if ((ROLE_RANK[session.role ?? ''] ?? 0) < (ROLE_RANK['admin'] ?? 99)) {
            return reply.code(403).send({ error: 'insufficient_role', required: 'admin' });
        }
        const prisma = await resolvePrisma();
        await prisma.$executeRaw`DELETE FROM "TenantBranding" WHERE "tenantId" = ${session.tenantId}`;
        return reply.code(204).send();
    });

    // ── GET /portal/data/branding — portal session ────────────────────────────
    // Called by the website portal to load branding without internal auth.
    app.get<{ Querystring: { tenant_id?: string } }>('/portal/data/branding', async (request, reply) => {
        const tenantId = request.query.tenant_id?.trim();
        if (!tenantId) return reply.code(400).send({ error: 'tenant_id is required.' });

        const prisma = await resolvePrisma();
        const rows = await prisma.$queryRaw<BrandingRow[]>`
            SELECT * FROM "TenantBranding" WHERE "tenantId" = ${tenantId} LIMIT 1
        `;
        return reply.send({ branding: serializeBranding(rows[0] ?? null) });
    });
};
