/**
 * Task Dependency DAG
 *
 * Models task execution dependencies as a directed acyclic graph.
 * Enables topology-sorted execution plans, parallel-safe phase batching,
 * cycle detection, and runtime status tracking per task node.
 *
 * Adapted from skill-dependency-dag.ts — same Kahn's + DFS algorithms,
 * adapted for task-queue-level orchestration rather than skill pipelines.
 * Key differences from skill dag:
 *   - Node keyed by taskId (not skill_id)
 *   - Carries runtime status: pending | running | done | failed | blocked
 *   - No feeds_into or tags — tasks push output explicitly
 *   - Adds updateStatus(), getReadyTasks(), getBlockedTasks(), toGraph()
 *   - validate() operates on all nodes when called with no argument
 */

import type {
    TaskDepStatus,
    TaskDependencyNode,
    TaskDependencyGraph,
} from '@agentfarm/shared-types';

// ---------------------------------------------------------------------------
// Internal node type
// ---------------------------------------------------------------------------

export type TaskDagNode = {
    taskId: string;
    label?: string;
    /** Task IDs that must reach status 'done' before this task can run */
    depends_on: string[];
    status: TaskDepStatus;
    depth: number;
    metadata?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Return types
// ---------------------------------------------------------------------------

export type TaskTopologicalPlan = {
    ok: boolean;
    phases: string[][];
    /** Flat ordered list derived from phases */
    ordered: string[];
    cycle_detected: boolean;
    cycle_path?: string[];
    total_tasks: number;
};

export type TaskDagValidationResult = {
    valid: boolean;
    errors: string[];
};

// ---------------------------------------------------------------------------
// TaskDependencyDag
// ---------------------------------------------------------------------------

export class TaskDependencyDag {
    private nodes: Map<string, TaskDagNode> = new Map();

    // ── Node management ────────────────────────────────────────────────────

    addTask(node: TaskDagNode): void {
        if (this.nodes.has(node.taskId)) {
            throw new Error(`Task "${node.taskId}" is already registered in the DAG`);
        }
        this.nodes.set(node.taskId, { ...node });
    }

    removeTask(taskId: string): void {
        if (!this.nodes.has(taskId)) {
            throw new Error(`Task "${taskId}" not found in the DAG`);
        }
        this.nodes.delete(taskId);
    }

    getTask(taskId: string): TaskDagNode | undefined {
        return this.nodes.get(taskId);
    }

    hasTask(taskId: string): boolean {
        return this.nodes.has(taskId);
    }

    getAllTasks(): TaskDagNode[] {
        return Array.from(this.nodes.values());
    }

    // ── Status management ──────────────────────────────────────────────────

    updateStatus(taskId: string, status: TaskDepStatus): void {
        const node = this.nodes.get(taskId);
        if (!node) {
            throw new Error(`Task "${taskId}" not found in the DAG`);
        }
        node.status = status;
    }

    // ── Readiness queries ──────────────────────────────────────────────────

    /**
     * Returns taskIds that are pending AND have all dependencies done.
     * These tasks are ready to start executing.
     */
    getReadyTasks(): string[] {
        const ready: string[] = [];
        for (const node of this.nodes.values()) {
            if (node.status !== 'pending') continue;
            const allDepsDone = node.depends_on.every((depId) => {
                const dep = this.nodes.get(depId);
                return dep?.status === 'done';
            });
            if (allDepsDone) {
                ready.push(node.taskId);
            }
        }
        return ready;
    }

    /**
     * Returns taskIds that are blocked — either explicitly status='blocked'
     * or whose depends_on list contains a task with status='failed'.
     */
    getBlockedTasks(): string[] {
        const blocked: string[] = [];
        for (const node of this.nodes.values()) {
            if (node.status === 'blocked') {
                blocked.push(node.taskId);
                continue;
            }
            const hasFailedDep = node.depends_on.some((depId) => {
                const dep = this.nodes.get(depId);
                return dep?.status === 'failed';
            });
            if (hasFailedDep) {
                blocked.push(node.taskId);
            }
        }
        return blocked;
    }

    // ── Dependency queries ─────────────────────────────────────────────────

    getDependencies(taskId: string, transitive = false): string[] {
        const node = this.nodes.get(taskId);
        if (!node) return [];
        if (!transitive) return [...node.depends_on];

        const visited = new Set<string>();
        const queue = [...node.depends_on];
        while (queue.length > 0) {
            const id = queue.shift()!;
            if (visited.has(id)) continue;
            visited.add(id);
            const dep = this.nodes.get(id);
            if (dep) queue.push(...dep.depends_on);
        }
        return Array.from(visited);
    }

    getDependents(taskId: string): string[] {
        return Array.from(this.nodes.values())
            .filter((n) => n.depends_on.includes(taskId))
            .map((n) => n.taskId);
    }

    // ── Topology sort (Kahn's algorithm) ──────────────────────────────────

    topologicalSort(taskIds?: string[]): TaskTopologicalPlan {
        const scope = taskIds ? new Set(taskIds) : new Set(this.nodes.keys());
        const inDegree = new Map<string, number>();
        const adjList = new Map<string, string[]>();

        for (const id of scope) {
            inDegree.set(id, 0);
            adjList.set(id, []);
        }

        for (const id of scope) {
            const node = this.nodes.get(id);
            if (!node) continue;
            for (const dep of node.depends_on) {
                if (!scope.has(dep)) continue;
                adjList.get(dep)!.push(id);
                inDegree.set(id, (inDegree.get(id) ?? 0) + 1);
            }
        }

        const phases: string[][] = [];
        const ordered: string[] = [];
        const remaining = new Set(scope);

        while (remaining.size > 0) {
            const phase = Array.from(remaining).filter((id) => (inDegree.get(id) ?? 0) === 0);
            if (phase.length === 0) {
                // Cycle detected — find it
                const cyclePath = this.detectCycle(scope);
                return {
                    ok: false,
                    phases,
                    ordered,
                    cycle_detected: true,
                    cycle_path: cyclePath,
                    total_tasks: scope.size,
                };
            }
            phases.push(phase.sort());
            ordered.push(...phase.sort());
            for (const id of phase) {
                remaining.delete(id);
                for (const next of (adjList.get(id) ?? [])) {
                    inDegree.set(next, (inDegree.get(next) ?? 0) - 1);
                }
            }
        }

        return {
            ok: true,
            phases,
            ordered,
            cycle_detected: false,
            total_tasks: scope.size,
        };
    }

    detectCycle(scope?: Set<string>): string[] {
        const searchScope = scope ?? new Set(this.nodes.keys());
        const visited = new Set<string>();
        const inStack = new Set<string>();
        const path: string[] = [];

        const dfs = (id: string): boolean => {
            if (inStack.has(id)) {
                path.push(id);
                return true;
            }
            if (visited.has(id)) return false;
            visited.add(id);
            inStack.add(id);
            const node = this.nodes.get(id);
            for (const dep of (node?.depends_on ?? [])) {
                if (!searchScope.has(dep)) continue;
                if (dfs(dep)) {
                    path.push(id);
                    return true;
                }
            }
            inStack.delete(id);
            return false;
        };

        for (const id of searchScope) {
            if (dfs(id)) return path.reverse();
        }
        return [];
    }

    // ── Validation ─────────────────────────────────────────────────────────

    /**
     * Validate the DAG. If taskIds is provided, validates only that subset.
     * Otherwise validates all registered tasks.
     */
    validate(taskIds?: string[]): TaskDagValidationResult {
        const scope = taskIds ?? Array.from(this.nodes.keys());
        const errors: string[] = [];
        const scopeSet = new Set(scope);

        for (const id of scope) {
            if (!this.nodes.has(id)) {
                errors.push(`Unknown task: "${id}"`);
                continue;
            }
            const node = this.nodes.get(id)!;
            for (const dep of node.depends_on) {
                if (!this.nodes.has(dep)) {
                    errors.push(`Task "${id}" depends on unknown task "${dep}"`);
                }
            }
        }

        const plan = this.topologicalSort(scope);
        if (plan.cycle_detected) {
            errors.push(`Cycle detected: ${plan.cycle_path?.join(' → ')}`);
        }

        // Validate cross-scope references only within scope
        for (const id of scope) {
            const node = this.nodes.get(id);
            if (!node) continue;
            for (const dep of node.depends_on) {
                if (scopeSet.has(dep) && !this.nodes.has(dep)) {
                    errors.push(`Task "${id}" references unknown task "${dep}" within scope`);
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
        };
    }

    // ── Graph export ───────────────────────────────────────────────────────

    /**
     * Exports the full DAG as a TaskDependencyGraph (shared-types contract).
     * Maps internal TaskDagNode fields to TaskDependencyNode shape.
     */
    toGraph(): TaskDependencyGraph {
        const allNodes = Array.from(this.nodes.values());

        // Build a reverse-dependency index for the dependents field
        const dependentsMap = new Map<string, string[]>();
        for (const node of allNodes) {
            if (!dependentsMap.has(node.taskId)) {
                dependentsMap.set(node.taskId, []);
            }
            for (const depId of node.depends_on) {
                const existing = dependentsMap.get(depId) ?? [];
                existing.push(node.taskId);
                dependentsMap.set(depId, existing);
            }
        }

        const nodes: TaskDependencyNode[] = allNodes.map((n) => ({
            taskId: n.taskId,
            label: n.label,
            status: n.status,
            dependsOn: n.depends_on,
            dependents: dependentsMap.get(n.taskId) ?? [],
            depth: n.depth,
            metadata: n.metadata,
        }));

        const rootIds = allNodes
            .filter((n) => n.depends_on.length === 0)
            .map((n) => n.taskId);

        const leafIds = allNodes
            .filter((n) => (dependentsMap.get(n.taskId) ?? []).length === 0)
            .map((n) => n.taskId);

        return { nodes, rootIds, leafIds };
    }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const globalTaskDag = new TaskDependencyDag();
