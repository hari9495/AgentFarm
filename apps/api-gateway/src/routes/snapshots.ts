import type { FastifyInstance, FastifyRequest } from 'fastify';

const getPrisma = async () => {
    const db = await import('../lib/db.js');
    return db.prisma;
};

type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    expiresAt: number;
};

type SnapshotRecord = {
    id: string;
    botId: string;
    tenantId: string;
    workspaceId: string;
    roleKey: string;
    roleVersion: string;
    policyPackVersion: string;
    allowedConnectorTools: string[];
    allowedActions: string[];
    brainConfig: unknown;
    languageTier: string;
    speechProvider: string;
    translationProvider: string;
    ttsProvider: string;
    avatarEnabled: boolean;
    avatarProvider: string;
    snapshotVersion: number;
    snapshotChecksum: string | null;
    source: string;
    frozenAt: Date;
    createdAt: Date;
};

type SnapshotRepo = {
    findLatestByBotId(input: {
        botId: string;
        tenantId: string;
    }): Promise<SnapshotRecord | null>;
    findAllByBotId(input: {
        botId: string;
        tenantId: string;
        limit: number;
        before?: Date;
    }): Promise<SnapshotRecord[]>;
};

type RegisterSnapshotRoutesOptions = {
    getSession: (request: FastifyRequest) => SessionContext | null;
    repo?: SnapshotRepo;
};

type BotParams = {
    botId: string;
};

type ListQuerystring = {
    limit?: string;
    before?: string;
};

const formatSnapshot = (s: SnapshotRecord) => ({
    id: s.id,
    bot_id: s.botId,
    tenant_id: s.tenantId,
    workspace_id: s.workspaceId,
    role_key: s.roleKey,
    role_version: s.roleVersion,
    policy_pack_version: s.policyPackVersion,
    allowed_connector_tools: s.allowedConnectorTools,
    allowed_actions: s.allowedActions,
    brain_config: s.brainConfig,
    language_tier: s.languageTier,
    speech_provider: s.speechProvider,
    translation_provider: s.translationProvider,
    tts_provider: s.ttsProvider,
    avatar_enabled: s.avatarEnabled,
    avatar_provider: s.avatarProvider,
    snapshot_version: s.snapshotVersion,
    snapshot_checksum: s.snapshotChecksum ?? null,
    source: s.source,
    frozen_at: s.frozenAt.toISOString(),
    created_at: s.createdAt.toISOString(),
});

const createDefaultSnapshotRepo = (): SnapshotRepo => ({
    async findLatestByBotId({ botId, tenantId }) {
        const prisma = await getPrisma();
        const row = await prisma.botCapabilitySnapshot.findFirst({
            where: { botId, tenantId },
            orderBy: { snapshotVersion: 'desc' },
        });
        return row as SnapshotRecord | null;
    },

    async findAllByBotId({ botId, tenantId, limit, before }) {
        const prisma = await getPrisma();
        const rows = await prisma.botCapabilitySnapshot.findMany({
            where: {
                botId,
                tenantId,
                ...(before ? { frozenAt: { lt: before } } : {}),
            },
            orderBy: { snapshotVersion: 'desc' },
            take: limit,
        });
        return rows as SnapshotRecord[];
    },
});

export const registerSnapshotRoutes = async (
    app: FastifyInstance,
    options: RegisterSnapshotRoutesOptions,
) => {
    const { getSession } = options;
    const repo = options.repo ?? createDefaultSnapshotRepo();

    // GET /v1/bots/:botId/capability-snapshot/latest
    // Returns the latest persisted capability snapshot for a bot.
    app.get<{ Params: BotParams }>(
        '/v1/bots/:botId/capability-snapshot/latest',
        async (request, reply) => {
            const session = getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized' });
            }

            const { botId } = request.params;

            const snapshot = await repo.findLatestByBotId({
                botId,
                tenantId: session.tenantId,
            });

            if (!snapshot) {
                return reply.code(404).send({
                    error: 'snapshot_not_found',
                    message: `No capability snapshot found for bot ${botId}`,
                });
            }

            return { snapshot: formatSnapshot(snapshot) };
        },
    );

    // GET /v1/bots/:botId/capability-snapshot/history
    // Returns a paginated history of capability snapshots for a bot, newest first.
    app.get<{ Params: BotParams; Querystring: ListQuerystring }>(
        '/v1/bots/:botId/capability-snapshot/history',
        async (request, reply) => {
            const session = getSession(request);
            if (!session) {
                return reply.code(401).send({ error: 'unauthorized' });
            }

            const { botId } = request.params;

            const rawLimit = parseInt(request.query.limit ?? '20', 10);
            const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 20;

            let before: Date | undefined;
            if (request.query.before) {
                const parsed = new Date(request.query.before);
                if (!Number.isNaN(parsed.getTime())) {
                    before = parsed;
                }
            }

            const snapshots = await repo.findAllByBotId({
                botId,
                tenantId: session.tenantId,
                limit,
                before,
            });

            return {
                bot_id: botId,
                count: snapshots.length,
                snapshots: snapshots.map(formatSnapshot),
            };
        },
    );
};
