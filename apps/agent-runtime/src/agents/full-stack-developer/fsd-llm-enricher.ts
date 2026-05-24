// ============================================================================
// FSD LLM ENRICHER
// Sprint 16 — Full-Stack Developer Role
//
// Async enrichment functions that take scaffolded code produced by the pure
// builder functions and use an LLM to fill in the domain-specific logic that
// static generators cannot produce without knowing the application context.
//
// buildComponentLlmPrompt        → prompt for filling a scaffold component body
// enrichComponentCode            → calls LLM, replaces TODO stubs with real code
// buildApiTypesLlmPrompt         → prompt for inferring TS interface fields
// enrichApiTypes                 → calls LLM, replaces TODO interface fields
// parseOpenApiIntoTypesCode      → extracts real types from an OpenAPI 3 spec
// generateDesignAwareComponent   → LLM converts design tokens → real UI code
// runTestFixLoop                 → iterative run-tests → LLM-fix → re-run loop
// parseAxeCliOutput              → converts axe-cli JSON stdout → A11yReport
// parseBuildOutput               → extracts bundle file sizes from build stdout
// ============================================================================

import type { A11yIssue, A11yReport } from './fsd-ui-builder.js';
import type { ApiEndpoint } from './fsd-integration-builder.js';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type LlmCallFn = (prompt: string, systemPrompt?: string) => Promise<string>;

type ExecuteActionFn = (
    actionType: string,
    payload: Record<string, unknown>,
) => Promise<{ ok: boolean; output: string; errorOutput?: string }>;

