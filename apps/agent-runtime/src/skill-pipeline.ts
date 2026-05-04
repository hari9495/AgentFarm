/**
 * Skill Pipeline Engine — Tier I
 *
 * Defines and executes named sequential skill pipelines where the output
 * of each step feeds as input into the next. Supports conditional branching,
 * result mapping, and dry-run simulation.
 *
 * Built-in pipelines:
 *   pr-quality-gate    — size-enforcer → commit-linter → type-coverage → pr-description-generator
 *   security-audit     — dependency-audit → license-compliance-check → docker-image-scanner
 *   release-readiness  — changelog-diff-validator → migration-risk-scorer → rollback-advisor
 *   code-health        — dead-code-detector → code-churn-analyzer → refactor-advisor
 */

import { getSkillHandler } from './skill-execution-engine.js';
import type { SkillInput, SkillOutput } from './skill-execution-engine.js';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type PipelineStep = {
    skill_id: string;
    /** Override label shown in results */
    label?: string;
    /**
     * Static inputs merged with dynamic mapped inputs.
     * Takes precedence over mapped inputs on key collision.
     */
    static_inputs?: SkillInput;
    /**
     * Map keys from the previous step's result to input keys for this step.
     * Format: { "this_step_input_key": "prev_step_result_key" }
     */
    input_map?: Record<string, string>;
    /** If true, pipeline continues even when this step returns ok:false */
    allow_failure?: boolean;
    /** Skip this step if the condition returns false */
    condition?: (prevOutput: SkillOutput | null) => boolean;
};

export type PipelineDefinition = {
    id: string;
    name: string;
    description: string;
    steps: PipelineStep[];
    tags: string[];
};

export type PipelineStepRecord = {
    step_index: number;
    skill_id: string;
    label: string;
    status: PipelineStepStatus;
    input: SkillInput;
    output?: SkillOutput;
    error?: string;
    duration_ms: number;
    started_at: string;
};

export type PipelineRunResult = {
    ok: boolean;
    run_id: string;
    pipeline_id: string;
    pipeline_name: string;
    steps: PipelineStepRecord[];
    total_duration_ms: number;
    summary: string;
    aborted_at_step?: number;
    dry_run: boolean;
};

// ---------------------------------------------------------------------------
// Built-in pipeline definitions
// ---------------------------------------------------------------------------

