/**
 * Skill Pipeline Composition Engine
 *
 * DAG-based skill chaining with conditional branching, error handling, and output mapping.
 *
 * Enables: skill1(input) → skill2(output) → skill3(output) workflows
 * With branching on failure, output transformation, and conditional routing.
 */

import { randomUUID } from 'node:crypto';
import type {
    SkillCompositionDAG,
    CompositionRunRecord,
    CompositionExecutionResult,
    CompositionNode,
    EdgeCondition,
} from '@agentfarm/shared-types';
import { getSkillHandler } from './skill-execution-engine.js';
import type { SkillOutput } from './skill-execution-engine.js';

export class SkillCompositionEngine {
    private compositions = new Map<string, SkillCompositionDAG>();
    private runHistory: CompositionExecutionResult[] = [];

    /**
     * Register a composition DAG.
     */
    registerComposition(dag: SkillCompositionDAG): void {
        this.compositions.set(dag.composition_id, dag);
    }

    /**
     * Execute a composition DAG.
     */
    async execute(compositionId: string, initialInputs: Record<string, unknown>): Promise<CompositionExecutionResult> {
        const dag = this.compositions.get(compositionId);
        if (!dag) {
            return {
                run_id: randomUUID(),
                composition_id: compositionId,
                success: false,
                node_outputs: {},
                final_output: { error: 'composition_not_found' },
                duration_ms: 0,
                path_taken: [],
            };
        }

        const runId = randomUUID();
        const startedAt = Date.now();
        const nodeOutputs = new Map<string, Record<string, unknown>>();
        const pathTaken: string[] = [];
        let currentNodeId = dag.entry_node_id;
        let success = true;
        let failureAt: string | undefined;

        // Execute nodes in topological order
        const visited = new Set<string>();

        while (currentNodeId && !visited.has(currentNodeId)) {
            visited.add(currentNodeId);
            pathTaken.push(currentNodeId);

            const node = dag.nodes.find((n) => n.id === currentNodeId);
            if (!node) {
                failureAt = currentNodeId;
                break;
            }

            // Terminal node — stop execution
            if (node.type === 'terminal') {
                break;
            }

            // Execute skill node
            if (node.type === 'skill' && node.skill_id) {
                const handler = getSkillHandler(node.skill_id);
                if (!handler) {
                    if (!node.allow_failure) {
                        success = false;
                        failureAt = currentNodeId;
                        break;
                    }
                } else {
                    // Build input by mapping from previous outputs
                    const nodeInput = this.mapInputs(node.inputs || {}, nodeOutputs, initialInputs);
                    const output = handler(nodeInput, Date.now());
                    nodeOutputs.set(currentNodeId, output.result);

                    if (!output.ok && !node.allow_failure) {
                        success = false;
                        failureAt = currentNodeId;
                        break;
                    }
                }
            }

            // Find next node based on edges and conditions
            const outgoingEdges = dag.edges.filter((e) => e.from === currentNodeId);

            if (outgoingEdges.length === 0) {
                // No outgoing edges, find exit node or terminal
                const exitNode = dag.exit_nodes.find((n) => visited.has(n));
                if (exitNode) {
                    currentNodeId = exitNode;
                } else {
                    break;
                }
            } else {
                // Evaluate edges and take first matching one
                let nextFound = false;
                for (const edge of outgoingEdges) {
                    if (this.evaluateCondition(edge.condition, nodeOutputs.get(currentNodeId) || {})) {
                        currentNodeId = edge.to;
                        nextFound = true;
                        break;
                    }
                }

                if (!nextFound) {
                    // No matching condition, take first edge
                    currentNodeId = outgoingEdges[0].to;
                }
            }
        }

        const finalOutput = nodeOutputs.get(currentNodeId) || { composition_result: Array.from(nodeOutputs.values()) };
        const result: CompositionExecutionResult = {
            run_id: runId,
            composition_id: compositionId,
            success,
            node_outputs: Object.fromEntries(nodeOutputs),
            final_output: finalOutput,
            duration_ms: Date.now() - startedAt,
            path_taken: pathTaken,
            failure_at: failureAt,
        };

        this.runHistory.push(result);
        if (this.runHistory.length > 100) {
            this.runHistory = this.runHistory.slice(-100);
        }

        return result;
    }

    /**
     * Map inputs using output transformation rules.
     */
    private mapInputs(
        nodeInputs: Record<string, unknown>,
        previousOutputs: Map<string, Record<string, unknown>>,
        initialInputs: Record<string, unknown>,
    ): Record<string, unknown> {
        const mapped: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(nodeInputs)) {
            if (typeof value === 'string' && value.startsWith('$.')) {
                // JSONPath-like reference to previous output
                const path = value.substring(2).split('.');
                let current: any = previousOutputs.get(path[0]);
                for (let i = 1; i < path.length; i++) {
                    current = current?.[path[i]];
                }
                mapped[key] = current ?? value;
            } else {
                mapped[key] = value ?? initialInputs[key];
            }
        }

        return mapped;
    }

    /**
     * Evaluate a condition against node output.
     */
    private evaluateCondition(condition: EdgeCondition, output: Record<string, unknown>): boolean {
        switch (condition.type) {
            case 'success':
                return (output.ok || output.success) !== false;

            case 'failure':
                return (output.ok || output.success) === false;

            case 'output_matches':
                if (!condition.pattern) return false;
                const pattern = new RegExp(condition.pattern);
                return pattern.test(JSON.stringify(output));

            case 'always':
                return true;

            default:
                return false;
        }
    }

    /**
     * Get recent runs.
     */
    getRecentRuns(limit = 20): CompositionExecutionResult[] {
        return this.runHistory.slice(-limit).reverse();
    }

    /**
     * Get a specific run.
     */
    getRunById(runId: string): CompositionExecutionResult | undefined {
        return this.runHistory.find((r) => r.run_id === runId);
    }

    /**
     * List all compositions.
     */
    listCompositions(): SkillCompositionDAG[] {
        return Array.from(this.compositions.values());
    }
}

export const globalCompositionEngine = new SkillCompositionEngine();
