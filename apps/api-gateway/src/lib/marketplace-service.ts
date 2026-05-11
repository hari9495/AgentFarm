import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Runtime sync helper — fire-and-forget, never throws
// ---------------------------------------------------------------------------

function getRuntimeUrl(): string {
    return (process.env['AGENT_RUNTIME_URL'] ?? 'http://localhost:3001').replace(/\/+$/, '');
}

function syncRuntime(path: string, body: Record<string, unknown>): void {
    void globalThis.fetch(`${getRuntimeUrl()}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }).catch((err: unknown) => console.error('[marketplace-service] runtime sync failed', err));
}

// ---------------------------------------------------------------------------
// listListings
// ---------------------------------------------------------------------------

export async function listListings(
    prisma: PrismaClient,
    filter?: { status?: string; tag?: string },
): Promise<unknown[]> {
    const status = filter?.status ?? 'active';
    const rows = await (prisma as any).marketplaceListing.findMany({
        where: { status },
        orderBy: { createdAt: 'desc' },
    });
    if (!filter?.tag) return rows;
    const tag = filter.tag;
    return rows.filter((row: any) => {
        const tags = Array.isArray(row.tags) ? row.tags : [];
        return tags.includes(tag);
    });
}

// ---------------------------------------------------------------------------
// installSkill
// ---------------------------------------------------------------------------

export async function installSkill(
    prisma: PrismaClient,
    input: {
        tenantId: string;
        skillId: string;
        approvedPermissions?: string[];
        pinVersion?: boolean;
        workspaceKey?: string;
    },
): Promise<unknown> {
    const db = prisma as any;

    const listing = await db.marketplaceListing.findUnique({
        where: { skillId: input.skillId },
    });
    if (!listing || listing.status !== 'active') {
        const err = new Error('listing_not_found');
        (err as any).statusCode = 404;
        throw err;
    }

    const existing = await db.marketplaceInstall.findUnique({
        where: { tenantId_skillId: { tenantId: input.tenantId, skillId: input.skillId } },
    });

    let install: unknown;
    if (existing) {
        if (existing.status === 'installed') {
            const err = new Error('already_installed');
            (err as any).statusCode = 409;
            throw err;
        }
        // Re-install: was previously uninstalled
        install = await db.marketplaceInstall.update({
            where: { tenantId_skillId: { tenantId: input.tenantId, skillId: input.skillId } },
            data: {
                status: 'installed',
                uninstalledAt: null,
                approvedPermissions: input.approvedPermissions ?? [],
                pinVersion: input.pinVersion ?? false,
            },
        });
    } else {
        install = await db.marketplaceInstall.create({
            data: {
                tenantId: input.tenantId,
                skillId: input.skillId,
                listingId: listing.id,
                approvedPermissions: input.approvedPermissions ?? [],
                pinVersion: input.pinVersion ?? false,
                status: 'installed',
            },
        });
    }

    syncRuntime('/runtime/marketplace/install', {
        skill_id: input.skillId,
        approved_permissions: input.approvedPermissions ?? [],
        pin_version: input.pinVersion ?? false,
        workspace_key: input.workspaceKey ?? null,
    });

    return install;
}

// ---------------------------------------------------------------------------
// uninstallSkill
// ---------------------------------------------------------------------------

export async function uninstallSkill(
    prisma: PrismaClient,
    input: { tenantId: string; skillId: string; workspaceKey?: string },
): Promise<unknown> {
    const db = prisma as any;

    const existing = await db.marketplaceInstall.findUnique({
        where: { tenantId_skillId: { tenantId: input.tenantId, skillId: input.skillId } },
    });

    if (!existing || existing.status === 'uninstalled') {
        const err = new Error('install_not_found');
        (err as any).statusCode = 404;
        throw err;
    }

    const updated = await db.marketplaceInstall.update({
        where: { tenantId_skillId: { tenantId: input.tenantId, skillId: input.skillId } },
        data: {
            status: 'uninstalled',
            uninstalledAt: new Date(),
        },
    });

    syncRuntime('/runtime/marketplace/uninstall', {
        skill_id: input.skillId,
        workspace_key: input.workspaceKey ?? null,
    });

    return updated;
}

// ---------------------------------------------------------------------------
// publishListing
// ---------------------------------------------------------------------------

export async function publishListing(
    prisma: PrismaClient,
    input: {
        skillId: string;
        name: string;
        description?: string;
        version: string;
        author?: string;
        permissions?: string[];
        source?: string;
        tags?: string[];
    },
): Promise<unknown> {
    const db = prisma as any;

    const listing = await db.marketplaceListing.upsert({
        where: { skillId: input.skillId },
        create: {
            skillId: input.skillId,
            name: input.name,
            description: input.description ?? null,
            version: input.version,
            author: input.author ?? null,
            permissions: input.permissions ?? [],
            source: input.source ?? null,
            tags: input.tags ?? [],
            status: 'active',
        },
        update: {
            name: input.name,
            description: input.description ?? null,
            version: input.version,
            author: input.author ?? null,
            permissions: input.permissions ?? [],
            source: input.source ?? null,
            tags: input.tags ?? [],
        },
    });

    syncRuntime('/runtime/marketplace/catalog/skills', {
        id: input.skillId,
        name: input.name,
        version: input.version,
        permissions: input.permissions ?? [],
        source: input.source ?? null,
    });

    return listing;
}
