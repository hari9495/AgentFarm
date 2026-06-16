/**
 * llm-provider-factory.ts — LLM provider abstraction for code generation.
 *
 * Extracted from execution-engine.ts where the entire multi-provider factory
 * lived inline inside the main orchestration function. Moving it here means:
 *   - Adding a new LLM provider is a one-file change
 *   - Each provider branch is independently testable
 *   - The execution engine no longer has a compile-time dependency on fetch
 *     URLs and API key names for every supported LLM provider
 *
 * The factory follows the Null Object pattern: when no provider is configured
 * it returns `undefined`, allowing callers to fall back gracefully without
 * needing conditional guards everywhere.
 */

import type { LlmCodeGenFn, AutonomousStep } from '../local-workspace-executor.js';
import { traceGeneration } from '@agentfarm/llm-trace';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type LlmCodeGenProfile = 'quality_first' | 'cost_balanced' | 'speed_first';

type ProviderConfig =
    | { kind: 'anthropic'; apiKey: string; model: string }
    | { kind: 'openai_compatible'; apiKey: string; baseUrl: string; model: string; isAzure: boolean };

// ---------------------------------------------------------------------------
// Per-provider profile model resolution
//
// Operator env vars override built-in defaults.
// Lookup order: AF_<PROVIDER>_MODEL_<PROFILE> → AF_<PROVIDER>_MODEL → built-in default
// ---------------------------------------------------------------------------

const PROFILE_SUFFIX: Record<LlmCodeGenProfile, string> = {
    quality_first: 'QUALITY_FIRST',
    cost_balanced: 'COST_BALANCED',
    speed_first:   'SPEED_FIRST',
};

function resolveAnthropicModel(env: NodeJS.ProcessEnv, profile: LlmCodeGenProfile): string {
    const builtins: Record<LlmCodeGenProfile, string> = {
        quality_first: 'claude-opus-4-7',
        cost_balanced: 'claude-sonnet-4-6',
        speed_first:   'claude-haiku-4-5',
    };
    const suffix = PROFILE_SUFFIX[profile];
    return (
        env[`AF_ANTHROPIC_MODEL_${suffix}`] ??
        env[`AGENTFARM_ANTHROPIC_MODEL_${suffix}`] ??
        env['AF_ANTHROPIC_MODEL'] ??
        env['AGENTFARM_ANTHROPIC_MODEL'] ??
        builtins[profile]
    );
}

function resolveOpenAiModel(env: NodeJS.ProcessEnv, profile: LlmCodeGenProfile): string {
    const builtins: Record<LlmCodeGenProfile, string> = {
        quality_first: 'gpt-4o',
        cost_balanced: 'gpt-4o',
        speed_first:   'gpt-4o-mini',
    };
    const suffix = PROFILE_SUFFIX[profile];
    return (
        env[`AF_OPENAI_MODEL_${suffix}`] ??
        env[`AGENTFARM_OPENAI_MODEL_${suffix}`] ??
        env['AF_OPENAI_MODEL'] ??
        env['AGENTFARM_OPENAI_MODEL'] ??
        builtins[profile]
    );
}

function resolveGitHubModelsModel(env: NodeJS.ProcessEnv, profile: LlmCodeGenProfile): string {
    const builtins: Record<LlmCodeGenProfile, string> = {
        quality_first: 'gpt-4o',
        cost_balanced: 'gpt-4o-mini',
        speed_first:   'gpt-4o-mini',
    };
    const suffix = PROFILE_SUFFIX[profile];
    return (
        env[`AF_GITHUB_MODELS_MODEL_${suffix}`] ??
        env[`AGENTFARM_GITHUB_MODELS_MODEL_${suffix}`] ??
        env['AF_GITHUB_MODELS_MODEL'] ??
        env['AGENTFARM_GITHUB_MODELS_MODEL'] ??
        builtins[profile]
    );
}

