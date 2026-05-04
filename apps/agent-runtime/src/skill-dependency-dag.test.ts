import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { SkillDependencyDag } from './skill-dependency-dag.js';

describe('skill-dependency-dag: SkillDependencyDag', () => {
    let dag: SkillDependencyDag;

    beforeEach(() => {
        dag = new SkillDependencyDag();
    });

    it('listNodes returns built-in nodes', () => {
        const nodes = dag.listNodes();
        assert.ok(nodes.length >= 10, 'should have at least 10 built-in nodes');
    });

    it('getNode returns a node by skill_id', () => {
        const nodes = dag.listNodes();
        const first = nodes[0];
        const found = dag.getNode(first.skill_id);
        assert.ok(found, 'should find node by id');
        assert.equal(found?.skill_id, first.skill_id);
    });

    it('topologicalSort returns all nodes with no cycles', () => {
        const plan = dag.topologicalSort();
        assert.ok(plan.ok, 'topological sort should succeed without cycle errors');
        assert.ok(Array.isArray(plan.phases));
        assert.ok(plan.phases.length > 0);
    });

    it('topologicalSort phases contain all requested skills', () => {
        const nodes = dag.listNodes().slice(0, 5);
        const skillIds = nodes.map((n) => n.skill_id);
        const plan = dag.topologicalSort(skillIds);
        assert.equal(plan.ok, true);
        const allInPlan = plan.phases.flat();
        for (const id of skillIds) {
            assert.ok(allInPlan.includes(id), `${id} should appear in plan`);
        }
    });

    it('getDependencies returns direct deps', () => {
        const nodes = dag.listNodes();
        // Find a node with dependencies
        const withDeps = nodes.find((n) => n.depends_on.length > 0);
        if (!withDeps) return; // skip if none
        const deps = dag.getDependencies(withDeps.skill_id, false);
        assert.equal(deps.length, withDeps.depends_on.length);
    });

    it('getDependencies transitive=true returns more than direct deps', () => {
        const nodes = dag.listNodes();
        const withDeps = nodes.find((n) => n.depends_on.length > 0);
        if (!withDeps) return;
        const direct = dag.getDependencies(withDeps.skill_id, false);
        const transitive = dag.getDependencies(withDeps.skill_id, true);
        assert.ok(transitive.length >= direct.length);
    });

    it('addNode then getNode retrieves custom node', () => {
        dag.addNode({
            skill_id: 'custom_test_skill',
            label: 'Custom Test',
            tags: ['test'],
            depends_on: [],
            feeds_into: [],
            risk_level: 'low',
        });
        const found = dag.getNode('custom_test_skill');
        assert.ok(found, 'custom node should be retrievable');
        assert.equal(found?.label, 'Custom Test');
    });

    it('validate returns ok:true for valid skill set', () => {
        const skills = dag.listNodes().slice(0, 3).map((n) => n.skill_id);
        const result = dag.validate(skills);
        assert.equal(result.valid, true);
    });

    it('validate detects missing dependency references', () => {
        dag.addNode({
            skill_id: 'orphan_skill',
            label: 'Orphan',
            tags: [],
            depends_on: ['nonexistent_dependency'],
            feeds_into: [],
            risk_level: 'low',
        });
        const result = dag.validate(['orphan_skill']);
        assert.equal(result.valid, false);
        assert.ok(result.issues.length > 0);
    });

    it('suggestPlanForTags returns a topological plan', () => {
        const plan = dag.suggestPlanForTags(['analysis']);
        assert.ok(plan.ok !== undefined);
        assert.ok(Array.isArray(plan.phases));
    });

    it('getByRiskLevel filters correctly', () => {
        const low = dag.getByRiskLevel('low');
        assert.ok(low.every((n) => n.risk_level === 'low'));
    });

    it('getEdges returns edge list', () => {
        const edges = dag.getEdges();
        assert.ok(Array.isArray(edges));
    });
});
