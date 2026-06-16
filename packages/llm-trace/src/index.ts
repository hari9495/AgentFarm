/**
 * @agentfarm/llm-trace — thin, fail-safe wrapper over the native Langfuse SDK.
 *
 * AgentFarm dispatches LLM calls from many fragmented call sites (the per-task
 * decision adapter, chat-service, the shared Anthropic caller, the code-gen
 * provider factory, and dozens of agent-specific callers). This package gives
 * all of them ONE helper — `traceGeneration()` — to record a Langfuse
 * generation (input/output/model/token usage/cost) without each call site
 * needing to know the SDK.
 *
 * Design rules (mirrors @agentfarm/observability):
 *  - Never throws. Tracing must never disrupt the agent runtime. Every public
 *    function swallows errors and degrades to a no-op.
 *  - No-op when unconfigured. If LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY are
 *    absent the client is null and every helper returns silently.
 *  - Client is injectable for tests via __setLangfuseClientForTests so the unit
 *    tests run fully offline.
 *
 * Trace model:
 *   trace (one per task)  →  generation (one per LLM call)
 * Use startTaskTrace() once per task to mint a traceId, then pass that traceId
 * into each traceGeneration() call so all the task's LLM calls nest under it.
 */

import { Langfuse } from 'langfuse';
import { AsyncLocalStorage } from 'node:async_hooks';

// ─── Ambient task context (AsyncLocalStorage) ──────────────────────────────────
//
// Established once at the task entry point so low-level LLM callers (the shared
// Anthropic caller, the code-gen provider factory, and any agent-specific
// caller) emit properly tenant-scoped, task-nested generations WITHOUT threading
// context through every call site. traceGeneration() fills any field the caller
// omits from this context.

export interface LlmTraceContext {
    traceId?: string;
    taskId?: string;
    tenantId?: string;
    agentId?: string;
    sessionId?: string;
}

const traceContextStore = new AsyncLocalStorage<LlmTraceContext>();

/** Run `fn` with an ambient LLM-trace context that downstream calls inherit. */
export const runWithLlmTraceContext = <T>(ctx: LlmTraceContext, fn: () => T): T =>
    traceContextStore.run(ctx, fn);

/** Read the current ambient LLM-trace context, if any. */
export const getLlmTraceContext = (): LlmTraceContext | undefined => traceContextStore.getStore();

// ─── Structural client interface (satisfied by the real SDK and test fakes) ────

export interface LangfuseGenerationHandle {
    end(body?: Record<string, unknown>): unknown;
    update(body: Record<string, unknown>): unknown;
}

export interface LangfuseTraceHandle {
    readonly id: string;
    generation(body: Record<string, unknown>): LangfuseGenerationHandle;
    update(body: Record<string, unknown>): unknown;
}

export interface LangfusePromptHandle {
    /** Raw prompt content (string for text prompts). */
    prompt?: unknown;
    /** Substitute {{variables}} and return the compiled prompt. */
    compile(variables?: Record<string, unknown>): unknown;
}

export interface LangfuseLike {
    trace(body: Record<string, unknown>): LangfuseTraceHandle;
    flushAsync(): Promise<unknown>;
    shutdownAsync(): Promise<unknown>;
    /** Optional — present on the real SDK; used for prompt management. */
    getPrompt?(name: string, version?: number, options?: Record<string, unknown>): Promise<LangfusePromptHandle>;
    /** Optional — present on the real SDK; used for persistent eval scores. */
    score?(body: Record<string, unknown>): unknown;
    /** Optional — present on the real SDK; used for offline eval datasets. */
    createDataset?(body: Record<string, unknown>): Promise<unknown>;
    createDatasetItem?(body: Record<string, unknown>): Promise<unknown>;
    getDataset?(name: string): Promise<LangfuseDatasetHandle>;
}

export interface LangfuseDatasetItemHandle {
    id: string;
    input?: unknown;
    expectedOutput?: unknown;
    /** Link a trace to this item under a named experiment run. */
    link(trace: unknown, runName: string, options?: Record<string, unknown>): Promise<unknown>;
}

export interface LangfuseDatasetHandle {
    items: LangfuseDatasetItemHandle[];
}

// ─── Config & input types ──────────────────────────────────────────────────────

export interface LlmTraceConfig {
    publicKey?: string;
    secretKey?: string;
    baseUrl?: string;
}

export type LlmTraceLevel = 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';

export interface StartTaskTraceInput {
    /** Stable id so callers can correlate; defaults to a generated id. */
    traceId?: string;
    /** Human-readable trace name, e.g. 'task.execute' or the action type. */
    name?: string;
    tenantId?: string;
    agentId?: string;
    taskId?: string;
    sessionId?: string;
    input?: unknown;
    metadata?: Record<string, unknown>;
    tags?: string[];
}

