/**
 * nps-webhook.ts
 *
 * Sprint 21 — NPS one-click response handler
 *
 * POST /v1/sales/nps/respond/:token
 *   Body: { score: number, feedback?: string }
 *   Called from the one-click NPS email link. Records the response and
 *   returns a simple thank-you JSON.
 *
 * GET /v1/sales/nps/respond/:token?score=<n>
 *   One-click link from email clients that don't POST — redirects to thank-you
 *   page and records the score. The survey email builds links in this format.
 */

import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { recordNpsResponse } from '@agentfarm/agent-runtime/sales/nps-handler.js';

export type RegisterNpsWebhookRoutesOptions = {
    prisma?: PrismaClient;
};

type TokenParams = { token: string };
type NpsBody = { score: number; feedback?: string };

// Structural type — only needs the fields used here
type PrismaWithNpsLookup = {
    npsResponse: {
        findFirst: (args: { where: { token: string }; select: { surveyType: true } }) => Promise<{ surveyType: string } | null>;
    };
};

const getPrisma = async (): Promise<PrismaClient> => {
    const { prisma } = await import('../lib/db.js');
    return prisma;
};

/**
 * Validates a score against the survey type retrieved from the DB.
 *   NPS  → 0-10 (integer, 0 = "not at all likely" is valid)
 *   CSAT → 1-5  (1 = Very dissatisfied, 5 = Very satisfied; 0 is not a CSAT option)
 * Returns an error string or null if valid.
 */
async function validateScoreForToken(
    prisma: PrismaClient,
    token: string,
    score: number,
): Promise<string | null> {
    if (isNaN(score) || !Number.isInteger(score)) return 'score must be an integer';

    const row = await (prisma as unknown as PrismaWithNpsLookup).npsResponse.findFirst({
        where: { token },
        select: { surveyType: true },
    });

    // If token doesn't exist yet we still do a basic range check (NPS range covers everything)
    if (!row) {
        if (score < 0 || score > 10) return 'score must be 0-10';
        return null;
    }

    if (row.surveyType === 'csat') {
        if (score < 1 || score > 5) return 'CSAT score must be 1-5';
    } else {
        // nps
        if (score < 0 || score > 10) return 'NPS score must be 0-10';
    }
    return null;
}

export async function registerNpsWebhookRoutes(
    app: FastifyInstance,
    options: RegisterNpsWebhookRoutesOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : getPrisma;

    // POST — body { score, feedback? }
    app.post<{ Params: TokenParams; Body: NpsBody }>(
        '/v1/sales/nps/respond/:token',
        async (request, reply) => {
            const { token } = request.params;
            const score = Number(request.body?.score);

            const prisma = await resolvePrisma();
            const scoreError = await validateScoreForToken(prisma, token, score);
            if (scoreError) {
                return reply.status(400).send({ code: 'INVALID_SCORE', message: scoreError });
            }

            const result = await recordNpsResponse(
                { token, score, feedback: request.body?.feedback },
                prisma,
            );

            if (!result.ok) {
                return reply.status(404).send({ code: 'NOT_FOUND', message: result.error });
            }

            return reply.status(200).send({ ok: true, message: 'Thank you for your feedback!' });
        },
    );

    // GET — one-click link from email (score in query param)
    app.get<{ Params: TokenParams }>(
        '/v1/sales/nps/respond/:token',
        async (request, reply) => {
            const { token } = request.params;
            const query = request.query as Record<string, string | undefined>;
            const score = Number(query['score'] ?? '');

            const prisma = await resolvePrisma();
            const scoreError = await validateScoreForToken(prisma, token, score);
            if (scoreError) {
                return reply.status(400).send({ code: 'INVALID_SCORE', message: scoreError });
            }

            await recordNpsResponse({ token, score }, prisma).catch(() => undefined);

            // Redirect to a thank-you page if one is configured, else JSON
            const thankYouUrl = process.env['NPS_THANKYOU_URL'];
            if (thankYouUrl) {
                return reply.redirect(302, thankYouUrl);
            }
            return reply.status(200).send({ ok: true, message: 'Thank you for your feedback!' });
        },
    );
}
