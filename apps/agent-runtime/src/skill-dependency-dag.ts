/**
 * Skill Dependency DAG — Tier I
 *
 * Models the natural skill execution dependencies as a directed acyclic graph.
 * Enables topology-sorted execution plans, parallel-safe batching,
 * and validation of user-defined pipeline ordering.
 *
 * Each skill node declares which skills it "depends on" (must run first)
 * and which skills it "feeds into" (natural next steps).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SkillDagNode = {
    skill_id: string;
    label: string;
    tags: string[];
    /** Skills that must complete successfully before this skill can run */
    depends_on: string[];
    /** Skills that naturally benefit from this skill's output */
    feeds_into: string[];
    /** Risk level — used to gate approval requirements */
    risk_level: 'low' | 'medium' | 'high';
};

export type DagEdge = {
    from: string;
    to: string;
    type: 'depends_on' | 'feeds_into';
};

export type TopologicalPlan = {
    ok: boolean;
    phases: string[][];
    /** Flat ordered list derived from phases */
    ordered: string[];
    cycle_detected: boolean;
    cycle_path?: string[];
    total_skills: number;
};

export type DagValidationResult = {
    valid: boolean;
    issues: string[];
    missing_deps: string[];
    unknown_skills: string[];
};

// ---------------------------------------------------------------------------
// Built-in DAG definition
// ---------------------------------------------------------------------------