function resolveAzureDeployment(env: NodeJS.ProcessEnv, profile: LlmCodeGenProfile): string {
    const suffix = PROFILE_SUFFIX[profile];
    return (
        env[`AF_AZURE_OPENAI_DEPLOYMENT_${suffix}`] ??
        env[`AGENTFARM_AZURE_OPENAI_DEPLOYMENT_${suffix}`] ??
        env['AF_AZURE_OPENAI_DEPLOYMENT'] ??
        env['AGENTFARM_AZURE_OPENAI_DEPLOYMENT'] ??
        ''
    );
}

// ---------------------------------------------------------------------------
// Provider config resolution
// ---------------------------------------------------------------------------

const resolveProviderConfig = (env: NodeJS.ProcessEnv, profile: LlmCodeGenProfile = 'cost_balanced'): ProviderConfig | null => {
    const provider = (env['AF_MODEL_PROVIDER'] ?? env['AGENTFARM_MODEL_PROVIDER'] ?? 'agentfarm')
        .toLowerCase()
        .trim();

    if (provider === 'agentfarm' || provider === 'mock') return null;

    if (provider === 'anthropic') {
        const apiKey = env['AF_ANTHROPIC_API_KEY'] ?? env['AGENTFARM_ANTHROPIC_API_KEY'] ?? '';
        if (!apiKey.trim()) return null;
        return { kind: 'anthropic', apiKey, model: resolveAnthropicModel(env, profile) };
    }

    if (provider === 'github_models') {
        const apiKey = env['AF_GITHUB_MODELS_API_KEY'] ?? env['AGENTFARM_GITHUB_MODELS_API_KEY'] ?? '';
        const baseUrl = (env['AF_GITHUB_MODELS_BASE_URL'] ?? env['AGENTFARM_GITHUB_MODELS_BASE_URL'] ?? 'https://models.inference.ai.azure.com').replace(/\/+$/, '');
        if (!apiKey.trim()) return null;
        return { kind: 'openai_compatible', apiKey, baseUrl, model: resolveGitHubModelsModel(env, profile), isAzure: false };
    }

    if (provider === 'azure_openai' || provider === 'azure-openai') {
        const endpoint = (env['AF_AZURE_OPENAI_ENDPOINT'] ?? env['AGENTFARM_AZURE_OPENAI_ENDPOINT'] ?? '').replace(/\/+$/, '');
        const deployment = resolveAzureDeployment(env, profile);
        const apiVersion = env['AF_AZURE_OPENAI_API_VERSION'] ?? env['AGENTFARM_AZURE_OPENAI_API_VERSION'] ?? '2024-06-01';
        const apiKey = env['AF_AZURE_OPENAI_API_KEY'] ?? env['AGENTFARM_AZURE_OPENAI_API_KEY'] ?? '';
        if (!apiKey.trim() || !endpoint || !deployment) return null;
        const baseUrl = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
        return { kind: 'openai_compatible', apiKey, baseUrl, model: deployment, isAzure: true };
    }

    // Default: openai and openai-compatible providers
    const apiKey = env['AF_OPENAI_API_KEY'] ?? env['AGENTFARM_OPENAI_API_KEY'] ?? '';
    const baseUrl = (env['AF_OPENAI_BASE_URL'] ?? env['AGENTFARM_OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    if (!apiKey.trim()) return null;
    return { kind: 'openai_compatible', apiKey, baseUrl, model: resolveOpenAiModel(env, profile), isAzure: false };
};

// ---------------------------------------------------------------------------
// Shared output parsing
// ---------------------------------------------------------------------------

const parseStepsFromJson = (raw: unknown): AutonomousStep[] => {
    let data = raw;
    // LLM may wrap the array under a key such as "steps", "plan", "initial_plan"
    if (data !== null && typeof data === 'object' && !Array.isArray(data)) {
        const obj = data as Record<string, unknown>;
        data = obj['steps'] ?? obj['plan'] ?? obj['initial_plan'] ?? obj['actions'] ?? [];
    }
    if (!Array.isArray(data)) return [];
    return (data as Record<string, unknown>[]).filter(
        (s) => s !== null && typeof s === 'object' && Array.isArray(s['actions']),
    ) as AutonomousStep[];
};

// ---------------------------------------------------------------------------
// Streaming helpers — early-stop on JSON array close
//
// Instead of waiting for max_tokens to be consumed (or the model to emit a
// stop token), we stream the response and abort as soon as the outer JSON
// array `[...]` is closed. This eliminates model-padding tokens — e.g. blank
// lines, "Here is the plan:" suffixes — that follow the valid JSON.
//
// Bracket-balance logic tracks depth across `[`, `{`, `]`, `}` while correctly
// ignoring characters inside string literals (including escaped quotes).
// ---------------------------------------------------------------------------

async function streamJsonArray(
    body: ReadableStream<Uint8Array>,
    extractDelta: (line: string) => string | null,
): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let jsonText = '';
    let depth = 0;
    let inString = false;
    let escaped = false;
    let started = false;

    const feed = (ch: string): boolean => {
        jsonText += ch;
        if (escaped) { escaped = false; return false; }
        if (ch === '\\' && inString) { escaped = true; return false; }
        if (ch === '"') { inString = !inString; return false; }
        if (inString) return false;
        if (ch === '[' || ch === '{') { depth++; started = true; }
        else if ((ch === ']' || ch === '}') && --depth === 0 && started) return true;
        return false;
    };

    try {
        loop: while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            sseBuffer += decoder.decode(value, { stream: true });
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() ?? '';
            for (const line of lines) {
                const delta = extractDelta(line.trim());
                if (delta === null) continue;
                for (const ch of delta) {
                    if (feed(ch)) break loop;
                }
            }
        }
    } finally {
        reader.cancel().catch(() => {});
    }
    return jsonText;
}

