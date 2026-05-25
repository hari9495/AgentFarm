/**
 * CI Failure Intake & Triage Routes
 *
 * POST /v1/workspaces/:wsId/ci-failures/intake   — ingest a CI run failure
 * GET  /v1/workspaces/:wsId/ci-failures/:triageId/report — fetch triage analysis
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

export type SessionContext = {
    userId: string;
    tenantId: string;
    workspaceIds: string[];
    scope?: 'customer' | 'internal';
    expiresAt: number;
};

type FailedJob = {
    jobName: string;
    step: string;
    exitCode: number;
};

type FailureRecord = {
    triageId: string;
    workspaceId: string;
    provider: string;
    runId: string;
    repo: string;
    branch: string;
    failedJobs: FailedJob[];
    logRefs: string[];
    ingestedAt: number;
};

function analyzeFailure(record: FailureRecord): {
    patchProposal: string;
    confidence: number;
    rootCauseHypothesis: string;
} {
    const job = record.failedJobs[0];
    if (!job) {
        return {
            patchProposal: 'No failed jobs — check CI config for missing triggers.',
            confidence: 0.1,
            rootCauseHypothesis: 'Unknown: no failed jobs reported.',
        };
    }

    const step = job.step.toLowerCase();

    if (step.includes('env var') || step.includes('not found') || step.includes('undefined')) {
        return {
            patchProposal: `Add missing environment variable to CI secrets: see step "${job.step}". Verify the variable is exported in the workflow YAML.`,
            confidence: 0.85,
            rootCauseHypothesis: `Missing or unset environment variable in job "${job.jobName}" (step: "${job.step}").`,
        };
    }

    if (step.includes('type error') || step.includes('ts error') || step.includes('typescript')) {
        const fileHint = job.step.split(':')[1]?.trim() ?? 'affected file';
        return {
            patchProposal: `Fix TypeScript type error in ${record.branch}: run \`npx tsc --noEmit\` locally and resolve errors in ${fileHint}.`,
            confidence: 0.80,
            rootCauseHypothesis: `TypeScript compilation failure in job "${job.jobName}" during step "${job.step}".`,
        };
    }

    if (step.includes('test') || step.includes('jest') || step.includes('vitest')) {
        return {
            patchProposal: `Run failing tests locally: \`pnpm test -- --testPathPattern=${record.repo}\`. Fix assertions or update snapshots.`,
            confidence: 0.72,
            rootCauseHypothesis: `Test failure in job "${job.jobName}" during step "${job.step}" (exit ${job.exitCode}).`,
        };
    }

    return {
        patchProposal: `Investigate job "${job.jobName}" failure at step "${job.step}" (exit ${job.exitCode}). Review logs: ${record.logRefs[0] ?? 'N/A'}.`,
        confidence: 0.50,
        rootCauseHypothesis: `"${job.jobName}" failed at "${job.step}" with exit code ${job.exitCode}.`,
    };
}

export async function registerCiFailureRoutes(
    app: FastifyInstance,
    opts: { getSession: () => SessionContext | null },
): Promise<void> {
    const store = new Map<string, FailureRecord>();

    // ── POST /v1/workspaces/:wsId/ci-failures/intake ─────────────────────────
    app.post<{
        Params: { wsId: string };
        Body: {
            provider: string;
            runId: string;
            repo: string;
            branch: string;
            failedJobs: FailedJob[];
            logRefs?: string[];
        };
    }>('/v1/workspaces/:wsId/ci-failures/intake', async (req, reply) => {
        const session = opts.getSession();
        if (!session) return reply.status(401).send({ error: 'unauthenticated' });
        if (!session.workspaceIds.includes(req.params.wsId))
            return reply.status(403).send({ error: 'forbidden' });

        const { wsId } = req.params;
        const body = req.body;

        const triageId = `triage_${randomUUID().slice(0, 8)}`;
        store.set(triageId, {
            triageId,
            workspaceId: wsId,
            provider: body.provider ?? 'unknown',
            runId: body.runId ?? '',
            repo: body.repo ?? '',
            branch: body.branch ?? '',
            failedJobs: body.failedJobs ?? [],
            logRefs: body.logRefs ?? [],
            ingestedAt: Date.now(),
        });

        return reply.status(202).send({ triageId, ingestedAt: Date.now() });
    });

    // ── GET /v1/workspaces/:wsId/ci-failures/:triageId/report ────────────────
    app.get<{ Params: { wsId: string; triageId: string } }>(
        '/v1/workspaces/:wsId/ci-failures/:triageId/report',
        async (req, reply) => {
            const session = opts.getSession();
            if (!session) return reply.status(401).send({ error: 'unauthenticated' });
            if (!session.workspaceIds.includes(req.params.wsId))
                return reply.status(403).send({ error: 'forbidden' });

            const { wsId, triageId } = req.params;
            const record = store.get(triageId);
            if (!record || record.workspaceId !== wsId)
                return reply.status(404).send({ error: 'not_found' });

            const analysis = analyzeFailure(record);
            return reply.status(200).send({
                triageId,
                runId: record.runId,
                repo: record.repo,
                branch: record.branch,
                failedJobCount: record.failedJobs.length,
                ...analysis,
            });
        },
    );
}
