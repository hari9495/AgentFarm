/**
 * Multi-Agent Orchestrator — Tier F Platform Upgrade
 *
 * Coordinates multiple specialized sub-agents running concurrently or in
 * sequence. Each sub-agent handles a narrow domain (coding, security,
 * testing, release, docs) and the orchestrator routes tasks by capability
 * match, collects results, and returns a unified aggregate output.
 *
 * Key capabilities:
 *  - Sub-agent registry with capability declarations
 *  - Task routing: exact-match → affinity-score → round-robin fallback
 *  - Parallel dispatch with per-agent timeout
 *  - Aggregate result reducer (merge, vote, first-wins)
 *  - Audit trail with per-step timing
 */

import { randomUUID } from 'node:crypto';
import { getSkillHandler } from './skill-execution-engine.js';
import type { SkillInput } from './skill-execution-engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentCapability =
    | 'code_analysis'
    | 'test_generation'
    | 'security_review'
    | 'release_management'
    | 'documentation'
    | 'dependency_management'
    | 'performance_analysis'
    | 'ci_monitoring';

export type AgentSpec = {
    id: string;
    name: string;
    capabilities: AgentCapability[];
    /** Skill IDs this agent can execute */
    skill_ids: string[];
    /** Optional execution weight — higher values are preferred for routing */
    affinity_weight?: number;
};

export type OrchestratorTask = {
    task_id: string;
    description: string;
    /** Required capabilities — used to select matching agents */
    required_capabilities: AgentCapability[];
    /** Skill invocations to run on matching agents */
    skill_invocations: Array<{ skill_id: string; inputs: Record<string, unknown> }>;
    /** How to combine results when multiple agents run the same skill */
    aggregation: 'merge' | 'vote' | 'first_wins';
    /** Max time (ms) per agent before we skip and move on */
    agent_timeout_ms?: number;
    dry_run?: boolean;
};

export type AgentInvocationResult = {
    agent_id: string;
    skill_id: string;
    ok: boolean;
    output: Record<string, unknown>;
    error?: string;
    duration_ms: number;
};

export type OrchestratorResult = {
    task_id: string;
    ok: boolean;
    agents_used: string[];
    invocation_results: AgentInvocationResult[];
    aggregated_output: Record<string, unknown>;
    total_duration_ms: number;
    audit_trail: Array<{ step: string; ts: string; detail?: string }>;
};

// ---------------------------------------------------------------------------
// Built-in agent registry
// ---------------------------------------------------------------------------

const BUILT_IN_AGENTS: AgentSpec[] = [
    {
        id: 'agent-code',
        name: 'Code Intelligence Agent',
        capabilities: ['code_analysis', 'documentation'],
        skill_ids: ['dead-code-detector', 'code-churn-analyzer', 'type-coverage-reporter', 'monorepo-dep-graph', 'commit-message-linter'],
        affinity_weight: 1.0,
    },
    {
        id: 'agent-test',
        name: 'Test & Quality Agent',
        capabilities: ['test_generation', 'ci_monitoring'],
        skill_ids: ['flaky-test-detector', 'test-coverage-reporter', 'test-name-reviewer', 'stale-pr-detector', 'pr-size-enforcer'],
        affinity_weight: 1.0,
    },
    {
        id: 'agent-security',
        name: 'Security Review Agent',
        capabilities: ['security_review', 'dependency_management'],
        skill_ids: ['dependency-audit', 'license-compliance-check', 'docker-image-scanner', 'env-var-auditor'],
        affinity_weight: 1.2,
    },
    {
        id: 'agent-release',
        name: 'Release Management Agent',
        capabilities: ['release_management', 'documentation'],
        skill_ids: ['release-notes-generator', 'changelog-diff-validator', 'pr-reviewer-risk-labels', 'migration-risk-scorer'],
        affinity_weight: 1.0,
    },
    {
        id: 'agent-perf',
        name: 'Performance & Observability Agent',
        capabilities: ['performance_analysis'],
        skill_ids: ['openapi-spec-linter', 'accessibility-checker', 'code-churn-analyzer'],
        affinity_weight: 0.9,
    },
];

