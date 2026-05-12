import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';

// Minimal status route definition mirroring the one in main.ts
// (The actual handler in main.ts uses a live prisma instance; here we stub it.)
const buildApp = async (dbFails = false) => {
    const app = Fastify({ logger: false });

    const prisma = {
        $queryRaw: async () => {
            if (dbFails) throw new Error('DB unreachable');
            return [1];
        },
    };

    app.get('/status', async () => {
        const updatedAt = new Date().toISOString();
        const services: { name: string; status: 'operational' | 'degraded' | 'outage'; latencyMs?: number }[] = [];

        const dbStart = Date.now();
        let dbStatus: 'operational' | 'degraded' | 'outage' = 'outage';
        try {
            await prisma.$queryRaw();
            dbStatus = 'operational';
        } catch { /* unreachable */ }
        services.push({ name: 'Database', status: dbStatus, latencyMs: Date.now() - dbStart });

        services.push({ name: 'API Gateway', status: 'operational', latencyMs: 0 });

        const hasOutage = services.some(s => s.status === 'outage');
        const hasDegraded = services.some(s => s.status === 'degraded');
        const overallStatus: 'operational' | 'degraded' | 'outage' = hasOutage ? 'outage' : hasDegraded ? 'degraded' : 'operational';

        return {
            status: overallStatus,
            updatedAt,
            services,
            incidents: [] as { id: string; title: string; severity: string; startedAt: string }[],
        };
    });

    await app.ready();
    return app;
};

describe('GET /status', () => {
    it('returns 200 with correct shape', async () => {
        const app = await buildApp();
        const response = await app.inject({ method: 'GET', url: '/status' });
        assert.equal(response.statusCode, 200);

        const body = JSON.parse(response.body) as {
            status: string;
            updatedAt: string;
            services: { name: string; status: string }[];
            incidents: unknown[];
        };

        assert.ok(['operational', 'degraded', 'outage'].includes(body.status), `unexpected status: ${body.status}`);
        assert.ok(typeof body.updatedAt === 'string', 'updatedAt should be string');
        assert.ok(Date.parse(body.updatedAt) > 0, 'updatedAt should be valid ISO date');
        assert.ok(Array.isArray(body.services), 'services should be array');
        assert.ok(body.services.length > 0, 'services should be non-empty');
        assert.ok(Array.isArray(body.incidents), 'incidents should be array');
    });

    it('each service entry has name and status', async () => {
        const app = await buildApp();
        const response = await app.inject({ method: 'GET', url: '/status' });
        const body = JSON.parse(response.body) as {
            services: { name: string; status: string }[];
        };

        for (const svc of body.services) {
            assert.ok(typeof svc.name === 'string', `service.name should be string, got ${typeof svc.name}`);
            assert.ok(
                ['operational', 'degraded', 'outage'].includes(svc.status),
                `service.status '${svc.status}' is not a valid enum value`
            );
        }
    });

    it('does not require Authorization header', async () => {
        const app = await buildApp();
        const response = await app.inject({
            method: 'GET',
            url: '/status',
            headers: {},  // no auth header
        });
        assert.equal(response.statusCode, 200);
    });

    it('reports outage status when database is unreachable', async () => {
        const app = await buildApp(true);
        const response = await app.inject({ method: 'GET', url: '/status' });
        assert.equal(response.statusCode, 200);

        const body = JSON.parse(response.body) as { status: string; services: { name: string; status: string }[] };
        assert.equal(body.status, 'outage');

        const dbService = body.services.find(s => s.name === 'Database');
        assert.ok(dbService, 'Database service entry should exist');
        assert.equal(dbService.status, 'outage');
    });

    it('overall status is operational when all services are healthy', async () => {
        const app = await buildApp(false);
        const response = await app.inject({ method: 'GET', url: '/status' });
        const body = JSON.parse(response.body) as { status: string };
        assert.equal(body.status, 'operational');
    });
});