const extractAnthropicDelta = (line: string): string | null => {
    if (!line.startsWith('data: ')) return null;
    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') return null;
    try {
        const event = JSON.parse(payload) as {
            type?: string;
            delta?: { type?: string; text?: string };
        };
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            return event.delta.text ?? null;
        }
    } catch { /* ignore non-JSON lines */ }
    return null;
};

const extractOpenAiDelta = (line: string): string | null => {
    if (!line.startsWith('data: ')) return null;
    const payload = line.slice(6).trim();
    if (!payload || payload === '[DONE]') return null;
    try {
        const event = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
        };
        return event.choices?.[0]?.delta?.content ?? null;
    } catch { /* ignore non-JSON lines */ }
    return null;
};

// ---------------------------------------------------------------------------
// Provider implementations
// ---------------------------------------------------------------------------

const buildAnthropicCodeGenFn = (apiKey: string, model: string): LlmCodeGenFn =>
    async (taskPrompt, fileContents, targetFiles) => {
        const fileContext = Object.entries(fileContents)
            .map(([p, c]) => `=== ${p} ===\n${c.slice(0, 3000)}`)
            .join('\n\n');

        const systemMsg = [
            'You are an expert software developer. Produce ONLY a valid JSON array. No prose, no markdown.',
            'Each step: { "description": string, "actions": Action[] }',
            'Action shapes: code_edit_patch (old_text must be exact), code_edit, run_tests, run_build.',
            'Return ONLY the JSON array starting with [ and ending with ].',
        ].join('\n');

        const userMsg = [
            `Task: ${taskPrompt.slice(0, 1200)}`,
            targetFiles.length > 0 ? `Target files: ${targetFiles.join(', ')}` : '',
            fileContext ? `\nCurrent code:\n${fileContext}` : '',
            '\nReturn a JSON array of implementation steps.',
        ].filter(Boolean).join('\n');

        try {
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-beta': 'prompt-caching-2024-07-31',
                },
                body: JSON.stringify({ model, max_tokens: 4096, stream: true, system: [{ type: 'text', text: systemMsg, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: userMsg }] }),
                signal: AbortSignal.timeout(120_000),
            });
            if (!response.ok || !response.body) return [];
            const text = await streamJsonArray(response.body, extractAnthropicDelta);
            const s = text.indexOf('[');
            const e = text.lastIndexOf(']');
            if (s === -1 || e === -1) return [];
            const steps = parseStepsFromJson(JSON.parse(text.slice(s, e + 1)));
            // Lightweight generation — streaming discards usage, so no exact
            // tokens. Tenant/task/trace come from the ambient context.
            traceGeneration({
                name: 'llm.codegen', provider: 'anthropic', model,
                input: taskPrompt.slice(0, 1000), output: `${steps.length} step(s)`, tags: ['codegen'],
            });
            return steps;
        } catch {
            return [];
        }
    };