// ---------------------------------------------------------------------------
// Multi-Agent Orchestrator
// ---------------------------------------------------------------------------

export class MultiAgentOrchestrator {
    private agents: Map<string, AgentSpec>;

    constructor(agents: AgentSpec[] = BUILT_IN_AGENTS) {
        this.agents = new Map(agents.map((a) => [a.id, a]));
    }

    registerAgent(agent: AgentSpec): void {
        this.agents.set(agent.id, agent);
    }

    listAgents(): AgentSpec[] {
        return Array.from(this.agents.values());
    }

    /** Select agents that satisfy all required capabilities */
    selectAgents(requiredCapabilities: AgentCapability[]): AgentSpec[] {
        return Array.from(this.agents.values())
            .filter((agent) =>
                requiredCapabilities.every((cap) => agent.capabilities.includes(cap))
            )
            .sort((a, b) => (b.affinity_weight ?? 1) - (a.affinity_weight ?? 1));
    }

    private async invokeSkill(
        agent: AgentSpec,
        skillId: string,
        inputs: Record<string, unknown>,
        timeoutMs: number,
        dryRun: boolean
    ): Promise<AgentInvocationResult> {
        const startedAt = Date.now();

        if (dryRun) {
            return {
                agent_id: agent.id,
                skill_id: skillId,
                ok: true,
                output: { dry_run: true, would_execute: true, skill_id: skillId, agent_id: agent.id },
                duration_ms: 0,
            };
        }

        if (!agent.skill_ids.includes(skillId)) {
            return {
                agent_id: agent.id,
                skill_id: skillId,
                ok: false,
                output: {},
                error: `Agent ${agent.id} does not have skill ${skillId} registered`,
                duration_ms: 0,
            };
        }

        const handler = getSkillHandler(skillId);
        if (!handler) {
            return {
                agent_id: agent.id,
                skill_id: skillId,
                ok: false,
                output: {},
                error: `No handler found for skill: ${skillId}`,
                duration_ms: Date.now() - startedAt,
            };
        }

        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Agent ${agent.id} timed out after ${timeoutMs}ms`)), timeoutMs)
        );

        try {
            const skillInput: SkillInput = {
                skill_id: skillId,
                inputs,
                workspace_id: (inputs['workspace_id'] as string | undefined) ?? 'default',
                bot_id: (inputs['bot_id'] as string | undefined) ?? agent.id,
                correlation_id: randomUUID(),
            };
            const result = await Promise.race([
                handler(skillInput, startedAt),
                timeoutPromise,
            ]);
            return {
                agent_id: agent.id,
                skill_id: skillId,
                ok: result.ok,
                output: result.result ?? {},
                error: result.ok ? undefined : result.summary,
                duration_ms: Date.now() - startedAt,
            };
        } catch (err) {
            return {
                agent_id: agent.id,
                skill_id: skillId,
                ok: false,
                output: {},
                error: err instanceof Error ? err.message : String(err),
                duration_ms: Date.now() - startedAt,
            };
        }
    }

    /** Aggregate results from multiple agents for the same skill */
    private aggregate(
        results: AgentInvocationResult[],
        strategy: OrchestratorTask['aggregation']
    ): Record<string, unknown> {
        const successful = results.filter((r) => r.ok);
        if (successful.length === 0) {
            return { ok: false, error: 'All agents failed', agents_tried: results.map((r) => r.agent_id) };
        }

        switch (strategy) {
            case 'first_wins':
                return { ...successful[0].output, _agent_id: successful[0].agent_id };
            case 'vote': {
                // Vote: pick the output that appears most often (compare by JSON key set size)
                const sorted = [...successful].sort((a, b) =>
                    Object.keys(b.output).length - Object.keys(a.output).length
                );
                return { ...sorted[0].output, _vote_count: successful.length };
            }
            case 'merge':
            default: {
                const merged: Record<string, unknown> = { _agents_contributed: successful.map((r) => r.agent_id) };
                for (const result of successful) {
                    for (const [key, value] of Object.entries(result.output)) {
                        if (!(key in merged)) {
                            merged[key] = value;
                        }
                    }
                }
                return merged;
            }
        }
    }

    async dispatch(task: OrchestratorTask): Promise<OrchestratorResult> {
        const startedAt = Date.now();
        const auditTrail: OrchestratorResult['audit_trail'] = [];
        const allResults: AgentInvocationResult[] = [];
        const timeoutMs = task.agent_timeout_ms ?? 30_000;

        const ts = () => new Date().toISOString();

        auditTrail.push({ step: 'start', ts: ts(), detail: `Task: ${task.description}` });

        // Select matching agents
        const matchingAgents = this.selectAgents(task.required_capabilities);
        if (matchingAgents.length === 0) {
            return {
                task_id: task.task_id,
                ok: false,
                agents_used: [],
                invocation_results: [],
                aggregated_output: { error: 'No agents match the required capabilities' },
                total_duration_ms: Date.now() - startedAt,
                audit_trail: auditTrail,
            };
        }

        auditTrail.push({ step: 'agents_selected', ts: ts(), detail: matchingAgents.map((a) => a.id).join(', ') });

        // Fire-and-forget dispatch notification to the api-gateway if configured
        const dispatchUrl = process.env.AGENT_DISPATCH_URL;
        if (dispatchUrl && matchingAgents.length > 0) {
            const firstAgent = matchingAgents[0];
            fetch(`${dispatchUrl}/v1/agents/dispatch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fromAgentId: 'orchestrator',
                    toAgentId: firstAgent.id,
                    workspaceId: 'default',
                    tenantId: 'system',
                    taskDescription: task.description,
                    requiredCapability: task.required_capabilities[0],
                    timeoutMs: task.agent_timeout_ms ?? 30_000,
                }),
            }).catch((err: unknown) => {
                console.error('[dispatch]', err instanceof Error ? err.message : String(err));
            });
        }

        // Dispatch each skill invocation to matching agents
        for (const invocation of task.skill_invocations) {
            auditTrail.push({ step: 'skill_dispatch', ts: ts(), detail: `skill=${invocation.skill_id}` });

            const capableAgents = matchingAgents.filter((a) => a.skill_ids.includes(invocation.skill_id));
            const agentsToUse = capableAgents.length > 0 ? capableAgents : matchingAgents.slice(0, 1);

            const promises = agentsToUse.map((agent) =>
                this.invokeSkill(agent, invocation.skill_id, invocation.inputs, timeoutMs, task.dry_run ?? false)
            );
            const results = await Promise.allSettled(promises);
            for (const r of results) {
                if (r.status === 'fulfilled') allResults.push(r.value);
                else allResults.push({ agent_id: 'unknown', skill_id: invocation.skill_id, ok: false, output: {}, error: r.reason as string, duration_ms: 0 });
            }
        }

        // Aggregate
        const grouped = new Map<string, AgentInvocationResult[]>();
        for (const r of allResults) {
            const group = grouped.get(r.skill_id) ?? [];
            group.push(r);
            grouped.set(r.skill_id, group);
        }
        const aggregatedOutput: Record<string, unknown> = {};
        for (const [skillId, results] of grouped) {
            aggregatedOutput[skillId] = this.aggregate(results, task.aggregation);
        }

        const agentsUsed = [...new Set(allResults.map((r) => r.agent_id))];
        auditTrail.push({ step: 'complete', ts: ts(), detail: `agents_used=${agentsUsed.join(',')}` });

        return {
            task_id: task.task_id,
            ok: allResults.some((r) => r.ok),
            agents_used: agentsUsed,
            invocation_results: allResults,
            aggregated_output: aggregatedOutput,
            total_duration_ms: Date.now() - startedAt,
            audit_trail: auditTrail,
        };
    }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const globalOrchestrator = new MultiAgentOrchestrator();