export interface TraceGenerationInput {
    /** Existing trace to nest under. When omitted a standalone trace is created. */
    traceId?: string;
    /** Trace name used only when a new trace must be created for this generation. */
    traceName?: string;
    /** Generation (LLM-call) name. Defaults to 'llm.generation'. */
    name?: string;
    tenantId?: string;
    agentId?: string;
    taskId?: string;
    sessionId?: string;
    provider?: string;
    model?: string;
    input?: unknown;
    output?: unknown;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    /** Estimated USD cost (from cost-calculator). Surfaced in metadata. */
    costUsd?: number;
    modelTier?: string;
    metadata?: Record<string, unknown>;
    startTime?: Date;
    endTime?: Date;
    level?: LlmTraceLevel;
    statusMessage?: string;
    tags?: string[];
}

// ─── Client lifecycle ────────────────────────────────────────────────────────────

let client: LangfuseLike | null | undefined; // undefined = not yet resolved
let testOverride: LangfuseLike | null | undefined;

const resolveConfig = (override?: LlmTraceConfig): Required<LlmTraceConfig> | null => {
    const publicKey = override?.publicKey ?? process.env['LANGFUSE_PUBLIC_KEY'] ?? '';
    const secretKey = override?.secretKey ?? process.env['LANGFUSE_SECRET_KEY'] ?? '';
    const baseUrl =
        override?.baseUrl ??
        process.env['LANGFUSE_HOST'] ??
        process.env['LANGFUSE_BASE_URL'] ??
        process.env['LANGFUSE_BASEURL'] ??
        'http://localhost:3030';
    if (!publicKey.trim() || !secretKey.trim()) return null;
    return { publicKey, secretKey, baseUrl };
};

/**
 * Returns the lazily-constructed Langfuse client, or null when unconfigured.
 * A test override (set via __setLangfuseClientForTests) always wins.
 */
export const getLangfuseClient = (config?: LlmTraceConfig): LangfuseLike | null => {
    if (testOverride !== undefined) return testOverride;
    if (client !== undefined) return client;

    try {
        const resolved = resolveConfig(config);
        if (!resolved) {
            client = null;
            return null;
        }
        client = new Langfuse({
            publicKey: resolved.publicKey,
            secretKey: resolved.secretKey,
            baseUrl: resolved.baseUrl,
        }) as unknown as LangfuseLike;
        return client;
    } catch {
        client = null;
        return null;
    }
};

/** True when a usable Langfuse client is configured. */
export const isLangfuseEnabled = (config?: LlmTraceConfig): boolean => getLangfuseClient(config) !== null;

// ─── Helpers ────────────────────────────────────────────────────────────────────

const generateTraceId = (taskId?: string): string => {
    const base = taskId && taskId.trim() ? taskId.trim() : 'task';
    const rand = Math.random().toString(36).slice(2, 10);
    return `${base}:${Date.now().toString(36)}:${rand}`;
};

const buildUsage = (
    input: TraceGenerationInput,
): { input?: number; output?: number; total?: number; unit: 'TOKENS' } | undefined => {
    const promptTokens = input.promptTokens;
    const completionTokens = input.completionTokens;
    const totalTokens =
        input.totalTokens ??
        (promptTokens !== undefined || completionTokens !== undefined
            ? (promptTokens ?? 0) + (completionTokens ?? 0)
            : undefined);
    if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
        return undefined;
    }
    return { input: promptTokens, output: completionTokens, total: totalTokens, unit: 'TOKENS' };
};

const buildGenerationMetadata = (input: TraceGenerationInput): Record<string, unknown> => {
    const metadata: Record<string, unknown> = { ...(input.metadata ?? {}) };
    if (input.provider) metadata['provider'] = input.provider;
    if (input.taskId) metadata['taskId'] = input.taskId;
    if (input.agentId) metadata['agentId'] = input.agentId;
    if (input.tenantId) metadata['tenantId'] = input.tenantId;
    if (input.modelTier) metadata['modelTier'] = input.modelTier;
    // Cost is surfaced in metadata; native Langfuse cost computation is wired
    // separately once AgentFarm's model pricing is registered in Langfuse.
    if (typeof input.costUsd === 'number') metadata['estimatedCostUsd'] = input.costUsd;
    return metadata;
};

// ─── Public API ──────────────────────────────────────────────────────────────────

/**
 * Create a trace for a task. Returns the traceId to thread into subsequent
 * traceGeneration() calls, or null when tracing is disabled. Never throws.
 */