const buildOpenAICompatibleCodeGenFn = (
    apiKey: string,
    baseUrl: string,
    model: string,
    isAzure: boolean,
): LlmCodeGenFn =>
    async (taskPrompt, fileContents, targetFiles) => {
        const fileContext = Object.entries(fileContents)
            .map(([p, c]) => `=== ${p} ===\n${c}`)
            .join('\n\n');

        const messages: ChatMessage[] = [
            {
                role: 'system',
                content: [
                    'You are an expert software developer agent.',
                    'Analyze the task description and current code, then produce a JSON implementation plan.',
                    'Return ONLY a valid JSON array. Do NOT include markdown fences, explanations, or prose.',
                    'Each element: { "description": string, "actions": Action[] }',
                    'Where Action is one of:',
                    '  { "action": "code_edit", "file_path": string, "content": string }',
                    '  { "action": "code_edit_patch", "file_path": string, "old_text": string, "new_text": string }',
                    '    CRITICAL: old_text must be copied EXACTLY from the file — whitespace-sensitive.',
                    '  { "action": "run_tests", "command"?: string }',
                    '  { "action": "run_build", "command"?: string }',
                    'Use code_edit_patch for targeted edits; code_edit only for new or complete rewrites.',
                    'Return ONLY the JSON array. No surrounding text.',
                ].join('\n'),
            },
            {
                role: 'user',
                content: [
                    `Task: ${taskPrompt}`,
                    targetFiles.length > 0 ? `Target files: ${targetFiles.join(', ')}` : '',
                    fileContext ? `\nCurrent code:\n${fileContext}` : '',
                    '\nGenerate the complete implementation plan as a JSON array.',
                ].filter(Boolean).join('\n'),
            },
        ];

        try {
            const fetchUrl = isAzure ? baseUrl : `${baseUrl}/chat/completions`;
            const headers: Record<string, string> = { 'content-type': 'application/json' };
            if (isAzure) {
                headers['api-key'] = apiKey;
            } else {
                headers['authorization'] = `Bearer ${apiKey}`;
            }

            const response = await fetch(fetchUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    model,
                    temperature: 0,
                    stream: true,
                    messages,
                }),
                signal: AbortSignal.timeout(120_000),
            });
            if (!response.ok || !response.body) return [];
            const text = await streamJsonArray(response.body, extractOpenAiDelta);
            if (!text.trim()) return [];
            const s = text.indexOf('[');
            const e = text.lastIndexOf(']');
            if (s === -1 || e === -1) return [];
            const steps = parseStepsFromJson(JSON.parse(text.slice(s, e + 1)));
            traceGeneration({
                name: 'llm.codegen', provider: isAzure ? 'azure_openai' : 'openai', model,
                input: taskPrompt.slice(0, 1000), output: `${steps.length} step(s)`, tags: ['codegen'],
            });
            return steps;
        } catch {
            return [];
        }
    };

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Creates a code-generation function wired to the configured LLM provider.
 *
 * The optional `profile` selects the model tier for this function:
 *   - 'quality_first'  — expensive model, best for initial plan generation (planner)
 *   - 'cost_balanced'  — mid-tier, best for fix-attempt generation (worker)
 *   - 'speed_first'    — cheapest, for classification / light tasks
 *
 * Returns `undefined` when no provider is configured so callers can fall back
 * to keyword-based plan inference without additional guards.
 *
 * @param env     - process.env (injectable for testing)
 * @param profile - model tier selection (default: 'cost_balanced')
 */
export const createCodeGenFn = (
    env: NodeJS.ProcessEnv = process.env,
    profile: LlmCodeGenProfile = 'cost_balanced',
): LlmCodeGenFn | undefined => {
    const config = resolveProviderConfig(env, profile);
    if (!config) return undefined;

    if (config.kind === 'anthropic') {
        return buildAnthropicCodeGenFn(config.apiKey, config.model);
    }

    return buildOpenAICompatibleCodeGenFn(config.apiKey, config.baseUrl, config.model, config.isAzure);
};
