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

const getPrisma = async (): Promise<PrismaClient> => {
    const { prisma } = await import('../lib/db.js');
    return prisma;
};

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
            if (isNaN(score) || score < 0 || score > 10) {
                return reply.status(400).send({ code: 'INVALID_SCORE', message: 'score must be 0-10' });
            }

            const prisma = await resolvePrisma();
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
            if (isNaN(score) || score < 0 || score > 10) {
                return reply.status(400).send({ code: 'INVALID_SCORE' });
            }

            const prisma = await resolvePrisma();
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
