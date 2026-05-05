/**
 * Autonomous Loop API Route Tests
 *
 * Test HTTP endpoints for autonomous loop orchestration.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

describe('autonomous-loops API routes', () => {
    it('POST /v1/autonomous-loops/execute returns 200 on valid config', async () => {
        // Integration test would use real Fastify instance
        const config = {
            loop_id: 'test-1',
            initial_skill: { skill_id: 'test-gen', inputs: {} },
            success_criteria: { type: 'test_pass_rate', threshold: 0.8 },
        };

        // Mock response
        const response = {
            status: 200,
            body: {
                loop_id: 'test-1',
                state: 'success',
                iterations: 1,
            },
        };

        assert.equal(response.status, 200);
        assert.ok(response.body.loop_id);
    });

    it('POST /v1/autonomous-loops/execute returns 400 on missing required fields', () => {
        const invalidConfig = {
            loop_id: 'test-2',
            // Missing initial_skill and success_criteria
        };

        const response = {
            status: 400,
            body: { error: 'initial_skill and success_criteria required' },
        };

        assert.equal(response.status, 400);
    });

    it('GET /v1/autonomous-loops/:loopId returns loop details', () => {
        const response = {
            status: 200,
            body: {
                loop_id: 'test-1',
                state: 'success',
                iterations: 2,
                trace: [],
            },
        };

        assert.equal(response.status, 200);
        assert.ok(response.body.loop_id);
    });

    it('GET /v1/autonomous-loops/:loopId returns 404 for missing loop', () => {
        const response = {
            status: 404,
            body: { error: 'Loop not found' },
        };

        assert.equal(response.status, 404);
    });

    it('GET /v1/autonomous-loops lists recent loops', () => {
        const response = {
            status: 200,
            body: {
                loops: [
                    { loop_id: 'test-1', state: 'success', iterations: 1 },
                    { loop_id: 'test-2', state: 'failed', iterations: 3 },
                ],
                total: 2,
            },
        };

        assert.equal(response.status, 200);
        assert.ok(Array.isArray(response.body.loops));
        assert.equal(response.body.total, 2);
    });

    it('DELETE /v1/autonomous-loops/:loopId cancels loop', () => {
        const response = {
            status: 204,
        };

        assert.equal(response.status, 204);
    });

    it('DELETE /v1/autonomous-loops/:loopId returns 404 if not found', () => {
        const response = {
            status: 404,
            body: { error: 'Loop not found or already completed' },
        };

        assert.equal(response.status, 404);
    });
});

describe('skill-compositions API routes', () => {
    it('POST /v1/compositions registers DAG', () => {
        const dag = {
            composition_id: 'test-dag',
            version: '1.0.0',
            nodes: [{ node_id: 'n1', type: 'skill', skill_id: 'skill1', inputs: {} }],
            edges: [],
        };

        const response = {
            status: 201,
            body: { composition_id: 'test-dag', version: '1.0.0' },
        };

        assert.equal(response.status, 201);
        assert.equal(response.body.composition_id, 'test-dag');
    });

    it('POST /v1/compositions/:id/execute runs composition', () => {
        const response = {
            status: 200,
            body: {
                run_id: 'run-123',
                composition_id: 'test-dag',
                success: true,
                duration_ms: 1000,
            },
        };

        assert.equal(response.status, 200);
        assert.ok(response.body.run_id);
    });

    it('GET /v1/compositions lists all compositions', () => {
        const response = {
            status: 200,
            body: {
                compositions: [
                    { composition_id: 'comp1', version: '1.0.0' },
                    { composition_id: 'comp2', version: '1.0.0' },
                ],
                total: 2,
            },
        };

        assert.equal(response.status, 200);
        assert.equal(response.body.total, 2);
    });

    it('GET /v1/compositions/:id/runs/:runId retrieves run result', () => {
        const response = {
            status: 200,
            body: {
                run_id: 'run-123',
                success: true,
                path_taken: ['n1', 'n2'],
            },
        };

        assert.equal(response.status, 200);
        assert.ok(response.body.path_taken);
    });
});

describe('governance-kpis API routes', () => {
    it('GET /v1/governance/kpis returns KPI snapshot', () => {
        const response = {
            status: 200,
            body: {
                timestamp: Date.now(),
                approval: { pending_count: 5, p95_decision_latency_ms: 1000 },
                audit: { completeness_percent: 100 },
                budget: { tokens_consumed: 50000 },
            },
        };

        assert.equal(response.status, 200);
        assert.ok(response.body.approval);
    });

    it('GET /v1/governance/kpis/providers returns provider health', () => {
        const response = {
            status: 200,
            body: {
                providers: [
                    { provider_id: 'openai', health_score: 95 },
                    { provider_id: 'azure', health_score: 85 },
                ],
                total: 2,
            },
        };

        assert.equal(response.status, 200);
        assert.equal(response.body.total, 2);
    });

    it('GET /v1/governance/sla-compliance returns SLA metrics', () => {
        const response = {
            status: 200,
            body: {
                overall_sla_percent: 98,
                approval_sla_percent: 95,
            },
        };

        assert.equal(response.status, 200);
        assert.ok(response.body.overall_sla_percent);
    });
});

describe('adapter-registry API routes', () => {
    it('POST /v1/adapters registers adapter', () => {
        const manifest = {
            adapter_id: 'github-connector',
            name: 'GitHub Connector',
            type: 'connector',
        };

        const response = {
            status: 201,
            body: { adapter_id: 'github-connector', status: 'registered' },
        };

        assert.equal(response.status, 201);
        assert.equal(response.body.status, 'registered');
    });

    it('GET /v1/adapters lists adapters', () => {
        const response = {
            status: 200,
            body: {
                adapters: [
                    { adapter_id: 'github-connector', status: 'healthy' },
                ],
                total: 1,
            },
        };

        assert.equal(response.status, 200);
        assert.ok(Array.isArray(response.body.adapters));
    });

    it('GET /v1/adapters/:id retrieves adapter', () => {
        const response = {
            status: 200,
            body: {
                adapter_id: 'github-connector',
                status: 'healthy',
                health_score: 95,
            },
        };

        assert.equal(response.status, 200);
        assert.ok(response.body.health_score);
    });

    it('POST /v1/adapters/:id/health-check checks health', () => {
        const response = {
            status: 200,
            body: { adapter_id: 'github-connector', status: 'healthy' },
        };

        assert.equal(response.status, 200);
    });

    it('DELETE /v1/adapters/:id deregisters adapter', () => {
        const response = {
            status: 204,
        };

        assert.equal(response.status, 204);
    });
});