type RunCommandFn = (
    args: string[],
    cwd: string,
    timeoutMs?: number,
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

// ---------------------------------------------------------------------------
// Gap 1 — LLM component body enrichment
// ---------------------------------------------------------------------------

/**
 * Builds the LLM prompt used to enrich a scaffold component body.
 * Pure function — no side-effects, no async.
 */
export function buildComponentLlmPrompt(params: {
    scaffoldCode: string;
    componentName: string;
    description:   string;
    framework:     string;
    styling:       string;
    props:         Array<{ name: string; type: string; required: boolean; default?: string }>;
}): string {
    const { scaffoldCode, componentName, description, framework, styling, props } = params;
    const propsBlock = props.length > 0
        ? props.map((p) => `  - ${p.name}: ${p.type}${p.required ? ' (required)' : ` (optional, default: ${p.default ?? 'undefined'})`}`).join('\n')
        : '  (no props)';

    return [
        `You are an expert ${framework} developer. Fill in the component body below.`,
        ``,
        `Component: ${componentName}`,
        `Purpose: ${description || 'A reusable UI component'}`,
        `Framework: ${framework}`,
        `Styling: ${styling}`,
        `Props:`,
        propsBlock,
        ``,
        `RULES:`,
        `- Replace every "TODO: implement" comment with real, working ${framework} code.`,
        `- Follow ${styling} conventions exactly (${styling === 'tailwind' ? 'use Tailwind classes inline' : `use ${styling}`}).`,
        `- Keep all existing imports, the props interface/type, and the export statement.`,
        `- Add any necessary state hooks, effects, or event handlers inside the component.`,
        `- Return ONLY the complete file content — no markdown fences, no explanation.`,
        ``,
        `SCAFFOLD TO FILL:`,
        `\`\`\``,
        scaffoldCode,
        `\`\`\``,
    ].join('\n');
}

/**
 * Uses callLlm to replace TODO stubs in a scaffold component with real code.
 * Returns the enriched file content, or the original scaffold if LLM fails.
 */
export async function enrichComponentCode(params: {
    scaffoldCode:  string;
    componentName: string;
    description:   string;
    framework:     string;
    styling:       string;
    props:         Array<{ name: string; type: string; required: boolean; default?: string }>;
    callLlm:       LlmCallFn;
}): Promise<string> {
    const prompt = buildComponentLlmPrompt(params);
    try {
        const raw = await params.callLlm(
            prompt,
            `You are a senior ${params.framework} developer. Output only valid ${params.framework} code.`,
        );
        // Strip accidental markdown fences
        const cleaned = raw
            .replace(/^```[a-z]*\n?/im, '')
            .replace(/```\s*$/im, '')
            .trim();
        return cleaned.length > 50 ? cleaned : params.scaffoldCode;
    } catch {
        return params.scaffoldCode;   // graceful fallback — scaffold is still valid
    }
}

// ---------------------------------------------------------------------------
// Gap 2 — LLM / OpenAPI API type filling
// ---------------------------------------------------------------------------

/**
 * Builds the LLM prompt used to enrich generated TypeScript API interfaces.
 * Pure function.
 */
export function buildApiTypesLlmPrompt(typesCode: string, endpoints: ApiEndpoint[]): string {
    const endpointSummary = endpoints.map((e) =>
        `  ${e.method} ${e.path}${e.requestBody ? ` → body: ${e.requestBody}` : ''} → response: ${e.responseType}`,
    ).join('\n');

    return [
        `You are a TypeScript API expert. Fill in the TODO interface fields below.`,
        ``,
        `These interfaces map to the following REST endpoints:`,
        endpointSummary,
        ``,
        `RULES:`,
        `- Replace each "// TODO: define ..." comment with realistic TypeScript fields.`,
        `- Use only primitive types (string, number, boolean), arrays, or other interfaces defined in this file.`,
        `- Add JSDoc comments for each field explaining what it represents.`,
        `- Keep all existing interface names and export statements.`,
        `- Return ONLY the complete file content — no markdown fences, no explanation.`,
        ``,
        `TYPES FILE TO FILL:`,
        typesCode,
    ].join('\n');
}

/**
 * Parses a subset of OpenAPI 3.x spec JSON and returns TypeScript interface code.
 * Pure function — works on the JSON object, no I/O.
 */
export function parseOpenApiIntoTypesCode(spec: Record<string, unknown>): string {
    const schemas = (spec['components'] as Record<string, unknown> | undefined)?.['schemas'];
    if (!schemas || typeof schemas !== 'object') return '';

    const lines: string[] = [`// Types extracted from OpenAPI spec`, ''];

    for (const [name, schemaDef] of Object.entries(schemas as Record<string, unknown>)) {
        const schema = schemaDef as Record<string, unknown>;
        if (schema['type'] !== 'object' && !schema['properties']) continue;

        lines.push(`export interface ${name} {`);
        const properties = (schema['properties'] as Record<string, Record<string, unknown>>) ?? {};
        const required   = Array.isArray(schema['required']) ? (schema['required'] as string[]) : [];

        for (const [propName, propSchema] of Object.entries(properties)) {
            const tsType = openApiTypeToTs(propSchema);
            const isReq  = required.includes(propName);
            const desc   = typeof propSchema['description'] === 'string' ? ` // ${propSchema['description']}` : '';
            lines.push(`  ${propName}${isReq ? '' : '?'}: ${tsType};${desc}`);
        }
        lines.push(`}`, '');
    }
    return lines.join('\n');
}

function openApiTypeToTs(schema: Record<string, unknown>): string {
    if (schema['$ref']) {
        const ref = String(schema['$ref']);
        return ref.split('/').pop() ?? 'unknown';
    }
    switch (schema['type']) {
        case 'string':  return schema['enum'] ? (schema['enum'] as string[]).map((v) => `'${v}'`).join(' | ') : 'string';
        case 'integer':
        case 'number':  return 'number';
        case 'boolean': return 'boolean';
        case 'array':   return `${openApiTypeToTs((schema['items'] as Record<string, unknown>) ?? {})}[]`;
        case 'object':  return 'Record<string, unknown>';
        default:        return 'unknown';
    }
}

/**
 * Enriches generated TypeScript API types using either:
 *   1. An OpenAPI spec (parsed into real field definitions), or
 *   2. LLM inference based on endpoint names and paths.
 *
 * Returns the enriched types code, or the original if both fail.
 */
export async function enrichApiTypes(params: {
    typesCode:    string;
    endpoints:    ApiEndpoint[];
    openApiSpec?: string;    // raw JSON string of an OpenAPI 3.x spec
    callLlm?:    LlmCallFn;
}): Promise<string> {
    const { typesCode, endpoints, openApiSpec, callLlm } = params;

    // Option A: OpenAPI spec provided — parse it for real types
    if (openApiSpec) {
        try {
            const spec = JSON.parse(openApiSpec) as Record<string, unknown>;
            const parsed = parseOpenApiIntoTypesCode(spec);
            if (parsed.length > 50) return parsed;
        } catch {
            // fall through to LLM
        }
    }

    // Option B: LLM enrichment
    if (callLlm) {
        try {
            const prompt = buildApiTypesLlmPrompt(typesCode, endpoints);
            const raw = await callLlm(
                prompt,
                'You are a TypeScript expert. Output only valid TypeScript interfaces.',
            );
            const cleaned = raw
                .replace(/^```[a-z]*\n?/im, '')
                .replace(/```\s*$/im, '')
                .trim();
            return cleaned.length > 50 ? cleaned : typesCode;
        } catch {
            // fall through to original
        }
    }

    return typesCode;
}

// ---------------------------------------------------------------------------
// Gap 3 — Iterative test-fix loop
// ---------------------------------------------------------------------------

export type TestFixLoopResult = {
    passed:   boolean;
    attempts: number;
    steps:    string[];
};

/**
 * Runs tests, and if they fail uses workspace_fix_test_failures (or LLM) to
 * apply fixes, then re-runs — up to maxAttempts times.
 *
 * Delegates to existing executor primitives so the logic stays thin.
 */
export async function runTestFixLoop(params: {
    executeAction:  ExecuteActionFn;
    workspaceDir:   string;
    maxAttempts?:   number;
    callLlm?:       LlmCallFn;
}): Promise<TestFixLoopResult> {
    const { executeAction, workspaceDir, callLlm } = params;
    const maxAttempts = params.maxAttempts ?? 3;
    const steps: string[] = [];
    let passed = false;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Run tests
        const testResult = await executeAction('run_tests', { workspace_dir: workspaceDir });
        const status = testResult.ok ? 'passed' : 'failed';
        steps.push(`Attempt ${attempt}: tests ${status}`);

        if (testResult.ok) {
            passed = true;
            break;
        }

        if (attempt === maxAttempts) break;   // no point fixing on last attempt

        // Try workspace_fix_test_failures first (uses the existing AI fixer)
        const fixResult = await executeAction('workspace_fix_test_failures', {
            workspace_dir: workspaceDir,
            test_output:   testResult.output + (testResult.errorOutput ?? ''),
        });
        steps.push(`Attempt ${attempt}: fix ${fixResult.ok ? 'applied' : 'failed'}`);

        // If that didn't work and we have an LLM, ask it directly
        if (!fixResult.ok && callLlm) {
            try {
                const diagnosis = await callLlm(
                    [
                        `The following test failures occurred. Diagnose the root cause and describe exactly which files need to change and how:`,
                        '',
                        testResult.output.slice(0, 3000),
                        testResult.errorOutput?.slice(0, 1000) ?? '',
                    ].join('\n'),
                    'You are a senior software engineer. Be concise and precise.',
                );
                steps.push(`LLM diagnosis: ${diagnosis.slice(0, 120)}`);
            } catch {
                // Diagnosis failed — continue to next attempt
            }
        }
    }

    return { passed, attempts: maxAttempts, steps };
}