const BUILTIN_NODES: SkillDagNode[] = [
    // ── Analysis phase ────────────────────────────────────────────────────
    {
        skill_id: 'dependency-audit',
        label: 'Dependency Audit',
        tags: ['security', 'dependencies'],
        depends_on: [],
        feeds_into: ['license-compliance-check', 'docker-image-scanner'],
        risk_level: 'low',
    },
    {
        skill_id: 'monorepo-dep-graph',
        label: 'Monorepo Dependency Graph',
        tags: ['analysis', 'dependencies'],
        depends_on: [],
        feeds_into: ['dead-code-detector', 'code-churn-analyzer'],
        risk_level: 'low',
    },
    {
        skill_id: 'dead-code-detector',
        label: 'Dead Code Detector',
        tags: ['quality', 'cleanup'],
        depends_on: ['monorepo-dep-graph'],
        feeds_into: ['refactor-advisor'],
        risk_level: 'low',
    },
    {
        skill_id: 'code-churn-analyzer',
        label: 'Code Churn Analyzer',
        tags: ['quality', 'analysis'],
        depends_on: [],
        feeds_into: ['refactor-advisor', 'pr-reviewer-risk-labels'],
        risk_level: 'low',
    },
    // ── PR phase ──────────────────────────────────────────────────────────
    {
        skill_id: 'pr-reviewer-risk-labels',
        label: 'PR Risk Labeler',
        tags: ['pr', 'review'],
        depends_on: [],
        feeds_into: ['pr-description-generator', 'pr-size-enforcer'],
        risk_level: 'low',
    },
    {
        skill_id: 'pr-size-enforcer',
        label: 'PR Size Enforcer',
        tags: ['pr', 'quality'],
        depends_on: [],
        feeds_into: ['commit-message-linter'],
        risk_level: 'low',
    },
    {
        skill_id: 'commit-message-linter',
        label: 'Commit Message Linter',
        tags: ['pr', 'quality'],
        depends_on: ['pr-size-enforcer'],
        feeds_into: ['changelog-diff-validator'],
        risk_level: 'low',
    },
    {
        skill_id: 'pr-description-generator',
        label: 'PR Description Generator',
        tags: ['pr', 'documentation'],
        depends_on: ['pr-reviewer-risk-labels'],
        feeds_into: [],
        risk_level: 'low',
    },
    // ── Quality phase ─────────────────────────────────────────────────────
    {
        skill_id: 'type-coverage-reporter',
        label: 'Type Coverage Reporter',
        tags: ['quality', 'typescript'],
        depends_on: [],
        feeds_into: ['test-coverage-gatekeeper'],
        risk_level: 'low',
    },
    {
        skill_id: 'test-name-reviewer',
        label: 'Test Name Reviewer',
        tags: ['testing', 'quality'],
        depends_on: [],
        feeds_into: ['test-coverage-gatekeeper'],
        risk_level: 'low',
    },
    {
        skill_id: 'test-coverage-gatekeeper',
        label: 'Test Coverage Gatekeeper',
        tags: ['testing', 'quality', 'gating'],
        depends_on: ['type-coverage-reporter'],
        feeds_into: [],
        risk_level: 'low',
    },
    {
        skill_id: 'accessibility-checker',
        label: 'Accessibility Checker',
        tags: ['quality', 'a11y', 'frontend'],
        depends_on: [],
        feeds_into: [],
        risk_level: 'low',
    },
    // ── Security phase ────────────────────────────────────────────────────
    {
        skill_id: 'secrets-scanner',
        label: 'Secrets Scanner',
        tags: ['security', 'compliance'],
        depends_on: [],
        feeds_into: ['license-compliance-check'],
        risk_level: 'high',
    },
    {
        skill_id: 'license-compliance-check',
        label: 'License Compliance Check',
        tags: ['security', 'legal'],
        depends_on: ['dependency-audit'],
        feeds_into: [],
        risk_level: 'medium',
    },
    {
        skill_id: 'docker-image-scanner',
        label: 'Docker Image Scanner',
        tags: ['security', 'containers'],
        depends_on: ['dependency-audit'],
        feeds_into: ['rollback-advisor'],
        risk_level: 'medium',
    },
    {
        skill_id: 'openapi-spec-linter',
        label: 'OpenAPI Spec Linter',
        tags: ['quality', 'api'],
        depends_on: [],
        feeds_into: [],
        risk_level: 'low',
    },
    // ── Release phase ─────────────────────────────────────────────────────
    {
        skill_id: 'changelog-diff-validator',
        label: 'Changelog Diff Validator',
        tags: ['release', 'documentation'],
        depends_on: ['commit-message-linter'],
        feeds_into: ['migration-risk-scorer'],
        risk_level: 'low',
    },
    {
        skill_id: 'migration-risk-scorer',
        label: 'Migration Risk Scorer',
        tags: ['release', 'database', 'risk'],
        depends_on: ['changelog-diff-validator'],
        feeds_into: ['rollback-advisor'],
        risk_level: 'high',
    },
    {
        skill_id: 'rollback-advisor',
        label: 'Rollback Advisor',
        tags: ['release', 'operations'],
        depends_on: ['migration-risk-scorer'],
        feeds_into: [],
        risk_level: 'medium',
    },
    // ── Ops phase ─────────────────────────────────────────────────────────
    {
        skill_id: 'env-var-auditor',
        label: 'Env Var Auditor',
        tags: ['ops', 'configuration'],
        depends_on: [],
        feeds_into: [],
        risk_level: 'low',
    },
    {
        skill_id: 'stale-pr-detector',
        label: 'Stale PR Detector',
        tags: ['ops', 'pr'],
        depends_on: [],
        feeds_into: [],
        risk_level: 'low',
    },
    {
        skill_id: 'refactor-advisor',
        label: 'Refactor Advisor',
        tags: ['quality', 'refactor'],
        depends_on: ['dead-code-detector', 'code-churn-analyzer'],
        feeds_into: [],
        risk_level: 'low',
    },
    {
        skill_id: 'error-trace-analyzer',
        label: 'Error Trace Analyzer',
        tags: ['debugging', 'ops'],
        depends_on: [],
        feeds_into: ['rollback-advisor'],
        risk_level: 'low',
    },
    {
        skill_id: 'branch-manager',
        label: 'Branch Manager',
        tags: ['git', 'automation'],
        depends_on: [],
        feeds_into: ['issue-autopilot'],
        risk_level: 'medium',
    },
    {
        skill_id: 'issue-autopilot',
        label: 'Issue Autopilot',
        tags: ['git', 'automation'],
        depends_on: ['branch-manager'],
        feeds_into: ['pr-description-generator'],
        risk_level: 'medium',
    },
    {
        skill_id: 'docstring-generator',
        label: 'Docstring Generator',
        tags: ['documentation', 'code'],
        depends_on: [],
        feeds_into: [],
        risk_level: 'low',
    },
    {
        skill_id: 'readme-updater',
        label: 'README Updater',
        tags: ['documentation'],
        depends_on: ['docstring-generator'],
        feeds_into: [],
        risk_level: 'low',
    },
    {
        skill_id: 'performance-profiler',
        label: 'Performance Profiler',
        tags: ['performance'],
        depends_on: [],
        feeds_into: [],
        risk_level: 'low',
    },
];