export const startTaskTrace = (input: StartTaskTraceInput): string | null => {
    const lf = getLangfuseClient();
    if (!lf) return null;
    try {
        const traceId = input.traceId ?? generateTraceId(input.taskId);
        lf.trace({
            id: traceId,
            name: input.name ?? 'task',
            userId: input.tenantId,
            sessionId: input.sessionId,
            input: input.input,
            tags: input.tags,
            metadata: {
                ...(input.metadata ?? {}),
                ...(input.agentId ? { agentId: input.agentId } : {}),
                ...(input.taskId ? { taskId: input.taskId } : {}),
            },
        });
        return traceId;
    } catch {
        return null;
    }
};

/**
 * Record a single LLM call as a Langfuse generation. Attaches to an existing
 * trace when `traceId` is supplied, otherwise mints a standalone trace.
 * Returns the traceId used, or null when disabled / on error. Never throws.
 */
export const traceGeneration = (rawInput: TraceGenerationInput): string | null => {
    const lf = getLangfuseClient();
    if (!lf) return null;
    try {
        // Fill any omitted field from the ambient task context.
        const ctx = getLlmTraceContext() ?? {};
        const input: TraceGenerationInput = {
            ...rawInput,
            taskId: rawInput.taskId ?? ctx.taskId,
            tenantId: rawInput.tenantId ?? ctx.tenantId,
            agentId: rawInput.agentId ?? ctx.agentId,
            sessionId: rawInput.sessionId ?? ctx.sessionId,
            traceId: rawInput.traceId ?? ctx.traceId,
        };

        const traceId = input.traceId ?? generateTraceId(input.taskId);
        const trace = lf.trace({
            id: traceId,
            name: input.traceName ?? input.name ?? 'llm.generation',
            userId: input.tenantId,
            sessionId: input.sessionId,
            tags: input.tags,
        });

        const generation = trace.generation({
            name: input.name ?? 'llm.generation',
            model: input.model,
            input: input.input,
            startTime: input.startTime,
            metadata: buildGenerationMetadata(input),
        });

        generation.end({
            output: input.output,
            usage: buildUsage(input),
            endTime: input.endTime,
            level: input.level,
            statusMessage: input.statusMessage,
        });

        return traceId;
    } catch {
        return null;
    }
};

/**
 * Flush queued events to Langfuse. Call before a short-lived process exits so
 * batched traces are not lost. Never throws.
 */
export const flushLangfuse = async (): Promise<void> => {
    const lf = getLangfuseClient();
    if (!lf) return;
    try {
        await lf.flushAsync();
    } catch {
        // tracing must never disrupt the caller
    }
};

/** Flush and tear down the client. Never throws. */
export const shutdownLangfuse = async (): Promise<void> => {
    const lf = getLangfuseClient();
    if (!lf) return;
    try {
        await lf.shutdownAsync();
    } catch {
        // ignore
    }
};

// ─── Eval scores ─────────────────────────────────────────────────────────────────

export interface TraceScoreInput {
    /** Trace to attach the score to (AgentFarm uses traceId = taskId). */
    traceId: string;
    /** Optional observation (generation) to scope the score to. */
    observationId?: string;
    /** Stable score name, e.g. 'quality' or 'quality:create_pr'. */
    name: string;
    /** Numeric (0..1), categorical label, or boolean. */
    value: number | string | boolean;
    dataType?: 'NUMERIC' | 'CATEGORICAL' | 'BOOLEAN';
    /** Free-text rationale (e.g. the feedback reason). */
    comment?: string;
}

/**
 * Persist a quality/eval score on a Langfuse trace. Unlike the in-memory
 * quality tracker, these survive restarts and roll up in Langfuse dashboards
 * (per model / tenant / time). Fire-and-forget; never throws; no-op when
 * Langfuse is unconfigured.
 */
export const recordTraceScore = (input: TraceScoreInput): void => {
    const lf = getLangfuseClient();
    if (!lf || typeof lf.score !== 'function') return;
    try {
        lf.score({
            traceId: input.traceId,
            observationId: input.observationId,
            name: input.name,
            value: input.value,
            dataType: input.dataType ?? (typeof input.value === 'number' ? 'NUMERIC' : undefined),
            comment: input.comment,
        });
    } catch {
        // scoring must never disrupt the caller
    }
};

// ─── Datasets & offline evaluation ─────────────────────────────────────────────

/** Create (or no-op if it exists) a Langfuse dataset. Returns false when off. */
export const upsertDataset = async (name: string, description?: string): Promise<boolean> => {
    const lf = getLangfuseClient();
    if (!lf || typeof lf.createDataset !== 'function') return false;
    try {
        await lf.createDataset({ name, description });
        return true;
    } catch {
        return false;
    }
};

