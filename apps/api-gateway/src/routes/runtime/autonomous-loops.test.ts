import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerAutonomousLoopRoutes } from './autonomous-loops.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeOrchestrator = () => {
    const runs = new Map<string, { loopId: string; state: string; [k: string]: unknown }>();

    return {
        async execute(config: { initial_skill: string; success_criteria: string; [k: string]: unknown }) {
            const loopId = `loop_${Math.random().toString(36).slice(2)}`;
            const result = { loopId, state: 'success', initial_skill: config.initial_skill, success_criteria: config.success_criteria };
            runs.set(loopId, result);
            return result;
        },
        getRunById(id: string) {
            return runs.get(id) ?? null;
        },
        getRecentRuns(n: number) {
            return Array.from(runs.values()).slice(0, n);
        },
        cancelLoop(id: string): boolean {
            const run = runs.get(id);
            if (!run || run.state === 'success' || run.state === 'failed') return false;
            run.state = 'cancelled';
            return true;
        },
        _runs: runs,
    };
};

const buildApp = (orchestrator = makeOrchestrator()) => {
    const app = Fastify();
    registerAutonomousLoopRoutes(app, { orchestrator });
    return { app, orchestrator };
};

// ---------------------------------------------------------------------------
// POST /v1/autonomous-loops/execute
// ---------------------------------------------------------------------------

describe('POST /v1/autonomous-loops/execute', () => {
    it('returns 400 when initial_skill is missing', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/autonomous-loops/execute',
            payload: { success_criteria: 'all done' },
        });
        assert.equal(res.statusCode, 400);
        assert.ok(res.json().error);
    });

    it('returns 400 when success_criteria is missing', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/autonomous-loops/execute',
            payload: { initial_skill: 'my_skill' },
        });
        assert.equal(res.statusCode, 400);
    });

    it('returns 200 and loop result when successful', async () => {
        const { app } = buildApp();
        const res = await app.inject({
            method: 'POST',
            url: '/v1/autonomous-loops/execute',
            payload: { initial_skill: 'search_web', success_criteria: 'found answer' },
        });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(body.loopId, 'loopId must be present');
        assert.equal(body.state, 'success');
    });

    it('returns 202 when loop state is not success', async () => {
        const orchestrator = {
            ...makeOrchestrator(),
            async execute() { return { loopId: 'l1', state: 'running' }; },
        };
        const app = Fastify();
        registerAutonomousLoopRoutes(app, { orchestrator });
        const res = await app.inject({
            method: 'POST',
            url: '/v1/autonomous-loops/execute',
            payload: { initial_skill: 's', success_criteria: 'c' },
        });
        assert.equal(res.statusCode, 202);
    });

    it('returns 500 when orchestrator throws', async () => {
        const orchestrator = {
            ...makeOrchestrator(),
            async execute() { throw new Error('orchestrator_down'); },
        };
        const app = Fastify();
        registerAutonomousLoopRoutes(app, { orchestrator });
        const res = await app.inject({
            method: 'POST',
            url: '/v1/autonomous-loops/execute',
            payload: { initial_skill: 's', success_criteria: 'c' },
        });
        assert.equal(res.statusCode, 500);
        assert.equal(res.json().error, 'orchestrator_down');
    });
});

// ---------------------------------------------------------------------------
// GET /v1/autonomous-loops/:loopId
// ---------------------------------------------------------------------------

describe('GET /v1/autonomous-loops/:loopId', () => {
    it('returns 404 for unknown loopId', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/autonomous-loops/nonexistent' });
        assert.equal(res.statusCode, 404);
        assert.ok(res.json().error);
    });

    it('returns the loop run for a known loopId', async () => {
        const { app, orchestrator } = buildApp();
        // Execute first to populate
        const execRes = await app.inject({
            method: 'POST',
            url: '/v1/autonomous-loops/execute',
            payload: { initial_skill: 'my_skill', success_criteria: 'done' },
        });
        const { loopId } = execRes.json();

        const res = await app.inject({ method: 'GET', url: `/v1/autonomous-loops/${loopId}` });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().loopId, loopId);
        void orchestrator; // suppress unused warning
    });
});

// ---------------------------------------------------------------------------
// GET /v1/autonomous-loops
// ---------------------------------------------------------------------------

describe('GET /v1/autonomous-loops', () => {
    it('returns empty list when no loops have run', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/autonomous-loops' });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(Array.isArray(body.loops));
        assert.equal(body.total, 0);
    });

    it('returns executed loops', async () => {
        const { app } = buildApp();
        for (let i = 0; i < 3; i++) {
            await app.inject({
                method: 'POST',
                url: '/v1/autonomous-loops/execute',
                payload: { initial_skill: `skill_${i}`, success_criteria: 'done' },
            });
        }
        const res = await app.inject({ method: 'GET', url: '/v1/autonomous-loops' });
        const body = res.json();
        assert.equal(body.total, 3);
    });
});

// ---------------------------------------------------------------------------
// DELETE /v1/autonomous-loops/:loopId
// ---------------------------------------------------------------------------

describe('DELETE /v1/autonomous-loops/:loopId', () => {
    it('returns 404 for unknown loopId', async () => {
        const { app } = buildApp();
        const res = await app.inject({ method: 'DELETE', url: '/v1/autonomous-loops/nonexistent' });
        assert.equal(res.statusCode, 404);
    });

    it('returns 404 for already-completed loop (cancel returns false)', async () => {
        const { app } = buildApp();
        const execRes = await app.inject({
            method: 'POST',
            url: '/v1/autonomous-loops/execute',
            payload: { initial_skill: 'x', success_criteria: 'y' },
        });
        const { loopId } = execRes.json();
        // Completed loops cannot be cancelled — our orchestrator returns false
        const res = await app.inject({ method: 'DELETE', url: `/v1/autonomous-loops/${loopId}` });
        assert.equal(res.statusCode, 404);
    });

    it('cancels an in-progress loop', async () => {
        const orchestrator = makeOrchestrator();
        // Inject a running loop directly into the store
        orchestrator._runs.set('loop_running', { loopId: 'loop_running', state: 'running' });
        const app = Fastify();
        registerAutonomousLoopRoutes(app, { orchestrator });
        const res = await app.inject({ method: 'DELETE', url: '/v1/autonomous-loops/loop_running' });
        assert.equal(res.statusCode, 204);
    });
});
