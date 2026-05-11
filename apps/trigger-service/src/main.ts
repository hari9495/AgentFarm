import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { startSubscriptionSweep } from './subscription-sweep.js';
import { startScheduleSweep } from './schedule-sweep.js';
import { startReportSweep } from './report-sweep.js';
import { loadConfig } from './config-loader.js';
import { TriggerEngine } from './trigger-engine.js';
import { WebhookTriggerSource } from './sources/webhook-trigger.js';
import { EmailTriggerSource } from './sources/email-trigger.js';
import { SlackTriggerSource } from './sources/slack-trigger.js';
import type { TriggerSource } from './types.js';

const PORT = parseInt(process.env['TRIGGER_SERVICE_PORT'] ?? '3002', 10);

export function buildApp(
    env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
) {
    const config = loadConfig();
    const fastify = Fastify({ logger: true });

    // -----------------------------------------------------------------------
    // Sources
    // -----------------------------------------------------------------------

    const webhookSource = new WebhookTriggerSource({
        hmacSecret: env['WEBHOOK_HMAC_SECRET'],
    });

    const sources: TriggerSource[] = [webhookSource];

    const emailEnabled = !!env['EMAIL_IMAP_HOST'];
    if (emailEnabled) {
        const emailSource = new EmailTriggerSource({
            host: env['EMAIL_IMAP_HOST']!,
            port: parseInt(env['EMAIL_IMAP_PORT'] ?? '993'),
            secure: env['EMAIL_IMAP_TLS'] !== 'false',
            user: env['EMAIL_IMAP_USER']!,
            pass: env['EMAIL_IMAP_PASSWORD']!,
        });
        sources.push(emailSource);
    }

    const slackEnabled = !!env['SLACK_BOT_TOKEN'];
    if (slackEnabled) {
        const slackSource = new SlackTriggerSource({
            token: env['SLACK_BOT_TOKEN']!,
            signingSecret: env['SLACK_SIGNING_SECRET'] ?? '',
        });
        sources.push(slackSource);
    }

    // -----------------------------------------------------------------------
    // Engine
    // -----------------------------------------------------------------------

    const engine = new TriggerEngine(config, sources);

    // -----------------------------------------------------------------------
    // Routes
    // -----------------------------------------------------------------------

    fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

    fastify.get('/status', async () => ({
        status: 'ok',
        port: PORT,
        tenants: config.tenants.map((t) => ({ tenantId: t.tenantId, agents: t.agents.length })),
        agentRuntimeUrl: config.agentRuntimeUrl,
        sources: {
            webhook: true,
            email: emailEnabled,
            slack: slackEnabled,
        },
        timestamp: new Date().toISOString(),
    }));

    fastify.post<{ Body: string }>(
        '/webhook',
        { config: { rawBody: true } },
        async (request, reply) => {
            const signature = request.headers['x-hub-signature-256'] as string | undefined
                ?? request.headers['x-signature'] as string | undefined;

            const rawBody =
                typeof request.body === 'string'
                    ? request.body
                    : JSON.stringify(request.body ?? {});

            const accepted = await webhookSource.handleRequest(rawBody, signature);

            if (!accepted) {
                return reply.status(401).send({ error: 'invalid signature' });
            }

            return reply.status(202).send({ accepted: true });
        },
    );

    return { fastify, engine };
}

async function main(): Promise<void> {
    const { fastify, engine } = buildApp();
    await engine.start();

    const prisma = new PrismaClient();
    const sweepHandle = startSubscriptionSweep(prisma);
    const scheduleHandle = startScheduleSweep(prisma);
    const reportSweepHandle = startReportSweep(prisma, {
        apiGatewayUrl: process.env['API_GATEWAY_URL'] ?? 'http://localhost:3000',
        internalToken: process.env['SSE_INTERNAL_TOKEN'] ?? '',
    });

    // -----------------------------------------------------------------------
    // Shutdown
    // -----------------------------------------------------------------------

    const shutdown = async (signal: string): Promise<void> => {
        console.log(`Received ${signal}, shutting down…`);
        clearInterval(sweepHandle);
        clearInterval(scheduleHandle);
        clearInterval(reportSweepHandle);
        await prisma.$disconnect();
        await engine.stop();
        await fastify.close();
        process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));

    // -----------------------------------------------------------------------
    // Listen
    // -----------------------------------------------------------------------

    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`trigger-service listening on port ${PORT}`);
}

// ESM guard — prevents auto-start when imported by tests
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((err) => {
        console.error('trigger-service fatal:', err);
        process.exit(1);
    });
}
