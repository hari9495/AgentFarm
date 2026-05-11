import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// snapshotBotConfig
// ---------------------------------------------------------------------------
// Captures the current Bot config fields into a new BotConfigVersion row.
// versionNumber is MAX(existing) + 1, or 1 if none exist.
// Never calls getPrisma() — caller must provide the prisma instance.
// ---------------------------------------------------------------------------

export async function snapshotBotConfig(
    prisma: PrismaClient,
    botId: string,
    tenantId: string,
    createdBy: string,
    changeNote?: string,
) {
    const bot = await prisma.bot.findUnique({
        where: { id: botId },
        select: { id: true, role: true, status: true },
    });

    if (!bot) {
        const err = new Error(`Bot not found: ${botId}`);
        (err as any).statusCode = 404;
        throw err;
    }

    const existing = await prisma.botConfigVersion.aggregate({
        where: { botId },
        _max: { versionNumber: true },
    });

    const versionNumber = (existing._max.versionNumber ?? 0) + 1;

    const version = await prisma.botConfigVersion.create({
        data: {
            botId,
            tenantId,
            versionNumber,
            role: bot.role,
            status: String(bot.status),
            roleVersion: null,
            policyPackVersion: null,
            brainConfig: undefined,
            changeNote: changeNote ?? null,
            createdBy,
        },
    });

    return version;
}

// ---------------------------------------------------------------------------
// applyBotConfigVersion
// ---------------------------------------------------------------------------
// Fetches the target BotConfigVersion, snapshots the current state, then
// updates the Bot row to match the target version's fields.
// Never calls getPrisma() — caller must provide the prisma instance.
// ---------------------------------------------------------------------------

export async function applyBotConfigVersion(
    prisma: PrismaClient,
    botId: string,
    tenantId: string,
    versionId: string,
    createdBy: string,
) {
    const version = await prisma.botConfigVersion.findUnique({
        where: { id: versionId },
    });

    if (!version || version.tenantId !== tenantId || version.botId !== botId) {
        const err = new Error(`BotConfigVersion not found: ${versionId}`);
        (err as any).statusCode = 404;
        throw err;
    }

    // Snapshot current state before applying restore
    await snapshotBotConfig(
        prisma,
        botId,
        tenantId,
        createdBy,
        `Restored to version ${version.versionNumber}`,
    );

    // Update Bot row with target version's fields
    const updated = await prisma.bot.update({
        where: { id: botId },
        data: {
            role: version.role,
            status: version.status as any,
        },
    });

    return updated;
}