const BUILTIN_PIPELINES: PipelineDefinition[] = [
    {
        id: 'pr-quality-gate',
        name: 'PR Quality Gate',
        description: 'Validates PR size, commit messages, type coverage, and generates description.',
        tags: ['pr', 'quality', 'ci'],
        steps: [
            {
                skill_id: 'pr-size-enforcer',
                label: 'Enforce PR size limits',
                static_inputs: { max_lines: 500, max_files: 20 },
            },
            {
                skill_id: 'commit-message-linter',
                label: 'Lint commit messages',
                allow_failure: false,
            },
            {
                skill_id: 'type-coverage-reporter',
                label: 'Check TypeScript coverage',
                allow_failure: true,
            },
            {
                skill_id: 'pr-description-generator',
                label: 'Generate PR description',
                allow_failure: true,
            },
        ],
    },
    {
        id: 'security-audit',
        name: 'Security Audit',
        description: 'Checks dependencies, licenses, and container images for vulnerabilities.',
        tags: ['security', 'compliance', 'audit'],
        steps: [
            {
                skill_id: 'dependency-audit',
                label: 'Audit npm dependencies',
            },
            {
                skill_id: 'license-compliance-check',
                label: 'Check license compliance',
            },
            {
                skill_id: 'docker-image-scanner',
                label: 'Scan container images',
                static_inputs: { image_name: 'agentfarm/runtime:latest' },
                allow_failure: true,
            },
            {
                skill_id: 'secrets-scanner',
                label: 'Scan for leaked secrets',
            },
        ],
    },
    {
        id: 'release-readiness',
        name: 'Release Readiness',
        description: 'Validates changelog, migration risk, and rollback plan before release.',
        tags: ['release', 'deployment', 'readiness'],
        steps: [
            {
                skill_id: 'changelog-diff-validator',
                label: 'Validate changelog is up to date',
            },
            {
                skill_id: 'migration-risk-scorer',
                label: 'Score migration risk',
            },
            {
                skill_id: 'rollback-advisor',
                label: 'Generate rollback plan',
                allow_failure: true,
            },
        ],
    },
    {
        id: 'code-health',
        name: 'Code Health Check',
        description: 'Detects dead code, high-churn files, and suggests refactor targets.',
        tags: ['quality', 'maintenance', 'refactor'],
        steps: [
            {
                skill_id: 'dead-code-detector',
                label: 'Find dead code',
            },
            {
                skill_id: 'code-churn-analyzer',
                label: 'Analyze code churn',
            },
            {
                skill_id: 'refactor-advisor',
                label: 'Suggest refactor targets',
                allow_failure: true,
            },
        ],
    },
    {
        id: 'onboarding-checklist',
        name: 'New Repo Onboarding',
        description: 'Validates all required files, CI setup, and env vars for a new repository.',
        tags: ['onboarding', 'setup', 'ci'],
        steps: [
            {
                skill_id: 'env-var-auditor',
                label: 'Audit required env vars',
            },
            {
                skill_id: 'monorepo-dep-graph',
                label: 'Build dependency graph',
            },
            {
                skill_id: 'openapi-spec-linter',
                label: 'Lint OpenAPI spec',
                allow_failure: true,
            },
        ],
    },
];

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const PIPELINE_DIR = join(tmpdir(), 'agentfarm-skill-pipelines');
const RUNS_FILE = join(PIPELINE_DIR, 'runs.json');

// ---------------------------------------------------------------------------
// SkillPipelineEngine
// ---------------------------------------------------------------------------

export class SkillPipelineEngine {
    private pipelines: Map<string, PipelineDefinition> = new Map();
    private recentRuns: PipelineRunResult[] = [];

    constructor() {
        for (const p of BUILTIN_PIPELINES) {
            this.pipelines.set(p.id, p);
        }
    }

    // ── Registry ───────────────────────────────────────────────────────────

    registerPipeline(def: PipelineDefinition): void {
        this.pipelines.set(def.id, def);
    }

    getPipeline(id: string): PipelineDefinition | undefined {
        return this.pipelines.get(id);
    }

    listPipelines(): PipelineDefinition[] {
        return Array.from(this.pipelines.values());
    }

    // ── Execution ──────────────────────────────────────────────────────────

