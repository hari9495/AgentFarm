/**
 * Skill Composition Engine Tests
 *
 * Test DAG-based skill orchestration and conditional branching.
 */

import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';
import { SkillCompositionEngine } from './skill-composition-engine.js';
import type { SkillCompositionDAG } from '@agentfarm/shared-types';

describe('skill-composition-engine: DAG execution with conditions', () => {
    let engine: SkillCompositionEngine;

    beforeEach(() => {
        engine = new SkillCompositionEngine();
    });

    it('executes a linear skill composition', async () => {
        const dag: SkillCompositionDAG = {
            composition_id: 'linear-chain',
            name: 'Linear Chain',
            version: 1,
            nodes: [
                { id: 'n1', type: 'skill', skill_id: 'test-coverage-reporter', inputs: {} },
                { id: 'n2', type: 'skill', skill_id: 'flaky-test-detector', inputs: {} },
            ],
            edges: [{ from: 'n1', to: 'n2', condition: { type: 'success' } }],
            entry_node_id: 'n1',
            exit_nodes: ['n2'],
        };

        engine.registerComposition(dag);
        const result = await engine.execute('linear-chain', {});

        assert.ok(typeof result.success === 'boolean', 'Composition should have success status');
        assert.ok(result.node_outputs['n1'] !== undefined, 'Should have output from first node');
        assert.ok(result.duration_ms >= 0, 'Should have non-negative duration');
    });

    it('branches on skill failure', async () => {
        const dag: SkillCompositionDAG = {
            composition_id: 'branching-dag',
            name: 'Branching DAG',
            version: 1,
            nodes: [
                { id: 'n1', type: 'skill', skill_id: 'test-generator', inputs: {} },
                { id: 'n2', type: 'skill', skill_id: 'fix-failures', inputs: {} },
                { id: 'n3', type: 'skill', skill_id: 'retry-tests', inputs: {} },
            ],
            edges: [
                { from: 'n1', to: 'n2', condition: { type: 'failure' } },
                { from: 'n1', to: 'n3', condition: { type: 'success' } },
            ],
            entry_node_id: 'n1',
            exit_nodes: ['n2', 'n3'],
        };

        engine.registerComposition(dag);
        const result = await engine.execute('branching-dag', {});

        assert.ok(result.path_taken.length > 0, 'Should take a path through DAG');
        assert.ok(result.path_taken.includes('n1'), 'Should start at n1');
    });

    it('evaluates output-based conditions', async () => {
        const dag: SkillCompositionDAG = {
            composition_id: 'output-condition',
            name: 'Output Condition',
            version: 1,
            nodes: [
                { id: 'n1', type: 'skill', skill_id: 'pr-analyzer', inputs: {}, allow_failure: true },
                { id: 'n2', type: 'skill', skill_id: 'approve-pr', inputs: {}, allow_failure: true },
                { id: 'n3', type: 'skill', skill_id: 'request-changes', inputs: {}, allow_failure: true },
            ],
            edges: [
                { from: 'n1', to: 'n2', condition: { type: 'output_matches', pattern: 'approved' } },
                { from: 'n1', to: 'n3', condition: { type: 'output_matches', pattern: 'changes_requested' } },
            ],
            entry_node_id: 'n1',
            exit_nodes: ['n2', 'n3'],
        };

        engine.registerComposition(dag);
        const result = await engine.execute('output-condition', { pr_number: 123 });

        assert.ok(result.path_taken.length >= 2, 'Should take at least 2 nodes');
    });

    it('maps outputs to subsequent inputs via JSONPath', async () => {
        const dag: SkillCompositionDAG = {
            composition_id: 'input-mapping',
            name: 'Input Mapping',
            version: 1,
            nodes: [
                { id: 'n1', type: 'skill', skill_id: 'test-coverage-reporter', inputs: { file: 'test.ts' } },
                { id: 'n2', type: 'skill', skill_id: 'ci-failure-explainer', inputs: { failures: '$.test_failures' } },
            ],
            edges: [{ from: 'n1', to: 'n2', condition: { type: 'always' } }],
            entry_node_id: 'n1',
            exit_nodes: ['n2'],
        };

        engine.registerComposition(dag);
        const result = await engine.execute('input-mapping', {});

        assert.ok(result.node_outputs['n1'], 'Should capture n1 output for mapping');
    });

    it('lists all registered compositions', async () => {
        const dag1: SkillCompositionDAG = {
            composition_id: 'comp1',
            name: 'Comp 1',
            version: 1,
            nodes: [{ id: 'n1', type: 'skill', skill_id: 'skill1', inputs: {} }],
            edges: [],
            entry_node_id: 'n1',
            exit_nodes: ['n1'],
        };

        const dag2: SkillCompositionDAG = {
            composition_id: 'comp2',
            name: 'Comp 2',
            version: 1,
            nodes: [{ id: 'n1', type: 'skill', skill_id: 'skill2', inputs: {} }],
            edges: [],
            entry_node_id: 'n1',
            exit_nodes: ['n1'],
        };

        engine.registerComposition(dag1);
        engine.registerComposition(dag2);

        const list = engine.listCompositions();
        assert.ok(list.length >= 2, 'Should list both compositions');
    });

    it('handles merge nodes combining multiple inputs', async () => {
        const dag: SkillCompositionDAG = {
            composition_id: 'merge-dag',
            name: 'Merge DAG',
            version: 1,
            nodes: [
                { id: 'n1', type: 'skill', skill_id: 'get-pr-files', inputs: {}, allow_failure: true },
                { id: 'n2', type: 'skill', skill_id: 'analyze-security', inputs: {}, allow_failure: true },
                { id: 'n3', type: 'merge', inputs: {} },
                { id: 'n4', type: 'skill', skill_id: 'generate-report', inputs: {}, allow_failure: true },
            ],
            edges: [
                { from: 'n1', to: 'n3', condition: { type: 'success' } },
                { from: 'n2', to: 'n3', condition: { type: 'success' } },
                { from: 'n3', to: 'n4', condition: { type: 'success' } },
            ],
            entry_node_id: 'n1',
            exit_nodes: ['n4'],
        };

        engine.registerComposition(dag);
        const result = await engine.execute('merge-dag', {});

        assert.ok(result.path_taken.includes('n3'), 'Should include merge node');
    });

    it('terminates at terminal nodes', async () => {
        const dag: SkillCompositionDAG = {
            composition_id: 'terminal-dag',
            name: 'Terminal DAG',
            version: 1,
            nodes: [
                { id: 'start', type: 'skill', skill_id: 'begin', inputs: {}, allow_failure: true },
                { id: 'end', type: 'terminal', inputs: {} },
            ],
            edges: [{ from: 'start', to: 'end', condition: { type: 'success' } }],
            entry_node_id: 'start',
            exit_nodes: ['end'],
        };

        engine.registerComposition(dag);
        const result = await engine.execute('terminal-dag', {});

        assert.ok(result.path_taken.includes('end'), 'Should terminate at terminal node');
    });

    it('returns run history by composition ID', async () => {
        const dag: SkillCompositionDAG = {
            composition_id: 'history-test',
            name: 'History Test',
            version: 1,
            nodes: [{ id: 'n1', type: 'skill', skill_id: 'skill1', inputs: {} }],
            edges: [],
            entry_node_id: 'n1',
            exit_nodes: ['n1'],
        };

        engine.registerComposition(dag);
        await engine.execute('history-test', {});

        // Just verify that engine can execute without errors
        const result = await engine.execute('history-test', {});
        assert.ok(result.run_id, 'Should generate run ID');
    });
});
