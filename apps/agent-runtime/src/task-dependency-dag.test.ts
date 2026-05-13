import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { TaskDependencyDag, globalTaskDag } from './task-dependency-dag.js';
import type { TaskDagNode } from './task-dependency-dag.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(taskId: string, depends_on: string[] = [], status = 'pending' as TaskDagNode['status']): TaskDagNode {
    return { taskId, depends_on, status, depth: depends_on.length > 0 ? 1 : 0 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('task-dependency-dag: TaskDependencyDag', () => {
    let dag: TaskDependencyDag;

    beforeEach(() => {
        dag = new TaskDependencyDag();
    });

    // ── addTask / getTask ──────────────────────────────────────────────────

    it('addTask registers a node and getTask returns it', () => {
        dag.addTask(makeNode('t1'));
        const found = dag.getTask('t1');
        assert.ok(found, 'node should be retrievable');
        assert.equal(found?.taskId, 't1');
    });

    it('addTask throws if same taskId is registered twice', () => {
        dag.addTask(makeNode('t1'));
        assert.throws(
            () => dag.addTask(makeNode('t1')),
            /already registered/,
        );
    });

    it('removeTask removes the node', () => {
        dag.addTask(makeNode('t1'));
        dag.removeTask('t1');
        assert.equal(dag.getTask('t1'), undefined);
    });

    it('removeTask throws if taskId not found', () => {
        assert.throws(() => dag.removeTask('ghost'), /not found/);
    });

    it('hasTask returns true when present', () => {
        dag.addTask(makeNode('t1'));
        assert.equal(dag.hasTask('t1'), true);
    });

    it('hasTask returns false when absent', () => {
        assert.equal(dag.hasTask('missing'), false);
    });

    it('getAllTasks returns all registered nodes', () => {
        dag.addTask(makeNode('t1'));
        dag.addTask(makeNode('t2'));
        const all = dag.getAllTasks();
        assert.equal(all.length, 2);
    });

    // ── updateStatus ───────────────────────────────────────────────────────

    it('updateStatus changes the node status', () => {
        dag.addTask(makeNode('t1'));
        dag.updateStatus('t1', 'running');
        assert.equal(dag.getTask('t1')?.status, 'running');
    });

    it('updateStatus throws for unknown taskId', () => {
        assert.throws(() => dag.updateStatus('ghost', 'done'), /not found/);
    });

    // ── getReadyTasks ──────────────────────────────────────────────────────

    it('getReadyTasks returns pending tasks whose deps are all done', () => {
        dag.addTask(makeNode('t1', [], 'done'));
        dag.addTask(makeNode('t2', ['t1'], 'pending'));
        const ready = dag.getReadyTasks();
        assert.ok(ready.includes('t2'), 't2 should be ready');
    });

    it('getReadyTasks does not return tasks with pending deps', () => {
        dag.addTask(makeNode('t1', [], 'pending'));
        dag.addTask(makeNode('t2', ['t1'], 'pending'));
        const ready = dag.getReadyTasks();
        assert.ok(!ready.includes('t2'), 't2 should NOT be ready');
    });

    it('getReadyTasks does not return tasks that are already running', () => {
        dag.addTask(makeNode('t1', [], 'running'));
        const ready = dag.getReadyTasks();
        assert.ok(!ready.includes('t1'));
    });

    it('getReadyTasks returns root tasks when dag is fresh', () => {
        dag.addTask(makeNode('t1', [], 'pending'));
        dag.addTask(makeNode('t2', [], 'pending'));
        dag.addTask(makeNode('t3', ['t1'], 'pending'));
        const ready = dag.getReadyTasks();
        assert.ok(ready.includes('t1'));
        assert.ok(ready.includes('t2'));
        assert.ok(!ready.includes('t3'));
    });

    // ── getBlockedTasks ────────────────────────────────────────────────────

    it('getBlockedTasks returns explicitly blocked tasks', () => {
        dag.addTask(makeNode('t1', [], 'blocked'));
        const blocked = dag.getBlockedTasks();
        assert.ok(blocked.includes('t1'));
    });

    it('getBlockedTasks returns tasks whose dep has failed', () => {
        dag.addTask(makeNode('t1', [], 'failed'));
        dag.addTask(makeNode('t2', ['t1'], 'pending'));
        const blocked = dag.getBlockedTasks();
        assert.ok(blocked.includes('t2'));
    });

    it('getBlockedTasks does not return tasks whose deps are done', () => {
        dag.addTask(makeNode('t1', [], 'done'));
        dag.addTask(makeNode('t2', ['t1'], 'pending'));
        const blocked = dag.getBlockedTasks();
        assert.ok(!blocked.includes('t2'));
    });

    // ── getDependencies ────────────────────────────────────────────────────

    it('getDependencies returns direct deps', () => {
        dag.addTask(makeNode('t1'));
        dag.addTask(makeNode('t2', ['t1']));
        const deps = dag.getDependencies('t2', false);
        assert.deepEqual(deps, ['t1']);
    });

    it('getDependencies transitive=true traverses the full ancestor chain', () => {
        dag.addTask(makeNode('t1'));
        dag.addTask(makeNode('t2', ['t1']));
        dag.addTask(makeNode('t3', ['t2']));
        const trans = dag.getDependencies('t3', true);
        assert.ok(trans.includes('t1'), 'transitive should include t1');
        assert.ok(trans.includes('t2'), 'transitive should include t2');
    });

    it('getDependencies returns empty array for unknown taskId', () => {
        assert.deepEqual(dag.getDependencies('ghost'), []);
    });

    // ── getDependents ──────────────────────────────────────────────────────

    it('getDependents returns tasks that depend on a given task', () => {
        dag.addTask(makeNode('t1'));
        dag.addTask(makeNode('t2', ['t1']));
        dag.addTask(makeNode('t3', ['t1']));
        const dependents = dag.getDependents('t1');
        assert.ok(dependents.includes('t2'));
        assert.ok(dependents.includes('t3'));
    });

    // ── topologicalSort ────────────────────────────────────────────────────

    it('topologicalSort on empty dag returns ok with empty phases', () => {
        const plan = dag.topologicalSort();
        assert.equal(plan.ok, true);
        assert.equal(plan.total_tasks, 0);
        assert.deepEqual(plan.phases, []);
    });

    it('topologicalSort respects dependency ordering', () => {
        dag.addTask(makeNode('t1'));
        dag.addTask(makeNode('t2', ['t1']));
        dag.addTask(makeNode('t3', ['t2']));
        const plan = dag.topologicalSort();
        assert.equal(plan.ok, true);
        assert.equal(plan.cycle_detected, false);
        // t1 must come before t2, t2 before t3 in ordered list
        const ordered = plan.ordered;
        assert.ok(ordered.indexOf('t1') < ordered.indexOf('t2'), 't1 before t2');
        assert.ok(ordered.indexOf('t2') < ordered.indexOf('t3'), 't2 before t3');
    });

    it('topologicalSort groups independent tasks in the same phase', () => {
        dag.addTask(makeNode('t1'));
        dag.addTask(makeNode('t2'));
        dag.addTask(makeNode('t3', ['t1', 't2']));
        const plan = dag.topologicalSort();
        assert.equal(plan.ok, true);
        assert.equal(plan.phases.length, 2);
        const phase0 = plan.phases[0];
        assert.ok(phase0.includes('t1'));
        assert.ok(phase0.includes('t2'));
        assert.ok(plan.phases[1].includes('t3'));
    });

    it('topologicalSort detects a cycle', () => {
        dag.addTask({ taskId: 't1', depends_on: ['t3'], status: 'pending', depth: 1 });
        dag.addTask({ taskId: 't2', depends_on: ['t1'], status: 'pending', depth: 1 });
        dag.addTask({ taskId: 't3', depends_on: ['t2'], status: 'pending', depth: 1 });
        const plan = dag.topologicalSort();
        assert.equal(plan.ok, false);
        assert.equal(plan.cycle_detected, true);
        assert.ok(Array.isArray(plan.cycle_path) && plan.cycle_path.length > 0);
    });

    it('topologicalSort on a subset scope includes only specified tasks', () => {
        dag.addTask(makeNode('t1'));
        dag.addTask(makeNode('t2', ['t1']));
        dag.addTask(makeNode('t3', ['t2']));
        const plan = dag.topologicalSort(['t1', 't2']);
        assert.ok(plan.ordered.includes('t1'));
        assert.ok(plan.ordered.includes('t2'));
        assert.ok(!plan.ordered.includes('t3'));
    });

    // ── detectCycle ────────────────────────────────────────────────────────

    it('detectCycle returns empty array when no cycle exists', () => {
        dag.addTask(makeNode('t1'));
        dag.addTask(makeNode('t2', ['t1']));
        const path = dag.detectCycle();
        assert.deepEqual(path, []);
    });

    it('detectCycle returns a non-empty path when a cycle exists', () => {
        dag.addTask({ taskId: 'a', depends_on: ['b'], status: 'pending', depth: 1 });
        dag.addTask({ taskId: 'b', depends_on: ['a'], status: 'pending', depth: 1 });
        const path = dag.detectCycle();
        assert.ok(path.length > 0, 'should return cycle path');
    });

    // ── validate ───────────────────────────────────────────────────────────

    it('validate returns valid=true for a clean dag', () => {
        dag.addTask(makeNode('t1'));
        dag.addTask(makeNode('t2', ['t1']));
        const result = dag.validate();
        assert.equal(result.valid, true);
        assert.deepEqual(result.errors, []);
    });

    it('validate detects missing dependency', () => {
        dag.addTask({ taskId: 'child', depends_on: ['nonexistent'], status: 'pending', depth: 1 });
        const result = dag.validate();
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes('nonexistent')));
    });

    it('validate detects unknown taskId in provided scope', () => {
        dag.addTask(makeNode('t1'));
        const result = dag.validate(['t1', 'ghost']);
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.includes('ghost')));
    });

    it('validate detects cycle', () => {
        dag.addTask({ taskId: 'x', depends_on: ['y'], status: 'pending', depth: 1 });
        dag.addTask({ taskId: 'y', depends_on: ['x'], status: 'pending', depth: 1 });
        const result = dag.validate();
        assert.equal(result.valid, false);
        assert.ok(result.errors.some((e) => e.toLowerCase().includes('cycle')));
    });

    // ── toGraph ────────────────────────────────────────────────────────────

    it('toGraph exports nodes with rootIds and leafIds', () => {
        dag.addTask(makeNode('root', []));
        dag.addTask(makeNode('mid', ['root']));
        dag.addTask(makeNode('leaf', ['mid']));
        const graph = dag.toGraph();
        assert.ok(graph.rootIds.includes('root'));
        assert.ok(graph.leafIds.includes('leaf'));
        assert.ok(!graph.rootIds.includes('leaf'));
        assert.ok(!graph.leafIds.includes('root'));
    });

    it('toGraph maps dependents correctly', () => {
        dag.addTask(makeNode('t1'));
        dag.addTask(makeNode('t2', ['t1']));
        dag.addTask(makeNode('t3', ['t1']));
        const graph = dag.toGraph();
        const t1Node = graph.nodes.find((n) => n.taskId === 't1');
        assert.ok(t1Node?.dependents.includes('t2'));
        assert.ok(t1Node?.dependents.includes('t3'));
    });

    it('toGraph contains all task nodes', () => {
        dag.addTask(makeNode('a'));
        dag.addTask(makeNode('b', ['a']));
        const graph = dag.toGraph();
        assert.equal(graph.nodes.length, 2);
    });

    it('toGraph preserves metadata', () => {
        dag.addTask({ taskId: 'meta', depends_on: [], status: 'pending', depth: 0, metadata: { priority: 'high' } });
        const graph = dag.toGraph();
        const found = graph.nodes.find((n) => n.taskId === 'meta');
        assert.deepEqual(found?.metadata, { priority: 'high' });
    });

    // ── globalTaskDag singleton ────────────────────────────────────────────

    it('globalTaskDag is exported as a singleton instance', () => {
        assert.ok(globalTaskDag instanceof TaskDependencyDag);
    });
});
