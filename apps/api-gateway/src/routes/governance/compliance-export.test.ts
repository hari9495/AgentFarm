import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { registerComplianceExportRoutes } from './compliance-export.js';

const session = { userId: 'u1', tenantId: 'tenant_1', workspaceIds: [] as string[], expiresAt: Date.now() + 3_600_000 };

function makePrisma() {
    return {
        governancePolicy: {
            findMany: async ({ where }: any) => where.tenantId === 'tenant_1' ? [
                { id: 'pol1', tenantId: 'tenant_1', scope: 'role', scopeRef: 'developer', version: 2, status: 'active', name: 'r', description: null, rulesJson: [{ actionType: 'deploy_production', effect: 'deny' }], createdBy: 'u', updatedBy: 'u', createdAt: new Date(), updatedAt: new Date() },
            ] : [],
        },
        policyDocument: {
            findMany: async ({ where }: any) => where.tenantId === 'tenant_1' ? [
                { id: 'doc1', tenantId: 'tenant_1', fileName: 'p.md', mimeType: 'text/markdown', status: 'parsed', extractedRulesJson: [], failureReason: null, appliedPolicyId: 'pol1', appliedAt: new Date(), createdBy: 'u', createdAt: new Date(), updatedAt: new Date() },
            ] : [],
        },
        policyViolation: {
            findMany: async ({ where }: any) => where.tenantId === 'tenant_1' ? [
                { id: 'v1', tenantId: 'tenant_1', workspaceId: 'ws', botId: 'b', taskId: 't', actionType: 'deploy_production', connector: null, riskLevel: 'high', effect: 'deny', reason: '[POLICY_DENIED] policy=pol1@v2', matchedPolicyId: 'pol1', policyVersion: 2, source: 'document', correlationId: 'c', createdAt: new Date() },
            ] : [],
        },
    } as unknown as PrismaClient;
}

function makeApp(sess: typeof session | null) {
    const app = Fastify({ logger: false });
    registerComplianceExportRoutes(app, makePrisma(), { getSession: () => sess });
    return app;
}

test('GET compliance-export — 401 without session', async () => {
    const app = makeApp(null);
    const res = await app.inject({ method: 'GET', url: '/v1/governance/compliance-export' });
    await app.close();
    assert.equal(res.statusCode, 401);
});

test('GET compliance-export returns aggregated report with summary', async () => {
    const app = makeApp(session);
    const res = await app.inject({ method: 'GET', url: '/v1/governance/compliance-export' });
    await app.close();
    assert.equal(res.statusCode, 200);
    const b = res.json();
    assert.equal(b.tenantId, 'tenant_1');
    assert.equal(b.activePolicies.length, 1);
    assert.equal(b.policyDocuments.length, 1);
    assert.equal(b.violations.length, 1);
    assert.equal(b.summary.activePolicyCount, 1);
    assert.equal(b.summary.appliedDocumentCount, 1);
    assert.equal(b.summary.violationCount, 1);
    assert.equal(b.violations[0].matchedPolicyId, 'pol1');
});

test('GET compliance-export?format=download sets attachment header', async () => {
    const app = makeApp(session);
    const res = await app.inject({ method: 'GET', url: '/v1/governance/compliance-export?format=download' });
    await app.close();
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-disposition'] ?? '', /attachment; filename="compliance-tenant_1/);
});
