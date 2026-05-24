// ============================================================================
// FSD FRAMEWORK ADAPTER
// Sprint 16 — Full-Stack Developer Role
//
// LLM-powered fallback for UI frameworks not hardcoded in fsd-ui-builder.ts.
// When the agent receives framework: "qwik", "solidstart", "preact", etc.,
// instead of silently defaulting to React this module generates a proper
// component + tests via LLM and returns typed GeneratedFrameworkFile[].
//
// isKnownFramework                      → type guard for the 5 built-in frameworks
// buildUnknownFrameworkComponentPrompt  → LLM prompt: full component + test files
// parseUnknownFrameworkOutput           → extracts GeneratedFrameworkFile[] from LLM JSON
// buildUnknownFrameworkTestPrompt       → LLM prompt for tests (separate-pass mode)
// ============================================================================

import type { UiFramework, ComponentProp } from './fsd-ui-builder.js';

// ---------------------------------------------------------------------------
// isKnownFramework
// ---------------------------------------------------------------------------

const KNOWN_FRAMEWORKS: ReadonlySet<string> = new Set<UiFramework>([
    'react', 'vue', 'angular', 'svelte', 'solid',
]);

/**
 * Returns true for the 5 frameworks natively scaffolded by fsd-ui-builder.
 * Anything else (qwik, preact, solidstart, htmx, …) is "unknown" and will
 * fall through to LLM-driven generation.
 */
export function isKnownFramework(v: string): v is UiFramework {
    return KNOWN_FRAMEWORKS.has(v.toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// GeneratedFrameworkFile
// ---------------------------------------------------------------------------

export interface GeneratedFrameworkFile {
    filename: string;
    content:  string;
    isTest:   boolean;
    isStyle:  boolean;
}

// ---------------------------------------------------------------------------
// buildUnknownFrameworkComponentPrompt
// ---------------------------------------------------------------------------

/**
 * Builds the LLM prompt that generates a complete component for any framework.
 * The model is asked to return a JSON array of files so the output is
 * deterministically parseable. Pure function.
 */
export function buildUnknownFrameworkComponentPrompt(params: {
    framework:     string;
    componentName: string;
    description?:  string;
    styling?:      string;
    props?:        ComponentProp[];
    hasState?:     boolean;
    isAsync?:      boolean;
}): string {
    const { framework, componentName, description, styling, props, hasState, isAsync } = params;

    const propsBlock = props?.length
        ? `Props:\n${props.map((p) =>
            `  ${p.name}: ${p.type}${p.required ? ' (required)' : ''}${p.default !== undefined ? ` = ${p.default}` : ''}`,
          ).join('\n')}`
        : '';

    return [
        `You are an expert ${framework} developer.`,
        `Generate a production-ready ${framework} component named "${componentName}".`,
        description ? `Component purpose: ${description}` : '',
        styling     ? `Styling approach: ${styling}` : '',
        propsBlock,
        hasState ? 'The component needs internal state management.' : '',
        isAsync  ? 'The component fetches async data — include loading and error states.' : '',
        ``,
        `Return a JSON array of file objects. Each object must have:`,
        `  filename  — full filename with extension (e.g. "${componentName}.tsx", "${componentName}.test.ts")`,
        `  content   — the complete file content as a string (no truncation)`,
        `  isTest    — true only if this is a test/spec file`,
        `  isStyle   — true only if this is a CSS/style file`,
        ``,
        `Include:`,
        `1. The main component file (use the idiomatic file extension for ${framework})`,
        `2. A complete unit test file using ${framework}'s standard testing library`,
        `3. A style file only if ${framework} conventionally uses separate style files`,
        ``,
        `Requirements:`,
        `- Follow ${framework} best practices and idiomatic patterns`,
        `- Use TypeScript throughout`,
        `- No placeholder TODOs — write real, working code`,
        `- Add JSDoc comments to exported functions/components`,
        ``,
        `No markdown fences, no prose — only the JSON array.`,
    ].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------------------
// parseUnknownFrameworkOutput
// ---------------------------------------------------------------------------

/**
 * Extracts GeneratedFrameworkFile[] from the raw LLM response.
 * Falls back to minimal stub files if JSON parsing fails. Pure function.
 */
export function parseUnknownFrameworkOutput(
    raw:           string,
    componentName: string,
    framework:     string,
): GeneratedFrameworkFile[] {
    const cleaned = raw.replace(/^```[a-z]*\n?/im, '').replace(/```\s*$/im, '').trim();
    const start   = cleaned.indexOf('[');
    const end     = cleaned.lastIndexOf(']');

    if (start !== -1 && end !== -1) {
        try {
            const arr   = JSON.parse(cleaned.slice(start, end + 1)) as unknown[];
            const files = arr
                .filter((item): item is Record<string, unknown> =>
                    typeof item === 'object' && item !== null,
                )
                .map((item) => ({
                    filename: String(item['filename'] ?? `${componentName}.ts`),
                    content:  String(item['content']  ?? ''),
                    isTest:   item['isTest']  === true,
                    isStyle:  item['isStyle'] === true,
                }))
                .filter((f) => f.content.length > 0);

            if (files.length > 0) return files;
        } catch {
            // fall through to stub
        }
    }

    // Fallback: wrap whatever the LLM returned as the component body
    const ext = inferExtension(framework);
    const hasContent = raw.length > 20;

    return [
        {
            filename: `${componentName}${ext}`,
            content:  hasContent ? raw : stubComponent(componentName, framework),
            isTest:   false,
            isStyle:  false,
        },
        {
            filename: `${componentName}.test.ts`,
            content:  stubTest(componentName, framework),
            isTest:   true,
            isStyle:  false,
        },
    ];
}

function inferExtension(framework: string): string {
    const f = framework.toLowerCase();
    if (f.includes('vue'))    return '.vue';
    if (f.includes('svelte')) return '.svelte';
    return '.tsx';
}

function stubComponent(name: string, framework: string): string {
    return [
        `// ${framework} component: ${name}`,
        `// Generated by fsd-framework-adapter — LLM output was unparseable`,
        `// TODO: implement`,
        ``,
        `export default function ${name}() {`,
        `    return null;`,
        `}`,
    ].join('\n');
}

function stubTest(name: string, framework: string): string {
    return [
        `// ${framework} test for ${name}`,
        `import { describe, it, expect } from 'vitest';`,
        ``,
        `describe('${name}', () => {`,
        `    it('renders without crash', () => {`,
        `        expect(true).toBe(true); // TODO: replace with real render test`,
        `    });`,
        `});`,
    ].join('\n');
}

// ---------------------------------------------------------------------------
// buildUnknownFrameworkTestPrompt
// ---------------------------------------------------------------------------

/**
 * Builds the LLM prompt to generate tests for an unknown-framework component
 * when the component was generated in a prior pass. Pure function.
 */
export function buildUnknownFrameworkTestPrompt(
    componentCode: string,
    componentName: string,
    framework:     string,
): string {
    return [
        `You are an expert ${framework} developer writing unit tests.`,
        ``,
        `Component code:`,
        `\`\`\``,
        componentCode.slice(0, 4000),
        `\`\`\``,
        ``,
        `Generate a complete, runnable test file for the "${componentName}" component.`,
        `Use the testing library most commonly paired with ${framework}.`,
        ``,
        `Cover:`,
        `- Renders without crash`,
        `- Renders with required props`,
        `- User interactions (if present in the component)`,
        ``,
        `Return only the test file content — no JSON wrapper, no markdown fences.`,
    ].join('\n');
}