/** Add an item to a dataset (e.g. an approved/rejected artifact for regression). */
export const addDatasetItem = async (
    datasetName: string,
    item: { input: unknown; expectedOutput?: unknown; metadata?: Record<string, unknown>; id?: string },
): Promise<boolean> => {
    const lf = getLangfuseClient();
    if (!lf || typeof lf.createDatasetItem !== 'function') return false;
    try {
        await lf.createDatasetItem({
            datasetName,
            input: item.input,
            expectedOutput: item.expectedOutput,
            metadata: item.metadata,
            id: item.id,
        });
        return true;
    } catch {
        return false;
    }
};

export interface DatasetRunItemResult {
    output: unknown;
    /** Numeric score (e.g. 1 = matched expected, 0 = mismatch). */
    score?: number;
    comment?: string;
}

/**
 * Run an offline experiment over a dataset: for each item, call `runner`, link
 * the resulting trace to the item under `runName`, and attach an `eval` score.
 * Returns a small summary. No-op (ran: 0) when Langfuse is unconfigured.
 */
export const runDatasetExperiment = async (
    datasetName: string,
    runName: string,
    runner: (item: { input: unknown; expectedOutput?: unknown }) => Promise<DatasetRunItemResult>,
): Promise<{ ran: number; scored: number; avgScore: number | null }> => {
    const lf = getLangfuseClient();
    if (!lf || typeof lf.getDataset !== 'function') return { ran: 0, scored: 0, avgScore: null };
    let ran = 0;
    let scored = 0;
    let scoreSum = 0;
    try {
        const dataset = await lf.getDataset(datasetName);
        for (const item of dataset.items) {
            const result = await runner({ input: item.input, expectedOutput: item.expectedOutput });
            const trace = lf.trace({ name: runName, input: item.input, output: result.output });
            try {
                await item.link(trace, runName);
            } catch {
                /* linking is best-effort */
            }
            if (typeof result.score === 'number' && typeof lf.score === 'function') {
                lf.score({ traceId: trace.id, name: 'eval', value: result.score, dataType: 'NUMERIC', comment: result.comment });
                scored += 1;
                scoreSum += result.score;
            }
            ran += 1;
        }
        await lf.flushAsync();
    } catch {
        // experiment failures must not throw to the caller
    }
    return { ran, scored, avgScore: scored > 0 ? Number((scoreSum / scored).toFixed(3)) : null };
};

// ─── Prompt management ───────────────────────────────────────────────────────────

const compileFallback = (fallback: string, variables?: Record<string, unknown>): string => {
    if (!variables) return fallback;
    return Object.entries(variables).reduce(
        (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, String(value)),
        fallback,
    );
};

/**
 * Fetch a text prompt from the Langfuse prompt registry, falling back to the
 * provided default. Returns the compiled string. NEVER throws and NEVER blocks
 * on a cold cache beyond the SDK's own behaviour — when Langfuse is unconfigured
 * or unreachable, the fallback is returned. The SDK caches fetched prompts, so
 * steady-state calls are local.
 *
 * @param name      Prompt name in Langfuse (e.g. 'role-system-prompt:developer').
 * @param fallback  The in-code prompt to use if Langfuse has none / is down.
 * @param options   variables for {{mustache}} compilation; label/version pin.
 */
export const getPromptText = async (
    name: string,
    fallback: string,
    options?: { variables?: Record<string, unknown>; label?: string; version?: number; cacheTtlSeconds?: number },
): Promise<string> => {
    const lf = getLangfuseClient();
    if (!lf || typeof lf.getPrompt !== 'function') {
        return compileFallback(fallback, options?.variables);
    }
    try {
        const prompt = await lf.getPrompt(name, options?.version, {
            type: 'text',
            fallback,
            label: options?.label,
            cacheTtlSeconds: options?.cacheTtlSeconds ?? 300,
        });
        const compiled = options?.variables ? prompt.compile(options.variables) : prompt.prompt;
        return typeof compiled === 'string' ? compiled : compileFallback(fallback, options?.variables);
    } catch {
        return compileFallback(fallback, options?.variables);
    }
};

// ─── Test utilities ──────────────────────────────────────────────────────────────

/** Inject a fake client (or null to force the disabled path) for tests. */
export const __setLangfuseClientForTests = (fake: LangfuseLike | null): void => {
    testOverride = fake;
};

/** Clear all client state between tests. */
export const resetLangfuseForTests = (): void => {
    testOverride = undefined;
    client = undefined;
};
