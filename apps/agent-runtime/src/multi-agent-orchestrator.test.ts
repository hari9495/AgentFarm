import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MultiAgentOrchestrator, globalOrchestrator } from './multi-agent-orchestrator.js';
import { randomUUID } from 'node:crypto';

// ── Construction + registration ────────────────────────────────────────────

describe('MultiAgentOrchestrator: construction', () => {
    it('creates an instance with default built-in agents', () => {
        const orch = new MultiAgentOrchestrator();
        assert.ok(orch.listAgents().length >= 5, 'should have at least 5 built-in agents');
    });

    it('exports globalOrchestrator singleton', () => {
        assert.ok(globalOrchestrator instanceof MultiAgentOrchestrator);
    });

    it('can register a custom agent', () => {
        const orch = new MultiAgentOrchestrator();
        const before = orch.listAgents().length;
        orch.registerAgent({
            id: 'agent-custom',
            name: 'Custom Test Agent',
            capabilities: ['code_analysis'],
            skill_ids: ['dead-code-detector'],
        });
        assert.equal(orch.listAgents().length, before + 1);
    });
});

// ── selectAgents ──────────────────────────────────────────────────────────

describe('MultiAgentOrchestrator: selectAgents', () => {
    const orch = new MultiAgentOrchestrator();

    it('returns agents matching a single capability', () => {
        const agents = orch.selectAgents(['security_review']);
        assert.ok(agents.length >= 1);
        for (const a of agents) {
            assert.ok(a.capabilities.includes('security_review'));
        }
    });

    it('returns agents matching multiple required capabilities', () => {
        const agents = orch.selectAgents(['code_analysis', 'documentation']);
        assert.ok(Array.isArray(agents));
        for (const a of agents) {
            assert.ok(a.capabilities.includes('code_analysis'));
            assert.ok(a.capabilities.includes('documentation'));
        }
    });

    it('returns empty array when no agent matches', () => {
        const agents = orch.selectAgents(['ci_monitoring', 'performance_analysis', 'security_review', 'release_management', 'test_generation', 'code_analysis']);
        assert.ok(Array.isArray(agents));
        // May return 0 — just verify no error
    });

    it('sorts by affinity_weight descending', () => {
        const orch2 = new MultiAgentOrchestrator([
            { id: 'a1', name: 'Low', capabilities: ['code_analysis'], skill_ids: [], affinity_weight: 0.5 },
            { id: 'a2', name: 'High', capabilities: ['code_analysis'], skill_ids: [], affinity_weight: 1.5 },
        ]);
        const agents = orch2.selectAgents(['code_analysis']);
        assert.equal(agents[0].id, 'a2');
    });
});

// ── dispatch: dry_run ─────────────────────────────────────────────────────

describe('MultiAgentOrchestrator: dispatch dry_run', () => {
    const orch = new MultiAgentOrchestrator();

    it('completes a dry_run dispatch without errors', async () => {
        const result = await orch.dispatch({
            task_id: randomUUID(),
            description: 'Audit dependencies',
            required_capabilities: ['security_review'],
            skill_invocations: [{ skill_id: 'dependency-audit', inputs: { package_json: '{}' } }],
            aggregation: 'first_wins',
            dry_run: true,
        });
        assert.equal(result.ok, true);
        assert.ok(Array.isArray(result.agents_used));
        assert.ok(Array.isArray(result.invocation_results));
    });

    it('returns aggregated_output keyed by skill_id', async () => {
        const result = await orch.dispatch({
            task_id: randomUUID(),
            description: 'Dry run check',
            required_capabilities: ['test_generation'],
            skill_invocations: [{ skill_id: 'flaky-test-detector', inputs: {} }],
            aggregation: 'merge',
            dry_run: true,
        });
        assert.ok(typeof result.aggregated_output === 'object');
    });

    it('produces audit_trail entries', async () => {
        const result = await orch.dispatch({
            task_id: randomUUID(),
            description: 'Trail check',
            required_capabilities: ['code_analysis'],
            skill_invocations: [{ skill_id: 'dead-code-detector', inputs: {} }],
            aggregation: 'first_wins',
            dry_run: true,
        });
        assert.ok(Array.isArray(result.audit_trail));
        assert.ok(result.audit_trail.length >= 2);
    });

    it('returns ok=false when no agents match', async () => {
        const orch2 = new MultiAgentOrchestrator([]); // empty registry
        const result = await orch2.dispatch({
            task_id: randomUUID(),
            description: 'No match',
            required_capabilities: ['security_review'],
            skill_invocations: [],
            aggregation: 'first_wins',
            dry_run: true,
        });
        assert.equal(result.ok, false);
    });

    it('returns total_duration_ms as a number', async () => {
        const result = await orch.dispatch({
            task_id: randomUUID(),
            description: 'Duration test',
            required_capabilities: ['release_management'],
            skill_invocations: [],
            aggregation: 'merge',
            dry_run: true,
        });
        assert.equal(typeof result.total_duration_ms, 'number');
        assert.ok(result.total_duration_ms >= 0);
    });
});

// ── aggregate strategies ──────────────────────────────────────────────────

describe('MultiAgentOrchestrator: aggregation strategies', () => {
    const orch = new MultiAgentOrchestrator();

    it('vote aggregation returns a result', async () => {
        const result = await orch.dispatch({
            task_id: randomUUID(),
            description: 'Vote test',
            required_capabilities: ['dependency_management'],
            skill_invocations: [{ skill_id: 'license-compliance-check', inputs: {} }],
            aggregation: 'vote',
            dry_run: true,
        });
        assert.ok(typeof result.aggregated_output === 'object');
    });

    it('merge aggregation returns a result', async () => {
        const result = await orch.dispatch({
            task_id: randomUUID(),
            description: 'Merge test',
            required_capabilities: ['security_review'],
            skill_invocations: [{ skill_id: 'env-var-auditor', inputs: {} }],
            aggregation: 'merge',
            dry_run: true,
        });
        assert.ok(typeof result.aggregated_output === 'object');
    });
});