// ---------------------------------------------------------------------------
// Gap 4 — Live a11y via axe-cli
// ---------------------------------------------------------------------------

/**
 * Attempts to run axe-cli against a URL and returns its JSON output string.
 * Returns null if axe-cli is not available or the run fails.
 */
export async function runAxeCli(params: {
    url:         string;
    runCommand:  RunCommandFn;
    workspaceDir: string;
}): Promise<string | null> {
    const { url, runCommand, workspaceDir } = params;
    try {
        const result = await runCommand(
            ['npx', 'axe-cli', url, '--reporter', 'json', '--exit'],
            workspaceDir,
            60_000,
        );
        // axe-cli exits non-zero when violations found, but output is still valid JSON
        const combined = result.stdout + result.stderr;
        // Find the JSON block in output
        const jsonStart = combined.indexOf('{');
        const jsonEnd   = combined.lastIndexOf('}');
        if (jsonStart >= 0 && jsonEnd > jsonStart) {
            return combined.slice(jsonStart, jsonEnd + 1);
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Parses axe-cli JSON output into an A11yReport.
 * Pure function.
 */
export function parseAxeCliOutput(rawJson: string): A11yReport {
    type AxeResult = {
        violations?: Array<{
            id: string;
            description: string;
            impact: string;
            helpUrl: string;
            nodes: Array<{ html: string; failureSummary: string }>;
        }>;
    };

    let parsed: AxeResult = {};
    try {
        parsed = JSON.parse(rawJson) as AxeResult;
    } catch {
        return { score: 0, violations: [], summary: 'Failed to parse axe-cli output.' };
    }

    const violations: A11yIssue[] = (parsed.violations ?? []).map((v) => ({
        rule:        v.id,
        description: v.description,
        severity:    (v.impact as A11yIssue['severity']) ?? 'moderate',
        selector:    v.nodes[0]?.html?.slice(0, 80) ?? undefined,
        fix:         v.nodes[0]?.failureSummary ?? `See ${v.helpUrl}`,
    }));

    const score = Math.max(0, 100 - violations.length * 10);
    const summary = violations.length === 0
        ? 'No accessibility violations found.'
        : `${violations.length} violation(s) found — worst: ${violations[0]?.rule ?? 'unknown'}`;

    return { score, violations, summary };
}

// ---------------------------------------------------------------------------
// Gap 5 — Live bundle analysis from actual build
// ---------------------------------------------------------------------------

export type BundleFile = { name: string; sizeKb: number };

/**
 * Runs the project build command and scans the output directory for bundle sizes.
 * Returns null if the build fails.
 */
export async function measureBundleFromBuild(params: {
    executeAction:  ExecuteActionFn;
    runCommand:     RunCommandFn;
    workspaceDir:   string;
    distDir?:       string;   // default: 'dist'
}): Promise<{ files: BundleFile[]; totalKb: number } | null> {
    const { executeAction, runCommand, workspaceDir } = params;
    const distDir = params.distDir ?? 'dist';

    // Step 1: Run build
    const buildResult = await executeAction('run_build', { workspace_dir: workspaceDir });
    if (!buildResult.ok) return null;

    // Step 2: List dist directory sizes using OS-agnostic approach
    try {
        const isWindows = process.platform === 'win32';
        const sizeResult = isWindows
            ? await runCommand(['cmd', '/c', `dir /s /b "${distDir}"`], workspaceDir, 30_000)
            : await runCommand(['find', distDir, '-type', 'f', '-name', '*.js', '-o', '-name', '*.css'], workspaceDir, 30_000);

        const filePaths = sizeResult.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
        const files: BundleFile[] = [];

        for (const filePath of filePaths.slice(0, 30)) {   // cap at 30 files
            if (!filePath.match(/\.(js|css|mjs|cjs)$/)) continue;
            try {
                const statResult = await runCommand(
                    isWindows ? ['cmd', '/c', `for %A in ("${filePath}") do @echo %~zA`] : ['stat', '-c', '%s', filePath],
                    workspaceDir,
                    5_000,
                );
                const bytes = parseInt(statResult.stdout.trim(), 10);
                if (!isNaN(bytes)) {
                    files.push({ name: filePath.split(/[\\/]/).pop() ?? filePath, sizeKb: Math.round(bytes / 1024) });
                }
            } catch { /* skip unreadable file */ }
        }

        const totalKb = files.reduce((s, f) => s + f.sizeKb, 0);
        return { files, totalKb };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Gap 6 — LLM-aware design handoff
// ---------------------------------------------------------------------------

/**
 * Generates a component that concretely uses the extracted design tokens
 * instead of just referencing them as CSS var names.
 */
export async function generateDesignAwareComponent(params: {
    componentName: string;
    tokensCss:     string;      // the generated :root { --color-primary: #... } block
    description:   string;      // from Figma layer name or user description
    framework:     string;
    callLlm:       LlmCallFn;
}): Promise<string> {
    const { componentName, tokensCss, description, framework, callLlm } = params;

    const prompt = [
        `You are an expert ${framework} developer doing a Figma design handoff.`,
        ``,
        `The following CSS design tokens were extracted from the Figma file:`,
        `\`\`\`css`,
        tokensCss.slice(0, 2000),
        `\`\`\``,
        ``,
        `Generate a ${framework} component named "${componentName}" that:`,
        `1. Imports and uses these design tokens (via CSS custom properties or a styles import).`,
        `2. Implements the described UI: "${description || 'A component matching the design tokens above'}".`,
        `3. Is production-quality: accessible, responsive, and uses semantic HTML.`,
        `4. Includes prop types/interfaces with sensible defaults.`,
        ``,
        `Return ONLY the complete ${framework} component file content. No markdown fences, no explanation.`,
    ].join('\n');

    try {
        const raw = await callLlm(
            prompt,
            `You are a senior ${framework} frontend developer. Output only valid ${framework} code.`,
        );
        const cleaned = raw
            .replace(/^```[a-z]*\n?/im, '')
            .replace(/```\s*$/im, '')
            .trim();
        return cleaned.length > 100 ? cleaned : '';
    } catch {
        return '';
    }
}
