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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type ProviderConfig =
    | { kind: 'anthropic'; apiKey: string; model: string }
    | { kind: 'openai_compatible'; apiKey: string; baseUrl: string; model: string; isAzure: boolean };

// ---------------------------------------------------------------------------
// Provider config resolution
// ---------------------------------------------------------------------------

const resolveProviderConfig = (env: NodeJS.ProcessEnv): ProviderConfig | null => {
    const provider = (env['AF_MODEL_PROVIDER'] ?? env['AGENTFARM_MODEL_PROVIDER'] ?? 'agentfarm')
        .toLowerCase()
        .trim();

    if (provider === 'agentfarm' || provider === 'mock') return null;

    if (provider === 'anthropic') {
        const apiKey = env['AF_ANTHROPIC_API_KEY'] ?? env['AGENTFARM_ANTHROPIC_API_KEY'] ?? '';
        const model = env['AF_ANTHROPIC_MODEL'] ?? env['AGENTFARM_ANTHROPIC_MODEL'] ?? 'claude-3-5-haiku-latest';
        if (!apiKey.trim()) return null;
        return { kind: 'anthropic', apiKey, model };
    }

    if (provider === 'github_models') {
        const apiKey = env['AF_GITHUB_MODELS_API_KEY'] ?? env['AGENTFARM_GITHUB_MODELS_API_KEY'] ?? '';
        const baseUrl = (env['AF_GITHUB_MODELS_BASE_URL'] ?? env['AGENTFARM_GITHUB_MODELS_BASE_URL'] ?? 'https://models.inference.ai.azure.com').replace(/\/+$/, '');
        const model = env['AF_GITHUB_MODELS_MODEL'] ?? env['AGENTFARM_GITHUB_MODELS_MODEL'] ?? 'openai/gpt-4.1-mini';
        if (!apiKey.trim()) return null;
        return { kind: 'openai_compatible', apiKey, baseUrl, model, isAzure: false };
    }

    if (provider === 'azure_openai' || provider === 'azure-openai') {
        const endpoint = (env['AF_AZURE_OPENAI_ENDPOINT'] ?? env['AGENTFARM_AZURE_OPENAI_ENDPOINT'] ?? '').replace(/\/+$/, '');
        const deployment = env['AF_AZURE_OPENAI_DEPLOYMENT'] ?? env['AGENTFARM_AZURE_OPENAI_DEPLOYMENT'] ?? '';
        const apiVersion = env['AF_AZURE_OPENAI_API_VERSION'] ?? env['AGENTFARM_AZURE_OPENAI_API_VERSION'] ?? '2024-06-01';
        const apiKey = env['AF_AZURE_OPENAI_API_KEY'] ?? env['AGENTFARM_AZURE_OPENAI_API_KEY'] ?? '';
        if (!apiKey.trim() || !endpoint || !deployment) return null;
        const baseUrl = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
        return { kind: 'openai_compatible', apiKey, baseUrl, model: deployment, isAzure: true };
    }

    // Default: openai and openai-compatible providers
    const apiKey = env['AF_OPENAI_API_KEY'] ?? env['AGENTFARM_OPENAI_API_KEY'] ?? '';
    const baseUrl = (env['AF_OPENAI_BASE_URL'] ?? env['AGENTFARM_OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
    const model = env['AF_OPENAI_MODEL'] ?? env['AGENTFARM_OPENAI_MODEL'] ?? 'gpt-4o-mini';
    if (!apiKey.trim()) return null;
    return { kind: 'openai_compatible', apiKey, baseUrl, model, isAzure: false };
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
                },
                body: JSON.stringify({ model, max_tokens: 4096, system: systemMsg, messages: [{ role: 'user', content: userMsg }] }),
                signal: AbortSignal.timeout(120_000),
            });
            if (!response.ok) return [];
            const parsed = await response.json() as { content?: Array<{ type: string; text?: string }> };
            const text = parsed.content?.find((b) => b.type === 'text')?.text ?? '';
            const s = text.indexOf('[');
            const e = text.lastIndexOf(']');
            if (s === -1 || e === -1) return [];
            return parseStepsFromJson(JSON.parse(text.slice(s, e + 1)));
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
                    response_format: { type: 'json_object' },
                    messages,
                }),
                signal: AbortSignal.timeout(120_000),
            });
            if (!response.ok) return [];
            const parsed = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
            const content = parsed.choices?.[0]?.message?.content;
            if (!content) return [];
            return parseStepsFromJson(JSON.parse(content));
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
 * Returns `undefined` when no provider is configured so that callers can
 * fall back to keyword-based plan inference without additional guards.
 *
 * @param env - process.env (injectable for testing)
 */
export const createCodeGenFn = (env: NodeJS.ProcessEnv = process.env): LlmCodeGenFn | undefined => {
    const config = resolveProviderConfig(env);
    if (!config) return undefined;

    if (config.kind === 'anthropic') {
        return buildAnthropicCodeGenFn(config.apiKey, config.model);
    }

    return buildOpenAICompatibleCodeGenFn(config.apiKey, config.baseUrl, config.model, config.isAzure);
};