    async run(input: {
        pipeline_id: string;
        initial_inputs?: SkillInput;
        dry_run?: boolean;
    }): Promise<PipelineRunResult> {
        const startedAt = Date.now();
        const runId = randomUUID();
        const pipeline = this.pipelines.get(input.pipeline_id);

        if (!pipeline) {
            const result: PipelineRunResult = {
                ok: false,
                run_id: runId,
                pipeline_id: input.pipeline_id,
                pipeline_name: 'unknown',
                steps: [],
                total_duration_ms: Date.now() - startedAt,
                summary: `Pipeline "${input.pipeline_id}" not found`,
                dry_run: input.dry_run ?? false,
            };
            return result;
        }

        const stepRecords: PipelineStepRecord[] = [];
        let prevOutput: SkillOutput | null = null;
        let abortedAt: number | undefined;
        let allOk = true;

        for (let i = 0; i < pipeline.steps.length; i++) {
            const step = pipeline.steps[i]!;
            const stepStart = Date.now();
            const label = step.label ?? step.skill_id;

            // Evaluate condition
            if (step.condition && !step.condition(prevOutput)) {
                stepRecords.push({
                    step_index: i,
                    skill_id: step.skill_id,
                    label,
                    status: 'skipped',
                    input: {},
                    duration_ms: 0,
                    started_at: new Date().toISOString(),
                });
                continue;
            }

            // Build input: initial_inputs + mapped prev outputs + static overrides
            const stepInput: SkillInput = {
                ...(input.initial_inputs ?? {}),
            };

            if (prevOutput && step.input_map) {
                for (const [inputKey, resultKey] of Object.entries(step.input_map)) {
                    if (resultKey in prevOutput.result) {
                        stepInput[inputKey] = prevOutput.result[resultKey];
                    }
                }
            }

            if (step.static_inputs) {
                Object.assign(stepInput, step.static_inputs);
            }

            const record: PipelineStepRecord = {
                step_index: i,
                skill_id: step.skill_id,
                label,
                status: 'running',
                input: stepInput,
                duration_ms: 0,
                started_at: new Date().toISOString(),
            };

            try {
                const handler = getSkillHandler(step.skill_id);

                if (!handler) {
                    record.status = 'failed';
                    record.error = `No handler registered for skill "${step.skill_id}"`;
                    record.duration_ms = Date.now() - stepStart;
                    stepRecords.push(record);

                    if (!step.allow_failure) {
                        allOk = false;
                        abortedAt = i;
                        break;
                    }
                    continue;
                }

                const output = input.dry_run
                    ? handler({ ...stepInput, _dry_run: true }, stepStart)
                    : handler(stepInput, stepStart);

                record.output = output;
                record.status = output.ok ? 'completed' : 'failed';
                record.duration_ms = Date.now() - stepStart;
                prevOutput = output;

                if (!output.ok && !step.allow_failure) {
                    allOk = false;
                    abortedAt = i;
                    stepRecords.push(record);
                    break;
                }
            } catch (err) {
                record.status = 'failed';
                record.error = err instanceof Error ? err.message : String(err);
                record.duration_ms = Date.now() - stepStart;

                if (!step.allow_failure) {
                    allOk = false;
                    abortedAt = i;
                    stepRecords.push(record);
                    break;
                }
            }

            stepRecords.push(record);
        }

        const completedCount = stepRecords.filter((s) => s.status === 'completed').length;
        const failedCount = stepRecords.filter((s) => s.status === 'failed').length;

        const result: PipelineRunResult = {
            ok: allOk,
            run_id: runId,
            pipeline_id: pipeline.id,
            pipeline_name: pipeline.name,
            steps: stepRecords,
            total_duration_ms: Date.now() - startedAt,
            summary: allOk
                ? `Pipeline completed: ${completedCount}/${pipeline.steps.length} steps passed`
                : `Pipeline failed at step ${abortedAt}: ${failedCount} step(s) failed`,
            aborted_at_step: abortedAt,
            dry_run: input.dry_run ?? false,
        };

        this.recentRuns.unshift(result);
        if (this.recentRuns.length > 100) this.recentRuns = this.recentRuns.slice(0, 100);
        await this.persistRuns();

        return result;
    }

    // ── History ────────────────────────────────────────────────────────────

    getRecentRuns(limit = 20): PipelineRunResult[] {
        return this.recentRuns.slice(0, limit);
    }

    getRunById(runId: string): PipelineRunResult | undefined {
        return this.recentRuns.find((r) => r.run_id === runId);
    }

    // ── Persistence ────────────────────────────────────────────────────────

    private async persistRuns(): Promise<void> {
        await mkdir(PIPELINE_DIR, { recursive: true });
        await writeFile(RUNS_FILE, JSON.stringify(this.recentRuns.slice(0, 50), null, 2), 'utf8');
    }

    async loadRuns(): Promise<void> {
        try {
            const raw = await readFile(RUNS_FILE, 'utf8');
            this.recentRuns = JSON.parse(raw) as PipelineRunResult[];
        } catch {
            // No persisted state
        }
    }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const globalPipelineEngine = new SkillPipelineEngine();
