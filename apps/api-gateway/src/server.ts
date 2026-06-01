/**
 * server.ts — Fastify server factory.
 *
 * Responsible for: plugin registration (helmet, cors), cross-cutting hooks
 * (rate limiting, auth, subscription guard), global error handler, and
 * infrastructure routes (/health, /status, /v1/auth/dev-session).
 *
 * Does NOT register domain routes or start workers — those belong in
 * route-registry.ts and worker-manager.ts respectively.
 */

import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { buildSessionToken } from './lib/session-auth.js';
import { rateLimitAsync, rateLimitTenantAsync } from './lib/rate-limit.js';
import { checkSubscription } from './lib/subscription-guard.js';
import { prisma } from './lib/db.js';
import { readSession, resolveApiKeySession } from './request-context.js';

// ---------------------------------------------------------------------------
// Auth bypass whitelist
// ---------------------------------------------------------------------------

const PUBLIC_PATHS = new Set([
    '/health',
    '/status',
    '/auth/signup',
    '/auth/login',
    '/auth/internal-login',
    '/auth/passwordless-login',
    '/portal/auth/signup',
    '/portal/auth/login',
    '/portal/auth/logout',
    '/portal/auth/me',
]);

const isPublicPath = (url: string): boolean => {
    const path = url.split('?')[0] ?? '';
    return (
        PUBLIC_PATHS.has(path) ||
        path === '/auth/logout' ||
        path.startsWith('/portal/') ||
        path.startsWith('/v1/webhooks/events')
    );
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const createServer = async (): Promise<FastifyInstance> => {
    const requireAuth = process.env.API_REQUIRE_AUTH === 'true';

    // 1 MB max request body — prevents large payload DoS
    const app = Fastify({ logger: true, bodyLimit: 1_048_576 });

    await app.register(helmet, {
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'none'"],
                frameAncestors: ["'none'"],
            },
        },
        referrerPolicy: { policy: ['strict-origin-when-cross-origin'] },
        frameguard: { action: 'deny' },
    });

    await app.register(multipart, {
        limits: {
            fileSize: 25_000_000,  // 25 MB — enough for any document
            files: 1,
            fields: 10,
        },
    });

    await app.register(cors, {
        origin: (origin, callback) => {
            const allowedOriginsEnv = process.env['ALLOWED_ORIGINS'];
            if (!allowedOriginsEnv || !origin) {
                callback(null, true);
                return;
            }
            const allowed = allowedOriginsEnv.split(',').map((s) => s.trim());
            if (allowed.includes(origin)) {
                callback(null, true);
            } else {
                const err = new Error('origin not allowed') as Error & { statusCode: number };
                err.statusCode = 403;
                callback(err, false);
            }
        },
        credentials: true,
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });

    // Add Permissions-Policy header to every response
    app.addHook('onSend', async (_request, reply) => {
        reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    });

    // Rate limiting + auth gate — runs before every handler
    app.addHook('preHandler', async (request, reply) => {
        const isAuthEndpoint = request.url.startsWith('/auth/');
        const limit = isAuthEndpoint ? 20 : 180;
        const identityKey = `${request.ip}:${isAuthEndpoint ? 'auth' : request.url}`;

        const ipResult = await rateLimitAsync(identityKey, { limit, windowMs: 60_000 });
        reply.header('x-ratelimit-remaining', String(ipResult.remaining));
        reply.header('x-ratelimit-reset-in-ms', String(ipResult.resetIn));

        if (!ipResult.allowed) {
            void reply.code(429).send({ error: 'rate_limit_exceeded', message: 'Too many requests. Retry after the reset window.' });
            return;
        }

        const tenantSession = readSession(request);
        if (tenantSession?.tenantId) {
            const tenantResult = await rateLimitTenantAsync(tenantSession.tenantId, { limit: 600, windowMs: 60_000 });
            reply.header('x-ratelimit-tenant-remaining', String(tenantResult.remaining));
            if (!tenantResult.allowed) {
                void reply.code(429).send({ error: 'rate_limit_exceeded', scope: 'tenant', retryAfterMs: tenantResult.resetIn });
                return;
            }
        }

        if (isPublicPath(request.url) || !request.url.startsWith('/v1/') || !requireAuth) {
            return;
        }

        let session = readSession(request);

        // API key fallback — Bearer af_<key> is a long-lived programmatic key
        if (!session) {
            const apiKeySession = await resolveApiKeySession(
                request.headers['authorization'] as string | undefined,
            );
            if (apiKeySession) {
                (request as unknown as Record<string, unknown>)._injectedSession = apiKeySession;
                session = apiKeySession;
            }
        }

        if (!session) {
            void reply.code(401).send({
                error: 'unauthorized',
                message: 'Provide a valid bearer token or agentfarm_session cookie.',
            });
        }
    });

    // Subscription guard — attaches session to request then checks tenant status
    app.addHook('preHandler', async (request, reply) => {
        (request as unknown as Record<string, unknown>).session = readSession(request) ?? undefined;
        await checkSubscription(request, reply);
    });

    // Global error handler — never leak stack traces to clients
    app.setErrorHandler((error: FastifyError, _request, reply) => {
        const status = error.statusCode ?? 500;
        if (status >= 500) {
            console.error('[unhandled-error]', error);
            return reply.code(500).send({ error: 'internal server error' });
        }
        return reply.code(status).send({ error: error.message ?? 'bad request' });
    });

    // ------------------------------------------------------------------
    // Infrastructure routes (not domain-specific)
    // ------------------------------------------------------------------

    app.get('/health', async () => ({
        status: 'ok',
        service: 'api-gateway',
        ts: new Date().toISOString(),
    }));

    app.get('/status', async () => {
        const services: { name: string; status: 'operational' | 'degraded' | 'outage'; latencyMs?: number }[] = [];

        const dbStart = Date.now();
        let dbStatus: 'operational' | 'degraded' | 'outage' = 'outage';
        try {
            await prisma.$queryRaw`SELECT 1`;
            dbStatus = 'operational';
        } catch { /* db unreachable */ }
        services.push({ name: 'Database', status: dbStatus, latencyMs: Date.now() - dbStart });

        if (process.env['REDIS_URL']) {
            services.push({ name: 'Cache', status: 'operational' });
        }
        services.push({ name: 'API Gateway', status: 'operational', latencyMs: 0 });

        const hasOutage = services.some((s) => s.status === 'outage');
        const hasDegraded = services.some((s) => s.status === 'degraded');
        const overallStatus = hasOutage ? 'outage' : hasDegraded ? 'degraded' : 'operational';

        return {
            status: overallStatus,
            updatedAt: new Date().toISOString(),
            services,
            incidents: [] as { id: string; title: string; severity: string; startedAt: string }[],
        };
    });

    app.get('/health/detail', async (request, reply) => {
        const session = readSession(request);
        if (!session || session.scope !== 'internal') {
            return reply.code(401).send({ error: 'unauthorized' });
        }
        let dbOk = false;
        try {
            await prisma.$queryRaw`SELECT 1`;
            dbOk = true;
        } catch { /* db unreachable */ }
        return {
            status: dbOk ? 'ok' : 'degraded',
            service: 'api-gateway',
            db: dbOk ? 'connected' : 'unreachable',
            uptime: process.uptime(),
            memoryMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            ts: new Date().toISOString(),
        };
    });

    // Dev-only session helper — disabled in production
    app.get('/v1/auth/dev-session', async (_request, reply) => {
        if (process.env.NODE_ENV === 'production') {
            return reply.code(404).send({ error: 'not_found' });
        }
        const token = buildSessionToken({
            userId: 'dev-user-001',
            tenantId: 'tenant_acme_001',
            workspaceIds: ['ws_primary_001'],
            scope: 'internal',
        });
        return { token, expires_in_seconds: 8 * 60 * 60 };
    });

    return app;
};

// ---------------------------------------------------------------------------
// Startup validation
// ---------------------------------------------------------------------------

export const runStartupChecks = async (app: FastifyInstance): Promise<void> => {
    const requiredVars = ['DATABASE_URL', 'API_SESSION_SECRET'];
    const missing = requiredVars.filter((v) => !process.env[v]?.trim());
    if (missing.length > 0) {
        app.log.error(`Startup checks failed: missing required env vars: ${missing.join(', ')}`);
        process.exit(1);
    }
    try {
        await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
        app.log.error({ err }, 'Startup checks failed: database connectivity check failed');
        process.exit(1);
    }
    app.log.info('Startup checks passed');
};