// ---------------------------------------------------------------------------
// SkillDependencyDag
// ---------------------------------------------------------------------------

export class SkillDependencyDag {
    private nodes: Map<string, SkillDagNode> = new Map();

    constructor() {
        for (const node of BUILTIN_NODES) {
            this.nodes.set(node.skill_id, node);
        }
    }

    // ── Node management ────────────────────────────────────────────────────

    addNode(node: SkillDagNode): void {
        this.nodes.set(node.skill_id, node);
    }

    getNode(skillId: string): SkillDagNode | undefined {
        return this.nodes.get(skillId);
    }

    listNodes(): SkillDagNode[] {
        return Array.from(this.nodes.values());
    }

    // ── Edges ──────────────────────────────────────────────────────────────

    getEdges(): DagEdge[] {
        const edges: DagEdge[] = [];
        for (const node of this.nodes.values()) {
            for (const dep of node.depends_on) {
                edges.push({ from: dep, to: node.skill_id, type: 'depends_on' });
            }
            for (const feed of node.feeds_into) {
                edges.push({ from: node.skill_id, to: feed, type: 'feeds_into' });
            }
        }
        return edges;
    }

    getDependencies(skillId: string, transitive = false): string[] {
        const node = this.nodes.get(skillId);
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

    getDependents(skillId: string): string[] {
        return Array.from(this.nodes.values())
            .filter((n) => n.depends_on.includes(skillId))
            .map((n) => n.skill_id);
    }

    // ── Topology sort (Kahn's algorithm) ──────────────────────────────────

    topologicalSort(skillIds?: string[]): TopologicalPlan {
        const scope = skillIds ? new Set(skillIds) : new Set(this.nodes.keys());
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
        let remaining = new Set(scope);

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
                    total_skills: scope.size,
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
            total_skills: scope.size,
        };
    }

    private detectCycle(scope: Set<string>): string[] {
        const visited = new Set<string>();
        const stack = new Set<string>();
        const path: string[] = [];

        const dfs = (id: string): boolean => {
            if (stack.has(id)) {
                path.push(id);
                return true;
            }
            if (visited.has(id)) return false;
            visited.add(id);
            stack.add(id);
            const node = this.nodes.get(id);
            for (const dep of (node?.depends_on ?? [])) {
                if (!scope.has(dep)) continue;
                if (dfs(dep)) {
                    path.push(id);
                    return true;
                }
            }
            stack.delete(id);
            return false;
        };

        for (const id of scope) {
            if (dfs(id)) return path.reverse();
        }
        return [];
    }

    // ── Validation ─────────────────────────────────────────────────────────

    validate(skillIds: string[]): DagValidationResult {
        const issues: string[] = [];
        const missingDeps: string[] = [];
        const unknownSkills: string[] = [];

        for (const id of skillIds) {
            if (!this.nodes.has(id)) {
                unknownSkills.push(id);
                issues.push(`Unknown skill: ${id}`);
            }
        }

        const idSet = new Set(skillIds);
        for (const id of skillIds) {
            const node = this.nodes.get(id);
            if (!node) continue;
            for (const dep of node.depends_on) {
                if (!idSet.has(dep) && !this.nodes.has(dep)) {
                    missingDeps.push(dep);
                    issues.push(`Skill "${id}" depends on unknown skill "${dep}"`);
                }
            }
        }

        const plan = this.topologicalSort(skillIds);
        if (plan.cycle_detected) {
            issues.push(`Cycle detected: ${plan.cycle_path?.join(' → ')}`);
        }

        return {
            valid: issues.length === 0,
            issues,
            missing_deps: missingDeps,
            unknown_skills: unknownSkills,
        };
    }

    // ── Suggested execution plans ──────────────────────────────────────────

    suggestPlanForTags(tags: string[]): TopologicalPlan {
        const tagSet = new Set(tags);
        const matchingIds = Array.from(this.nodes.values())
            .filter((n) => n.tags.some((t) => tagSet.has(t)))
            .map((n) => n.skill_id);
        return this.topologicalSort(matchingIds);
    }

    getByRiskLevel(level: 'low' | 'medium' | 'high'): SkillDagNode[] {
        return Array.from(this.nodes.values()).filter((n) => n.risk_level === level);
    }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const globalDag = new SkillDependencyDag();
