/**
 * Repro Pack & Run Recovery Routes
 *
 * POST /v1/runs/:runId/resume                          — resume a crashed run
 * POST /v1/workspaces/:wsId/repro-packs               — create a repro pack
 * GET  /v1/workspaces/:wsId/repro-packs/:packId       — fetch pack + manifest
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import type { SessionContext } from './ci-failures.js';

const VALID_RESUME_STRATEGIES = new Set(['last_checkpoint', 'full_restart', 'rollback', 'snapshot']);

type ReproPack = {
    reproPackId: string;
    workspaceId: string;
    tenantId: string;
    runId: string;
    includeScreenshots: boolean;
    includeDiffs: boolean;
    includeLogs: boolean;
    downloadRef: string;
    expiresAt: number;
    exportAuditEventId: string;
    correlationId: string;
    createdAt: number;
};

/** 7-day TTL for repro pack download links */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function registerReproPackRoutes(
    app: FastifyInstance,
    opts: { getSession: () => SessionContext | null },
): Promise<void> {
    const packStore = new Map<string, ReproPack>();

    // ── POST /v1/runs/:runId/resume ───────────────────────────────────────────
    app.post<{
        Params: { runId: string };
        Body: { strategy?: string; workspaceId?: string };
    }>('/v1/runs/:runId/resume', async (req, reply) => {
        const session = opts.getSession();
        if (!session) return reply.status(401).send({ error: 'unauthenticated' });

        const { runId } = req.params;
        const { strategy, workspaceId } = req.body ?? {};

        if (!strategy || !VALID_RESUME_STRATEGIES.has(strategy)) {
            return reply.status(400).send({
                error: 'invalid_strategy',
                allowedStrategies: [...VALID_RESUME_STRATEGIES],
            });
        }

        // Verify the workspace belongs to the session tenant when provided
        if (workspaceId && !session.workspaceIds.includes(workspaceId)) {
            return reply.status(403).send({ error: 'forbidden', workspaceId });
        }

        const correlationId = `corr_${randomUUID().slice(0, 8)}`;
        const checkpointRef = `ckpt_${Date.now().toString(36)}_${randomUUID().slice(0, 4)}`;

        return reply.status(202).send({
            runId,
            resumedFrom: checkpointRef,
            status: 'resumed',
            estimatedLoss: strategy === 'last_checkpoint' ? 'minimal' : 'moderate',
            strategy,
            correlationId,
        });
    });

    // ── POST /v1/workspaces/:wsId/repro-packs ────────────────────────────────
    app.post<{
        Params: { wsId: string };
        Body: {
            runId?: string;
            includeScreenshots?: boolean;
            includeDiffs?: boolean;
            includeLogs?: boolean;
        };
    }>('/v1/workspaces/:wsId/repro-packs', async (req, reply) => {
        const session = opts.getSession();
        if (!session) return reply.status(401).send({ error: 'unauthenticated' });
        if (!session.workspaceIds.includes(req.params.wsId))
            return reply.status(403).send({ error: 'forbidden' });

        const { wsId } = req.params;
        const {
            runId = '',
            includeScreenshots = false,
            includeDiffs = false,
            includeLogs = false,
        } = req.body ?? {};

        const reproPackId = `pack_${randomUUID().slice(0, 8)}`;
        const exportAuditEventId = `audit_${randomUUID().slice(0, 8)}`;
        const correlationId = `corr_${randomUUID().slice(0, 8)}`;
        const now = Date.now();

        const pack: ReproPack = {
            reproPackId,
            workspaceId: wsId,
            tenantId: session.tenantId,
            runId,
            includeScreenshots,
            includeDiffs,
            includeLogs,
            downloadRef: `https://storage.agentfarm.io/repro-packs/${reproPackId}.tar.gz`,
            expiresAt: now + TTL_MS,
            exportAuditEventId,
            correlationId,
            createdAt: now,
        };
        packStore.set(reproPackId, pack);

        return reply.status(201).send({
            reproPackId,
            downloadRef: pack.downloadRef,
            expiresAt: pack.expiresAt,
            exportAuditEventId,
            correlationId,
        });
    });

    // ── GET /v1/workspaces/:wsId/repro-packs/:packId ─────────────────────────
    app.get<{ Params: { wsId: string; packId: string } }>(
        '/v1/workspaces/:wsId/repro-packs/:packId',
        async (req, reply) => {
            const session = opts.getSession();
            if (!session) return reply.status(401).send({ error: 'unauthenticated' });
            if (!session.workspaceIds.includes(req.params.wsId))
                return reply.status(403).send({ error: 'forbidden' });

            const { wsId, packId } = req.params;
            const pack = packStore.get(packId);

            // Not found OR cross-workspace access → 404 (don't leak existence)
            if (!pack || pack.workspaceId !== wsId)
                return reply.status(404).send({ error: 'not_found' });

            const now = Date.now();
            const manifest = {
                runId: pack.runId,
                workspaceId: pack.workspaceId,
                tenantId: pack.tenantId,
                includedLogs: pack.includeLogs,
                includedScreenshots: pack.includeScreenshots,
                includedDiffs: pack.includeDiffs,
                includedActionTraces: true, // always captured
                logBundleRef: pack.includeLogs
                    ? `https://storage.agentfarm.io/logs/${pack.runId}.log.gz`
                    : null,
                screenshotRefs: pack.includeScreenshots
                    ? [
                          `https://storage.agentfarm.io/screenshots/${pack.runId}-001.png`,
                          `https://storage.agentfarm.io/screenshots/${pack.runId}-002.png`,
                      ]
                    : [],
                diffRefs: pack.includeDiffs
                    ? [`https://storage.agentfarm.io/diffs/${pack.runId}.diff`]
                    : [],
                actionTraceRef: `https://storage.agentfarm.io/traces/${pack.runId}.jsonl`,
                timeline: [
                    { event: 'ci_failure_ingested', timestamp: pack.createdAt - 60_000 },
                    { event: 'repro_pack_requested', timestamp: pack.createdAt - 1_000 },
                    { event: 'repro_pack_generated', timestamp: pack.createdAt },
                    { event: 'export_audit_logged', timestamp: pack.createdAt + 50 },
                ],
                generatedAt: pack.createdAt,
                expiresAt: pack.expiresAt,
                isExpired: now > pack.expiresAt,
            };

            return reply.status(200).send({
                reproPackId: pack.reproPackId,
                downloadRef: pack.downloadRef,
                expiresAt: pack.expiresAt,
                exportAuditEventId: pack.exportAuditEventId,
                manifest,
            });
        },
    );
}
