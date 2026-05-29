/**
 * Technical Writer Action Handler
 *
 * Bridges the LocalWorkspaceActionType dispatch switch in
 * local-workspace-executor.ts to the six TW domain actions:
 *   - workspace_tw_doc_diff          — diff-driven documentation update
 *   - workspace_tw_api_doc_openapi   — OpenAPI/Swagger → markdown API reference
 *   - workspace_tw_api_doc_code      — source code JSDoc/TSDoc → API docs
 *   - workspace_tw_release_notes     — git log → structured release notes
 *   - workspace_tw_style_check       — prose style guide linter
 *   - workspace_tw_standup_report    — episodic memory → standup summary
 *
 * Design rules (mirrors corporate-assistant-action-handler.ts):
 *   - Pure domain logic only — no HTTP calls, no LLM calls.
 *   - File I/O uses Node built-ins (fs/promises) with safeChildPath-equivalent
 *     path validation provided by the callers via workspaceDir.
 *   - Persona is read from payload._persona when present.
 *   - Each case is fully self-contained; no shared mutable state.
 */

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative, join, extname } from 'node:path';
import type { LocalWorkspaceResult } from '../../local-workspace-executor.js';
import { buildTechnicalWriterStandupSummary } from './technical-writer-standup-builder.js';
import {
    buildInterviewPlanFromCode,
    buildInterviewPlanFromDescription,
    synthesiseDocBrief,
    type SmeInterviewQuestion,
    type SmeInterviewResponse,
} from './sme-interview-builder.js';
import {
    buildSprintDoc,
    type SprintDocType,
    type SprintData,
    type UserStory,
    type RetroItem,
} from './sprint-doc-builder.js';
import {
    buildManualFromSections,
    buildManualTemplate,
    type ManualMetadata,
    type ManualSection,
    type ManualAudience,
} from './manual-builder.js';
import {
    buildFaqMarkdown,
    buildFaqTemplate,
    extractFaqFromSupportText,
    categorizeFaqEntries,
    DEFAULT_FAQ_CATEGORIES,
    type FaqDocument,
    type FaqEntry,
} from './faq-builder.js';
import {
    buildTutorialMarkdown,
    buildTutorialSeries,
    buildTutorialTemplate,
    type Tutorial,
    type TutorialSeries,
    type TutorialLevel,
} from './tutorial-builder.js';
import {
    buildOnboardingFlowMarkdown,
    buildOnboardingChecklist,
    buildOnboardingTemplate,
    type OnboardingFlow,
    type OnboardingRole,
    type OnboardingPhase,
    type OnboardingTask,
} from './onboarding-builder.js';
import {
    buildWhitepaperFromSections,
    buildWhitepaperTemplate,
    type WhitepaperMetadata,
    type WhitepaperSection,
} from './whitepaper-builder.js';
import {
    analyzeAudienceMatch,
    adaptForAudience,
    compareAudiences,
    type AudiencePersona,
} from './audience-rewriter.js';
import {
    analyzeFeedback,
    type FeedbackItem,
    type FeedbackSource,
} from './feedback-analyzer.js';
import {
    auditNavigation,
    type DocFile as NavDocFile,
} from './nav-auditor.js';
import {
    buildLocalizationStatus,
    buildLocalizationReport,
    generateStringExport,
    parseGitLastModified,
    type LocalizationManifest,
    type SourceFileInfo,
    type TranslationFileInfo,
} from './localization-tracker.js';
import {
    auditDocLifecycle,
    type AuditDocFile,
    type CodeChangeRecord,
    type DocAuditOptions,
} from './doc-auditor.js';
import {
    type LlmCallFn,
    callLlmSafe,
    hasPlaceholders,
    buildManualProsePrompt,
    buildTutorialProsePrompt,
    buildWhitepaperProsePrompt,
    buildFaqProsePrompt,
    buildOnboardingProsePrompt,
    buildDocDiffNarrativePrompt,
    buildSmeBriefProsePrompt,
    buildReleaseNotesEnhancementPrompt,
    buildApiDocEnhancementPrompt,
    buildCodeDocEnhancementPrompt,
} from './llm-enhancer.js';
import {
    buildProductDiscoveryReport,
    buildScreenshotDocPage,
    extractFeaturesFromCode,
    findDocGaps,
    type CrawledPage,
} from './product-explorer.js';
import {
    extractStepsFromMarkdown,
    buildVerificationReport,
    type StepVerificationResult,
} from './step-verifier.js';
import {
    buildInteractionReport,
    type InteractionStep,
    type InteractionStepResult,
} from './product-interactor.js';
import {
    parseGhPrReviewComments,
    isActionableComment,
    buildReviewResponseReport,
    type ReviewFix,
} from './pr-review-responder.js';
import {
    extractDocEntry,
    buildDocIndex,
    findCoveringDocs,
    type DocIndexEntry,
} from './doc-indexer.js';
import {
    parseGithubIssues,
    buildRoadmapContext,
} from './roadmap-context-builder.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TechnicalWriterActionType =
    | 'workspace_tw_doc_diff'
    | 'workspace_tw_api_doc_openapi'
    | 'workspace_tw_api_doc_code'
    | 'workspace_tw_release_notes'
    | 'workspace_tw_style_check'
    | 'workspace_tw_standup_report'
    | 'workspace_tw_sme_interview'
    | 'workspace_tw_sprint_doc'
    | 'workspace_tw_manual'
    | 'workspace_tw_faq'
    | 'workspace_tw_tutorial'
    | 'workspace_tw_onboarding'
    | 'workspace_tw_whitepaper'
    | 'workspace_tw_endpoint_verify'
    | 'workspace_tw_audience_rewrite'
    | 'workspace_tw_feedback_analysis'
    | 'workspace_tw_nav_audit'
    | 'workspace_tw_localization'
    | 'workspace_tw_doc_audit'
    // Browser/UI discovery — closes the product-knowledge and self-direction gaps
    | 'workspace_tw_product_crawl'
    | 'workspace_tw_screenshot_doc'
    | 'workspace_tw_doc_gap_scan'
    // Accuracy verification — closes the "does the doc actually work?" gap
    | 'workspace_tw_verify_doc_steps'
    // Full parity with human TW — the four remaining gaps
    | 'workspace_tw_interact_product'   // gap 1: login, fill, click, assert
    | 'workspace_tw_pr_review_respond'  // gap 2: read review comments, apply fixes
    | 'workspace_tw_doc_index'          // gap 3: index entire doc set
    | 'workspace_tw_roadmap_context';   // gap 4: deprecation + upcoming features

const TW_ACTION_TYPES = new Set<string>([
    'workspace_tw_doc_diff', 'workspace_tw_api_doc_openapi', 'workspace_tw_api_doc_code',
    'workspace_tw_release_notes', 'workspace_tw_style_check', 'workspace_tw_standup_report',
    'workspace_tw_sme_interview', 'workspace_tw_sprint_doc', 'workspace_tw_manual',
    'workspace_tw_faq', 'workspace_tw_tutorial', 'workspace_tw_onboarding',
    'workspace_tw_whitepaper', 'workspace_tw_endpoint_verify',
    'workspace_tw_audience_rewrite', 'workspace_tw_feedback_analysis',
    'workspace_tw_nav_audit', 'workspace_tw_localization', 'workspace_tw_doc_audit',
    // Browser/UI discovery
    'workspace_tw_product_crawl', 'workspace_tw_screenshot_doc', 'workspace_tw_doc_gap_scan',
    // Accuracy verification
    'workspace_tw_verify_doc_steps',
    // Full human-parity actions
    'workspace_tw_interact_product',
    'workspace_tw_pr_review_respond',
    'workspace_tw_doc_index',
    'workspace_tw_roadmap_context',
]);

export function isTechnicalWriterActionType(t: string): t is TechnicalWriterActionType {
    return TW_ACTION_TYPES.has(t);
}

/**
 * Callback type for multi-step authenticated product interaction.
 * The executor provides this using a persistent Playwright page within
 * the shared BrowserContext (getWebContext). Keeps session state (cookies,
 * login) across steps so the agent can navigate authenticated flows.
 */
export type InteractPageFn = (
    steps: InteractionStep[],
    options?: { captureScreenshots?: boolean; taskId?: string },
) => Promise<InteractionStepResult[]>;

/**
 * Callback type for browser-based page reading.
 * The executor provides this from the existing Playwright/web-actions
 * infrastructure (getWebContext + webReadPage + webExtractData).
 * Returns null on navigation failure so the caller can skip gracefully.
 */
export type BrowsePageFn = (
    url: string,
    options?: {
        extract?: 'text' | 'tables' | 'all';
        screenshot?: boolean;
        taskId?: string;
    },
) => Promise<{
    ok: boolean;
    title: string;
    text: string;
    headings: string[];
    tables?: unknown[];
    screenshotPath?: string;
} | null>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function safeJson(value: unknown): LocalWorkspaceResult {
    return { ok: true, output: JSON.stringify(value, null, 2) };
}

function safeWorkspacePath(workspaceDir: string, filePath: string): string {
    const resolved = resolve(workspaceDir, filePath);
    const rel = relative(workspaceDir, resolved);
    if (rel.startsWith('..') || rel.startsWith('/')) {
        throw new Error(`Path traversal blocked: '${filePath}' escapes workspace root.`);
    }
    return resolved;
}

async function writeDocFile(
    workspaceDir: string,
    filePath: string,
    content: string,
): Promise<void> {
    const safePath = safeWorkspacePath(workspaceDir, filePath);
    await mkdir(dirname(safePath), { recursive: true });
    await writeFile(safePath, content, 'utf-8');
}

async function readDocFile(
    workspaceDir: string,
    filePath: string,
): Promise<string | null> {
    try {
        const safePath = safeWorkspacePath(workspaceDir, filePath);
        return await readFile(safePath, 'utf-8');
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Diff parser
// Parse a unified diff (git diff output) into a structured change summary.
// ---------------------------------------------------------------------------

type DiffFileSummary = {
    filePath: string;
    additions: number;
    deletions: number;
    addedLines: string[];
    removedLines: string[];
    changedSymbols: string[];
};

function parseUnifiedDiff(diffText: string): DiffFileSummary[] {
    const files: DiffFileSummary[] = [];
    let current: DiffFileSummary | null = null;

    // Regex patterns for function/class/method signatures in diff lines
    const symbolPatterns = [
        /^[+-]\s*(export\s+)?(async\s+)?function\s+(\w+)/,
        /^[+-]\s*(export\s+)?(abstract\s+)?class\s+(\w+)/,
        /^[+-]\s*(export\s+)?interface\s+(\w+)/,
        /^[+-]\s*(export\s+)?type\s+(\w+)/,
        /^[+-]\s*(export\s+)?const\s+(\w+)\s*=/,
        /^[+-]\s*(\w+)\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/,
        /^[+-]\s*def\s+(\w+)/,
        /^[+-]\s*func\s+(\w+)/,
    ];

    for (const line of diffText.split('\n')) {
        // New file in diff
        if (line.startsWith('diff --git ')) {
            const match = line.match(/diff --git a\/(.+) b\/(.+)/);
            if (match) {
                current = {
                    filePath: match[2] ?? match[1] ?? 'unknown',
                    additions: 0,
                    deletions: 0,
                    addedLines: [],
                    removedLines: [],
                    changedSymbols: [],
                };
                files.push(current);
            }
            continue;
        }

        if (!current) continue;

        if (line.startsWith('+') && !line.startsWith('+++')) {
            current.additions++;
            if (current.addedLines.length < 20) current.addedLines.push(line.slice(1).trim());
            for (const pat of symbolPatterns) {
                const m = line.match(pat);
                if (m) {
                    const sym = m[m.length - 1];
                    if (sym && !current.changedSymbols.includes(sym)) {
                        current.changedSymbols.push(sym);
                    }
                    break;
                }
            }
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            current.deletions++;
            if (current.removedLines.length < 20) current.removedLines.push(line.slice(1).trim());
        }
    }

    return files.filter((f) => f.additions > 0 || f.deletions > 0);
}

function buildDocUpdateFromDiff(
    changedFiles: DiffFileSummary[],
    existingDocContent: string | null,
    docTitle: string,
): string {
    const now = new Date().toISOString().split('T')[0];
    const sections: string[] = [];

    sections.push(`# ${docTitle}`);
    sections.push(`\n_Last updated: ${now}_\n`);

    if (existingDocContent) {
        // Preserve existing content, appending a "Recent Changes" section
        sections.push(existingDocContent.trimEnd());
        sections.push('\n\n---\n');
        sections.push(`## Recent Changes (${now})\n`);
    } else {
        sections.push('## Change Summary\n');
    }

    if (changedFiles.length === 0) {
        sections.push('_No file changes detected in diff._\n');
        return sections.join('\n');
    }

    sections.push(`${changedFiles.length} file(s) changed:\n`);

    for (const f of changedFiles) {
        sections.push(`### \`${f.filePath}\``);
        sections.push(`- **+${f.additions}** additions, **-${f.deletions}** deletions`);

        if (f.changedSymbols.length > 0) {
            sections.push(`- Changed symbols: ${f.changedSymbols.map((s) => `\`${s}\``).join(', ')}`);
        }

        if (f.addedLines.length > 0) {
            const preview = f.addedLines.slice(0, 5).join('\n  ');
            sections.push(`\n**Added (preview):**\n\`\`\`\n  ${preview}\n\`\`\``);
        }
        sections.push('');
    }

    return sections.join('\n');
}

// ---------------------------------------------------------------------------
// OpenAPI parser
// Supports JSON specs and basic YAML specs (structural key extraction).
// ---------------------------------------------------------------------------

type OpenApiEndpoint = {
    path: string;
    method: string;
    summary: string;
    description: string;
    operationId: string;
    tags: string[];
    parameters: Array<{ name: string; in: string; required: boolean; description: string }>;
    requestBodyDescription: string;
    responses: Array<{ code: string; description: string }>;
};

type OpenApiInfo = {
    title: string;
    version: string;
    description: string;
    baseUrl: string;
};

function parseOpenApiSpec(content: string): { info: OpenApiInfo; endpoints: OpenApiEndpoint[] } {
    let spec: Record<string, unknown>;

    // Try JSON first
    try {
        spec = JSON.parse(content) as Record<string, unknown>;
    } catch {
        // Fall back to minimal YAML extraction
        spec = extractYamlStructure(content);
    }

    const rawInfo = (spec['info'] ?? {}) as Record<string, unknown>;
    const info: OpenApiInfo = {
        title: String(rawInfo['title'] ?? 'API Reference'),
        version: String(rawInfo['version'] ?? ''),
        description: String(rawInfo['description'] ?? ''),
        baseUrl: extractBaseUrl(spec),
    };

    const paths = (spec['paths'] ?? {}) as Record<string, unknown>;
    const endpoints: OpenApiEndpoint[] = [];

    for (const [path, pathItem] of Object.entries(paths)) {
        if (!pathItem || typeof pathItem !== 'object') continue;
        const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
        for (const method of methods) {
            const op = (pathItem as Record<string, unknown>)[method];
            if (!op || typeof op !== 'object') continue;
            const opObj = op as Record<string, unknown>;

            // Parameters
            const rawParams = Array.isArray(opObj['parameters']) ? opObj['parameters'] : [];
            const parameters = rawParams.map((p) => {
                const pObj = (typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>;
                return {
                    name: String(pObj['name'] ?? ''),
                    in: String(pObj['in'] ?? ''),
                    required: pObj['required'] === true,
                    description: String(pObj['description'] ?? ''),
                };
            });

            // Request body description
            const reqBody = opObj['requestBody'] as Record<string, unknown> | undefined;
            const requestBodyDescription = reqBody
                ? String(reqBody['description'] ?? extractContentTypeDescription(reqBody))
                : '';

            // Responses
            const rawResponses = (opObj['responses'] ?? {}) as Record<string, unknown>;
            const responses = Object.entries(rawResponses).map(([code, r]) => {
                const rObj = (typeof r === 'object' && r !== null ? r : {}) as Record<string, unknown>;
                return { code, description: String(rObj['description'] ?? '') };
            });

            const tags = Array.isArray(opObj['tags'])
                ? opObj['tags'].filter((t): t is string => typeof t === 'string')
                : [];

            endpoints.push({
                path,
                method: method.toUpperCase(),
                summary: String(opObj['summary'] ?? ''),
                description: String(opObj['description'] ?? ''),
                operationId: String(opObj['operationId'] ?? ''),
                tags,
                parameters,
                requestBodyDescription,
                responses,
            });
        }
    }

    return { info, endpoints };
}

function extractBaseUrl(spec: Record<string, unknown>): string {
    // OpenAPI 3.x
    const servers = spec['servers'];
    if (Array.isArray(servers) && servers.length > 0) {
        const first = servers[0] as Record<string, unknown>;
        return String(first['url'] ?? '');
    }
    // Swagger 2.x
    const host = spec['host'];
    const basePath = spec['basePath'] ?? '/';
    const schemes = Array.isArray(spec['schemes']) ? spec['schemes'] : ['https'];
    if (host) {
        return `${schemes[0]}://${host}${basePath}`;
    }
    return '';
}

function extractContentTypeDescription(reqBody: Record<string, unknown>): string {
    const content = reqBody['content'] as Record<string, unknown> | undefined;
    if (!content) return '';
    const contentTypes = Object.keys(content);
    return contentTypes.length > 0 ? `Content-Type: ${contentTypes.join(', ')}` : '';
}

/**
 * Minimal YAML structure extractor for OpenAPI specs.
 * Handles string scalars, booleans, nested objects (by indentation),
 * and simple lists. Not a full YAML parser — covers the subset used in OpenAPI.
 */
function extractYamlStructure(yaml: string): Record<string, unknown> {
    const lines = yaml.split('\n');
    const result: Record<string, unknown> = {};

    // Build a flat map of indented path → value, then nest it
    type YamlEntry = { indent: number; key: string; value: string | null; lineNo: number };
    const entries: YamlEntry[] = [];

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i] ?? '';
        if (raw.trimStart().startsWith('#') || raw.trim() === '') continue;
        const indent = raw.search(/\S/);
        if (indent < 0) continue;

        const content = raw.trimStart();

        // List item — associate with parent key
        if (content.startsWith('- ')) {
            entries.push({ indent, key: '-', value: content.slice(2).trim(), lineNo: i });
            continue;
        }

        const colonIdx = content.indexOf(':');
        if (colonIdx < 0) continue;

        const key = content.slice(0, colonIdx).trim();
        const rest = content.slice(colonIdx + 1).trim();

        // Skip YAML anchors/aliases
        if (key.startsWith('&') || key.startsWith('*')) continue;

        const value = rest === '' || rest.startsWith('#') ? null : rest.replace(/#.*$/, '').trim();
        entries.push({ indent, key, value, lineNo: i });
    }

    // Simple two-level nesting for the top-level keys we care about
    const KNOWN_TOP_KEYS = new Set(['info', 'servers', 'paths', 'components', 'openapi', 'swagger', 'host', 'basePath', 'schemes']);
    let topKey = '';
    let subKey = '';
    for (const entry of entries) {
        if (entry.indent === 0 && entry.key !== '-') {
            topKey = entry.key;
            subKey = '';
            if (entry.value && KNOWN_TOP_KEYS.has(topKey)) {
                result[topKey] = entry.value;
            } else if (!entry.value && KNOWN_TOP_KEYS.has(topKey)) {
                if (!result[topKey]) result[topKey] = {};
            }
        } else if (entry.indent > 0 && topKey && KNOWN_TOP_KEYS.has(topKey)) {
            const container = result[topKey];
            if (typeof container === 'object' && container !== null && !Array.isArray(container)) {
                if (entry.indent <= 4 && entry.key !== '-') {
                    subKey = entry.key;
                    (container as Record<string, unknown>)[subKey] = entry.value ?? {};
                }
            }
        }
    }

    // For paths, do a pass extracting path items
    const pathsBlock = extractYamlBlock(yaml, 'paths');
    if (pathsBlock) {
        result['paths'] = parseYamlPaths(pathsBlock);
    }

    return result;
}

function extractYamlBlock(yaml: string, key: string): string | null {
    const lines = yaml.split('\n');
    let start = -1;
    let baseIndent = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const trimmed = line.trimStart();
        if (trimmed.startsWith(`${key}:`) && line.search(/\S/) === 0) {
            start = i + 1;
            baseIndent = 0;
            break;
        }
    }

    if (start < 0) return null;

    const block: string[] = [];
    for (let i = start; i < lines.length; i++) {
        const line = lines[i] ?? '';
        if (line.trim() === '') {
            block.push(line);
            continue;
        }
        const indent = line.search(/\S/);
        if (indent <= baseIndent && line.trimStart().match(/^\w.*:/) && baseIndent === 0) {
            // Determine the base indent from first non-empty line
            if (block.length === 0) {
                baseIndent = indent;
            } else {
                break; // Back to top level — done with this block
            }
        }
        block.push(line);
    }

    return block.join('\n');
}

function parseYamlPaths(pathsYaml: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const lines = pathsYaml.split('\n');
    const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

    let currentPath = '';
    let currentMethod = '';
    let currentOp: Record<string, unknown> = {};
    let currentPathObj: Record<string, unknown> = {};

    function flush() {
        if (currentPath && currentMethod && Object.keys(currentOp).length > 0) {
            currentPathObj[currentMethod] = currentOp;
        }
    }

    for (const line of lines) {
        if (line.trim() === '') continue;
        const indent = line.search(/\S/);
        const content = line.trimStart();

        // Path entry (indent 2)
        if (indent <= 2 && content.startsWith('/') && content.endsWith(':')) {
            flush();
            if (currentPath) result[currentPath] = currentPathObj;
            currentPath = content.slice(0, -1);
            currentPathObj = {};
            currentMethod = '';
            currentOp = {};
            continue;
        }

        // HTTP method (indent 4)
        if (indent === 4 || indent === 2) {
            const methMatch = content.match(/^(\w+):\s*$/);
            if (methMatch && methods.has(methMatch[1] ?? '')) {
                flush();
                currentMethod = methMatch[1] ?? '';
                currentOp = {};
                continue;
            }
        }

        // Operation fields (indent 6+)
        if (currentMethod && indent >= 4) {
            const colonIdx = content.indexOf(':');
            if (colonIdx > 0) {
                const k = content.slice(0, colonIdx).trim();
                const v = content.slice(colonIdx + 1).trim();
                if (v) currentOp[k] = v;
            }
        }
    }

    flush();
    if (currentPath) result[currentPath] = currentPathObj;

    return result;
}

function generateApiDocMarkdown(info: OpenApiInfo, endpoints: OpenApiEndpoint[]): string {
    const lines: string[] = [];
    const now = new Date().toISOString().split('T')[0];

    lines.push(`# ${info.title} API Reference`);
    if (info.version) lines.push(`\n**Version:** ${info.version}`);
    if (info.baseUrl) lines.push(`**Base URL:** \`${info.baseUrl}\``);
    lines.push(`\n_Generated: ${now}_`);
    if (info.description) {
        lines.push(`\n## Overview\n\n${info.description}`);
    }
    lines.push('');

    if (endpoints.length === 0) {
        lines.push('_No endpoints found in spec._');
        return lines.join('\n');
    }

    // Group by tag
    const groups = new Map<string, OpenApiEndpoint[]>();
    for (const ep of endpoints) {
        const tag = ep.tags[0] ?? 'Uncategorized';
        if (!groups.has(tag)) groups.set(tag, []);
        groups.get(tag)!.push(ep);
    }

    for (const [tag, eps] of groups) {
        lines.push(`## ${tag}\n`);
        for (const ep of eps) {
            lines.push(`### \`${ep.method} ${ep.path}\``);
            if (ep.summary) lines.push(`\n${ep.summary}`);
            if (ep.description && ep.description !== ep.summary) {
                lines.push(`\n${ep.description}`);
            }

            if (ep.parameters.length > 0) {
                lines.push('\n**Parameters:**\n');
                lines.push('| Name | In | Required | Description |');
                lines.push('|------|----|----------|-------------|');
                for (const p of ep.parameters) {
                    lines.push(`| \`${p.name}\` | ${p.in} | ${p.required ? 'Yes' : 'No'} | ${p.description} |`);
                }
            }

            if (ep.requestBodyDescription) {
                lines.push(`\n**Request Body:** ${ep.requestBodyDescription}`);
            }

            if (ep.responses.length > 0) {
                lines.push('\n**Responses:**\n');
                lines.push('| Status | Description |');
                lines.push('|--------|-------------|');
                for (const r of ep.responses) {
                    lines.push(`| \`${r.code}\` | ${r.description} |`);
                }
            }

            lines.push('');
        }
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// JSDoc / TSDoc extractor
// ---------------------------------------------------------------------------

type ExtractedSymbol = {
    name: string;
    kind: 'function' | 'class' | 'interface' | 'type' | 'const' | 'method' | 'property';
    signature: string;
    description: string;
    params: Array<{ name: string; type: string; description: string }>;
    returns: string;
    examples: string[];
    tags: Record<string, string>;
};

function extractDocSymbols(source: string, filePath: string): ExtractedSymbol[] {
    const symbols: ExtractedSymbol[] = [];
    const lines = source.split('\n');

    const jsdocBlockRe = /\/\*\*([\s\S]*?)\*\//g;
    let match: RegExpExecArray | null;

    while ((match = jsdocBlockRe.exec(source)) !== null) {
        const block = match[1] ?? '';
        const blockEnd = match.index + match[0].length;

        // Find the code line that follows the JSDoc block
        const afterBlock = source.slice(blockEnd).trimStart();
        const firstLine = afterBlock.split('\n')[0] ?? '';

        const symbol = parseJsDocBlock(block, firstLine, filePath);
        if (symbol) symbols.push(symbol);
    }

    // Also grab exported symbols without doc comments
    const exportRe = /^export\s+(async\s+)?function\s+(\w+)|^export\s+(abstract\s+)?class\s+(\w+)|^export\s+interface\s+(\w+)|^export\s+type\s+(\w+)\s*=/gm;
    while ((match = exportRe.exec(source)) !== null) {
        const name = match[2] ?? match[4] ?? match[5] ?? match[6];
        if (!name) continue;
        // Skip if already captured by JSDoc scan
        if (symbols.some((s) => s.name === name)) continue;

        const lineContent = match[0].trim();
        let kind: ExtractedSymbol['kind'] = 'function';
        if (lineContent.includes(' class ')) kind = 'class';
        else if (lineContent.includes(' interface ')) kind = 'interface';
        else if (lineContent.includes(' type ')) kind = 'type';

        // Get file line number for context
        const lineNo = source.slice(0, match.index).split('\n').length;
        const contextLine = lines[lineNo] ?? '';

        symbols.push({
            name,
            kind,
            signature: lineContent.slice(0, 120),
            description: '',
            params: [],
            returns: '',
            examples: [],
            tags: {},
        });

        void contextLine; // suppress unused warning
    }

    return symbols;
}

function parseJsDocBlock(
    block: string,
    followingLine: string,
    _filePath: string,
): ExtractedSymbol | null {
    // Extract name from following line
    const nameMatch =
        followingLine.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/) ??
        followingLine.match(/(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/) ??
        followingLine.match(/(?:export\s+)?interface\s+(\w+)/) ??
        followingLine.match(/(?:export\s+)?type\s+(\w+)\s*=/) ??
        followingLine.match(/(?:export\s+)?const\s+(\w+)\s*=/) ??
        followingLine.match(/(?:async\s+)?(\w+)\s*\(/);

    if (!nameMatch) return null;
    const name = nameMatch[1];
    if (!name) return null;

    // Determine kind
    let kind: ExtractedSymbol['kind'] = 'function';
    if (followingLine.includes(' class ')) kind = 'class';
    else if (followingLine.includes(' interface ')) kind = 'interface';
    else if (followingLine.includes(' type ') && followingLine.includes('=')) kind = 'type';
    else if (followingLine.includes('const ') && !followingLine.includes('function')) kind = 'const';

    // Parse block lines
    const rawLines = block.split('\n').map((l) => l.replace(/^\s*\*\s?/, '').trim());

    const descLines: string[] = [];
    const params: Array<{ name: string; type: string; description: string }> = [];
    let returns = '';
    const examples: string[] = [];
    const tags: Record<string, string> = {};
    let inExample = false;
    const exampleLines: string[] = [];

    for (const line of rawLines) {
        if (line.startsWith('@param')) {
            const m = line.match(/@param\s+(?:\{([^}]*)\}\s+)?(\S+)\s*(.*)/);
            if (m) params.push({ type: m[1] ?? '', name: m[2] ?? '', description: m[3] ?? '' });
        } else if (line.startsWith('@returns') || line.startsWith('@return')) {
            returns = line.replace(/^@returns?\s*/, '');
        } else if (line.startsWith('@example')) {
            inExample = true;
        } else if (inExample) {
            if (line.startsWith('@')) {
                if (exampleLines.length > 0) examples.push(exampleLines.join('\n'));
                exampleLines.length = 0;
                inExample = false;
            } else {
                exampleLines.push(line);
            }
        } else if (line.startsWith('@')) {
            const tagMatch = line.match(/@(\w+)\s*(.*)/);
            if (tagMatch) tags[tagMatch[1] ?? ''] = tagMatch[2] ?? '';
        } else if (!inExample) {
            descLines.push(line);
        }
    }

    if (exampleLines.length > 0) examples.push(exampleLines.join('\n'));

    return {
        name,
        kind,
        signature: followingLine.split('{')[0]?.trim().slice(0, 120) ?? followingLine.slice(0, 120),
        description: descLines.filter(Boolean).join(' '),
        params,
        returns,
        examples,
        tags,
    };
}

function generateCodeDocMarkdown(
    sourceFiles: Array<{ path: string; symbols: ExtractedSymbol[] }>,
): string {
    const lines: string[] = [];
    const now = new Date().toISOString().split('T')[0];

    lines.push('# API Documentation');
    lines.push(`\n_Generated from source: ${now}_\n`);

    for (const { path: filePath, symbols } of sourceFiles) {
        if (symbols.length === 0) continue;
        lines.push(`## \`${filePath}\`\n`);

        for (const sym of symbols) {
            lines.push(`### ${sym.name}`);
            lines.push(`\n**Kind:** ${sym.kind}`);
            if (sym.signature) {
                lines.push(`\n\`\`\`typescript\n${sym.signature}\n\`\`\``);
            }
            if (sym.description) {
                lines.push(`\n${sym.description}`);
            }
            if (sym.params.length > 0) {
                lines.push('\n**Parameters:**\n');
                lines.push('| Parameter | Type | Description |');
                lines.push('|-----------|------|-------------|');
                for (const p of sym.params) {
                    const typeFmt = p.type ? `\`${p.type}\`` : '';
                    lines.push(`| \`${p.name}\` | ${typeFmt} | ${p.description} |`);
                }
            }
            if (sym.returns) {
                lines.push(`\n**Returns:** ${sym.returns}`);
            }
            if (sym.examples.length > 0) {
                lines.push('\n**Examples:**');
                for (const ex of sym.examples) {
                    lines.push(`\n\`\`\`typescript\n${ex}\n\`\`\``);
                }
            }
            lines.push('');
        }
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Release notes builder
// ---------------------------------------------------------------------------

type CommitEntry = {
    hash: string;
    shortHash: string;
    subject: string;
    authorName: string;
    date: string;
};

type ConventionalCommitType =
    | 'feat'
    | 'fix'
    | 'perf'
    | 'refactor'
    | 'docs'
    | 'test'
    | 'chore'
    | 'ci'
    | 'build'
    | 'style'
    | 'revert'
    | 'breaking'
    | 'other';

const COMMIT_TYPE_LABELS: Record<ConventionalCommitType, string> = {
    feat: 'New Features',
    fix: 'Bug Fixes',
    perf: 'Performance Improvements',
    refactor: 'Refactoring',
    docs: 'Documentation',
    test: 'Tests',
    chore: 'Chores',
    ci: 'CI / Build',
    build: 'CI / Build',
    style: 'Style',
    revert: 'Reverts',
    breaking: 'Breaking Changes',
    other: 'Other Changes',
};

function classifyCommit(subject: string): ConventionalCommitType {
    const lower = subject.toLowerCase();
    if (lower.includes('breaking change') || subject.includes('!:')) return 'breaking';
    if (lower.startsWith('feat') || lower.startsWith('feature')) return 'feat';
    if (lower.startsWith('fix') || lower.startsWith('bug')) return 'fix';
    if (lower.startsWith('perf')) return 'perf';
    if (lower.startsWith('refactor')) return 'refactor';
    if (lower.startsWith('docs') || lower.startsWith('doc')) return 'docs';
    if (lower.startsWith('test')) return 'test';
    if (lower.startsWith('chore')) return 'chore';
    if (lower.startsWith('ci')) return 'ci';
    if (lower.startsWith('build')) return 'build';
    if (lower.startsWith('style')) return 'style';
    if (lower.startsWith('revert')) return 'revert';
    return 'other';
}

function parseGitLogOutput(output: string): CommitEntry[] {
    return output
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const parts = line.split('|');
            return {
                hash: parts[0] ?? '',
                shortHash: parts[1] ?? '',
                subject: parts[2] ?? '',
                authorName: parts[3] ?? '',
                date: parts[4]?.slice(0, 10) ?? '',
            };
        });
}

function buildReleaseNotesMarkdown(
    commits: CommitEntry[],
    options: { projectName?: string; version?: string; fromRef?: string; toRef?: string },
): string {
    const lines: string[] = [];
    const version = options.version ?? 'Unreleased';
    const projectName = options.projectName ?? '';
    const now = new Date().toISOString().split('T')[0];

    const title = projectName ? `# ${projectName} Release Notes — ${version}` : `# Release Notes — ${version}`;
    lines.push(title);
    lines.push(`\n**Date:** ${now}`);
    if (options.fromRef || options.toRef) {
        const range = [options.fromRef, options.toRef].filter(Boolean).join(' → ');
        lines.push(`**Range:** ${range}`);
    }
    lines.push('');

    if (commits.length === 0) {
        lines.push('_No commits found in the specified range._');
        return lines.join('\n');
    }

    // Group commits by type, excluding types with no commits
    const groups = new Map<ConventionalCommitType, CommitEntry[]>();
    const typeOrder: ConventionalCommitType[] = [
        'breaking', 'feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'ci', 'build', 'chore', 'style', 'revert', 'other',
    ];

    for (const commit of commits) {
        const type = classifyCommit(commit.subject);
        if (!groups.has(type)) groups.set(type, []);
        groups.get(type)!.push(commit);
    }

    for (const type of typeOrder) {
        const entries = groups.get(type);
        if (!entries || entries.length === 0) continue;

        lines.push(`## ${COMMIT_TYPE_LABELS[type]}\n`);
        for (const c of entries) {
            // Strip type prefix from subject for cleaner display
            const cleanSubject = c.subject
                .replace(/^(feat|fix|perf|refactor|docs|test|chore|ci|build|style|revert)(\([^)]*\))?!?:\s*/i, '')
                .trim();
            lines.push(`- ${cleanSubject} (\`${c.shortHash}\`)`);
        }
        lines.push('');
    }

    lines.push(`---\n_${commits.length} commit(s) included._`);
    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Style checker
// ---------------------------------------------------------------------------

export type StyleViolation = {
    line: number;
    col: number;
    rule: string;
    text: string;
    suggestion: string;
};

export type StyleFileResult = {
    filePath: string;
    violations: StyleViolation[];
};

const PASSIVE_VOICE_PATTERNS = [
    /\b(is|are|was|were|be|been|being)\s+(created|written|done|used|made|given|shown|found|sent|set|taken|known|seen|called|considered|expected|required|provided|performed|executed|generated|updated|returned|handled|processed|triggered)\b/gi,
];

const JARGON_PATTERNS: Array<{ re: RegExp; suggestion: string }> = [
    { re: /\bleverag(e|es|ing|ed)\b/gi, suggestion: 'Use "use" or "take advantage of"' },
    { re: /\butiliz(e|es|ing|ed)\b/gi, suggestion: 'Use "use"' },
    { re: /\baforementioned\b/gi, suggestion: 'Use "the above" or refer explicitly' },
    { re: /\bsynerg(y|ies|ize|izing)\b/gi, suggestion: 'Be specific about the benefit' },
    { re: /\bholis?tic(ally)?\b/gi, suggestion: 'Be specific about the scope' },
    { re: /\bparadigm shift\b/gi, suggestion: 'Describe the specific change' },
    { re: /\bseamless(ly)?\b/gi, suggestion: 'Describe the actual UX in concrete terms' },
    { re: /\brobust\b/gi, suggestion: 'Describe the specific reliability property' },
    { re: /\bbest.in.class\b/gi, suggestion: 'Use a measurable claim' },
    { re: /\bworld.class\b/gi, suggestion: 'Use a measurable claim' },
    { re: /\bcutting.edge\b/gi, suggestion: 'Describe the specific technology or advantage' },
    { re: /\bgame.changer?\b/gi, suggestion: 'Describe the specific impact' },
    { re: /\bvery\s+\w/gi, suggestion: 'Use a stronger, more precise adjective' },
    { re: /\bquite\s+\w/gi, suggestion: 'Remove "quite" or use a precise descriptor' },
    { re: /\brather\s+\w/gi, suggestion: 'Remove "rather" or use a precise descriptor' },
];

const INCLUSIVE_LANGUAGE_PATTERNS: Array<{ re: RegExp; rule: string; suggestion: string }> = [
    { re: /\bblacklist(?:ed|ing|s)?\b/gi, rule: 'inclusive-no-blacklist', suggestion: 'Use "denylist" or "blocklist"' },
    { re: /\bwhitelist(?:ed|ing|s)?\b/gi, rule: 'inclusive-no-whitelist', suggestion: 'Use "allowlist"' },
    { re: /\b(?:master[\s/-]slave|slave[\s/-]master)\b/gi, rule: 'inclusive-no-master-slave', suggestion: 'Use "primary/replica" or "leader/follower"' },
    { re: /\bmaster\s+branch\b/gi, rule: 'inclusive-no-master-branch', suggestion: 'Use "main branch"' },
    { re: /\bsanity[\s-]check\b/gi, rule: 'inclusive-no-sanity-check', suggestion: 'Use "quick check" or "validity check"' },
    { re: /\bdummy\s+(?:data|value|variable|record|entry)\b/gi, rule: 'inclusive-no-dummy', suggestion: 'Use "placeholder", "sample", or "stub"' },
];

const SENTENCE_MAX_WORDS = 35;
const LONG_PARAGRAPH_LINES = 8;

function checkProseStyle(content: string, filePath: string): StyleFileResult {
    const lines = content.split('\n');
    const violations: StyleViolation[] = [];
    let inCodeBlock = false;
    let consecutiveParagraphLines = 0;

    for (let lineNo = 0; lineNo < lines.length; lineNo++) {
        const line = lines[lineNo] ?? '';
        const humanLineNo = lineNo + 1;

        // Track fenced code blocks — skip style checks inside them
        if (line.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            consecutiveParagraphLines = 0;
            continue;
        }
        if (inCodeBlock) continue;

        // Skip headings, empty lines, and block-level markdown
        if (line.startsWith('#') || line.trim() === '' || line.startsWith('|') || line.startsWith('>')) {
            consecutiveParagraphLines = 0;
            continue;
        }

        // Count paragraph lines
        consecutiveParagraphLines++;
        if (consecutiveParagraphLines > LONG_PARAGRAPH_LINES) {
            violations.push({
                line: humanLineNo,
                col: 1,
                rule: 'long-paragraph',
                text: line.slice(0, 60),
                suggestion: 'Consider breaking this paragraph into shorter sections.',
            });
            consecutiveParagraphLines = 0; // reset after flagging
        }

        // Sentence length
        const sentences = line.split(/[.!?]+/).filter((s) => s.trim().length > 10);
        for (const sentence of sentences) {
            const wordCount = sentence.trim().split(/\s+/).length;
            if (wordCount > SENTENCE_MAX_WORDS) {
                violations.push({
                    line: humanLineNo,
                    col: 1,
                    rule: 'sentence-too-long',
                    text: sentence.trim().slice(0, 80),
                    suggestion: `Sentence is ${wordCount} words. Consider splitting at ${SENTENCE_MAX_WORDS} words or fewer.`,
                });
            }
        }

        // Passive voice
        for (const re of PASSIVE_VOICE_PATTERNS) {
            re.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = re.exec(line)) !== null) {
                violations.push({
                    line: humanLineNo,
                    col: m.index + 1,
                    rule: 'passive-voice',
                    text: m[0],
                    suggestion: 'Consider rewriting in active voice.',
                });
            }
        }

        // Jargon
        for (const { re, suggestion } of JARGON_PATTERNS) {
            re.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = re.exec(line)) !== null) {
                violations.push({
                    line: humanLineNo,
                    col: m.index + 1,
                    rule: 'jargon',
                    text: m[0],
                    suggestion,
                });
            }
        }

        // Inclusive language
        for (const { re, rule, suggestion } of INCLUSIVE_LANGUAGE_PATTERNS) {
            re.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = re.exec(line)) !== null) {
                violations.push({
                    line: humanLineNo,
                    col: m.index + 1,
                    rule,
                    text: m[0],
                    suggestion,
                });
            }
        }

        // Double space
        if (/\w {2,}\w/.test(line)) {
            violations.push({
                line: humanLineNo,
                col: 1,
                rule: 'double-space',
                text: line.slice(0, 60),
                suggestion: 'Replace double spaces with a single space.',
            });
        }

        // Trailing whitespace
        if (line !== line.trimEnd()) {
            violations.push({
                line: humanLineNo,
                col: line.trimEnd().length + 1,
                rule: 'trailing-whitespace',
                text: '(trailing spaces)',
                suggestion: 'Remove trailing whitespace.',
            });
        }
    }

    // Heading hierarchy (check for skipped levels: H1 → H3 without H2)
    let lastHeadingLevel = 0;
    for (let lineNo = 0; lineNo < lines.length; lineNo++) {
        const line = lines[lineNo] ?? '';
        const headingMatch = line.match(/^(#{1,6})\s/);
        if (headingMatch) {
            const level = headingMatch[1]!.length;
            if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
                violations.push({
                    line: lineNo + 1,
                    col: 1,
                    rule: 'heading-hierarchy',
                    text: line.slice(0, 60),
                    suggestion: `Heading jumps from H${lastHeadingLevel} to H${level}. Consider adding an intermediate heading.`,
                });
            }
            lastHeadingLevel = level;
        }
    }

    // Images without alt text
    const imgRe = /!\[\]\(/g;
    for (let lineNo = 0; lineNo < lines.length; lineNo++) {
        const line = lines[lineNo] ?? '';
        imgRe.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = imgRe.exec(line)) !== null) {
            violations.push({
                line: lineNo + 1,
                col: m.index + 1,
                rule: 'missing-alt-text',
                text: line.slice(m.index, m.index + 40),
                suggestion: 'Add descriptive alt text: ![description](url)',
            });
        }
    }

    return { filePath, violations };
}

// ---------------------------------------------------------------------------
// run_git_log helper (pure function — takes git log output as string)
// ---------------------------------------------------------------------------

function buildGitLogArgs(options: {
    limit?: number;
    fromRef?: string;
    toRef?: string;
    since?: string;
}): string[] {
    const limit = typeof options.limit === 'number' && options.limit > 0
        ? Math.min(options.limit, 500)
        : 100;

    const args = [
        'git', 'log',
        '--pretty=format:%H|%h|%s|%an|%ae|%ai',
        `--max-count=${limit}`,
        '--no-merges',
    ];

    if (options.since) args.push(`--since=${options.since}`);

    if (options.fromRef && options.toRef) {
        args.push(`${options.fromRef}..${options.toRef}`);
    } else if (options.fromRef) {
        args.push(`${options.fromRef}..HEAD`);
    }

    return args;
}

// ---------------------------------------------------------------------------
// Payload parsers for new action types
// ---------------------------------------------------------------------------

function parseManualSections(raw: unknown): ManualSection[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((s) => {
        if (typeof s !== 'object' || s === null) return [];
        const obj = s as Record<string, unknown>;
        return [{
            id: String(obj['id'] ?? ''),
            title: String(obj['title'] ?? ''),
            level: ([1, 2, 3].includes(Number(obj['level'])) ? Number(obj['level']) : 1) as ManualSection['level'],
            content: String(obj['content'] ?? ''),
            subsections: parseManualSections(obj['subsections']),
        }];
    });
}

function parseFaqEntries(raw: unknown): FaqEntry[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((e) => {
        if (typeof e !== 'object' || e === null) return [];
        const obj = e as Record<string, unknown>;
        return [{
            id: String(obj['id'] ?? ''),
            question: String(obj['question'] ?? ''),
            answer: String(obj['answer'] ?? ''),
            category: String(obj['category'] ?? 'Other'),
            tags: Array.isArray(obj['tags']) ? (obj['tags'] as unknown[]).filter((t): t is string => typeof t === 'string') : undefined,
            relatedQuestions: Array.isArray(obj['related_questions'])
                ? (obj['related_questions'] as unknown[]).filter((r): r is string => typeof r === 'string')
                : undefined,
        }];
    });
}

function parseTutorial(obj: Record<string, unknown>): Tutorial {
    const rawLevel = String(obj['level'] ?? 'beginner');
    const level: TutorialLevel = (['beginner', 'intermediate', 'advanced'].includes(rawLevel) ? rawLevel : 'beginner') as TutorialLevel;
    return {
        title: String(obj['title'] ?? ''),
        level,
        estimatedTime: String(obj['estimated_time'] ?? obj['estimatedTime'] ?? '15 minutes'),
        learningObjectives: Array.isArray(obj['learning_objectives'])
            ? (obj['learning_objectives'] as unknown[]).filter((o): o is string => typeof o === 'string')
            : [],
        prerequisites: Array.isArray(obj['prerequisites'])
            ? (obj['prerequisites'] as unknown[]).filter((p): p is string => typeof p === 'string')
            : [],
        steps: Array.isArray(obj['steps']) ? obj['steps'].flatMap((s) => {
            if (typeof s !== 'object' || s === null) return [];
            const st = s as Record<string, unknown>;
            const rawCode = typeof st['code'] === 'object' && st['code'] !== null ? st['code'] as Record<string, unknown> : null;
            return [{
                stepNumber: typeof st['step_number'] === 'number' ? st['step_number'] : typeof st['stepNumber'] === 'number' ? st['stepNumber'] : 1,
                title: String(st['title'] ?? ''),
                description: String(st['description'] ?? ''),
                code: rawCode ? { language: String(rawCode['language'] ?? 'bash'), content: String(rawCode['content'] ?? ''), filename: typeof rawCode['filename'] === 'string' ? rawCode['filename'] : undefined } : undefined,
                expectedOutput: typeof st['expected_output'] === 'string' ? st['expected_output'] : undefined,
                checkpoint: typeof st['checkpoint'] === 'string' ? st['checkpoint'] : undefined,
                troubleshooting: Array.isArray(st['troubleshooting']) ? (st['troubleshooting'] as unknown[]).filter((t): t is string => typeof t === 'string') : undefined,
            }];
        }) : [],
        nextSteps: Array.isArray(obj['next_steps'])
            ? (obj['next_steps'] as unknown[]).filter((n): n is string => typeof n === 'string')
            : undefined,
        product: typeof obj['product'] === 'string' ? obj['product'] : undefined,
    };
}

function parseTutorials(raw: unknown): Tutorial[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((t) => {
        if (typeof t !== 'object' || t === null) return [];
        return [parseTutorial(t as Record<string, unknown>)];
    });
}

function parseOnboardingFlow(raw: unknown): OnboardingFlow | null {
    if (typeof raw !== 'object' || raw === null) return null;
    const obj = raw as Record<string, unknown>;
    const rawRole = String(obj['role'] ?? 'end-user');
    const role: OnboardingRole = (['developer', 'admin', 'end-user'].includes(rawRole) ? rawRole : 'end-user') as OnboardingRole;
    const phases: OnboardingPhase[] = Array.isArray(obj['phases']) ? obj['phases'].flatMap((p) => {
        if (typeof p !== 'object' || p === null) return [];
        const ph = p as Record<string, unknown>;
        return [{
            phase: String(ph['phase'] ?? ''),
            goals: Array.isArray(ph['goals']) ? (ph['goals'] as unknown[]).filter((g): g is string => typeof g === 'string') : [],
            tasks: Array.isArray(ph['tasks']) ? ph['tasks'].flatMap((t) => {
                if (typeof t !== 'object' || t === null) return [];
                const tk = t as Record<string, unknown>;
                return [{
                    id: String(tk['id'] ?? ''),
                    title: String(tk['title'] ?? ''),
                    description: String(tk['description'] ?? ''),
                    estimatedTime: typeof tk['estimated_time'] === 'string' ? tk['estimated_time'] : undefined,
                    docLink: typeof tk['doc_link'] === 'string' ? tk['doc_link'] : undefined,
                    required: tk['required'] !== false,
                    completionCriteria: typeof tk['completion_criteria'] === 'string' ? tk['completion_criteria'] : undefined,
                    subtasks: Array.isArray(tk['subtasks']) ? (tk['subtasks'] as unknown[]).filter((s): s is string => typeof s === 'string') : undefined,
                } as OnboardingTask];
            }) : [],
        } as OnboardingPhase];
    }) : [];
    return {
        title: String(obj['title'] ?? 'Onboarding Guide'),
        role,
        product: String(obj['product'] ?? ''),
        welcome: typeof obj['welcome'] === 'string' ? obj['welcome'] : undefined,
        phases,
    };
}

function parseWhitepaperSections(raw: unknown): WhitepaperSection[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((s) => {
        if (typeof s !== 'object' || s === null) return [];
        const obj = s as Record<string, unknown>;
        return [{
            id: String(obj['id'] ?? ''),
            title: String(obj['title'] ?? ''),
            content: String(obj['content'] ?? ''),
            callouts: undefined,
            figures: undefined,
            subsections: Array.isArray(obj['subsections']) ? obj['subsections'].flatMap((sub) => {
                if (typeof sub !== 'object' || sub === null) return [];
                const s2 = sub as Record<string, unknown>;
                return [{ title: String(s2['title'] ?? ''), content: String(s2['content'] ?? '') }];
            }) : undefined,
        }];
    });
}

function buildSprintContextFromPayload(payload: Record<string, unknown>) {
    const sprintNumber = typeof payload['sprint_number'] === 'number' ? payload['sprint_number'] : undefined;
    const sprintGoal = typeof payload['sprint_goal'] === 'string' ? payload['sprint_goal'] : undefined;
    const daysRemaining = typeof payload['sprint_days_remaining'] === 'number' ? payload['sprint_days_remaining'] : undefined;
    const docsUpdatedThisSprint = typeof payload['docs_updated_this_sprint'] === 'number' ? payload['docs_updated_this_sprint'] : undefined;
    const docImpactStories = Array.isArray(payload['doc_impact_stories'])
        ? (payload['doc_impact_stories'] as unknown[]).filter((s): s is string => typeof s === 'string')
        : undefined;

    if (sprintNumber === undefined && sprintGoal === undefined && daysRemaining === undefined) return undefined;

    return { sprintNumber, sprintGoal, daysRemaining, docsUpdatedThisSprint, docImpactStories };
}

function parseUserStories(raw: unknown): UserStory[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((s) => {
        if (typeof s !== 'object' || s === null) return [];
        const obj = s as Record<string, unknown>;
        return [{
            id: String(obj['id'] ?? ''),
            title: String(obj['title'] ?? ''),
            asA: String(obj['as_a'] ?? obj['asA'] ?? ''),
            iWant: String(obj['i_want'] ?? obj['iWant'] ?? ''),
            soThat: String(obj['so_that'] ?? obj['soThat'] ?? ''),
            acceptanceCriteria: Array.isArray(obj['acceptance_criteria'])
                ? (obj['acceptance_criteria'] as unknown[]).filter((ac): ac is string => typeof ac === 'string')
                : [],
            points: typeof obj['points'] === 'number' ? obj['points'] : undefined,
            status: typeof obj['status'] === 'string' ? obj['status'] : undefined,
            docImpact: Array.isArray(obj['doc_impact'])
                ? (obj['doc_impact'] as unknown[]).filter((d): d is string => typeof d === 'string')
                : undefined,
        }];
    });
}

function parseRetroItems(raw: unknown): RetroItem[] {
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
        if (typeof item !== 'object' || item === null) return [];
        const obj = item as Record<string, unknown>;
        const category = String(obj['category'] ?? 'went-well') as RetroItem['category'];
        return [{
            category,
            text: String(obj['text'] ?? ''),
            owner: typeof obj['owner'] === 'string' ? obj['owner'] : undefined,
        }];
    });
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function handleTechnicalWriterAction(params: {
    actionType: TechnicalWriterActionType;
    tenantId: string;
    botId: string;
    taskId: string;
    payload: Record<string, unknown>;
    workspaceDir: string;
    /** Optional callback to run git or shell commands inside the workspace. */
    runCommand?: (
        args: string[],
        cwd: string,
        timeoutMs?: number,
    ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
    /**
     * Optional LLM call for prose generation.
     * When provided, content-generation actions use it to fill placeholder
     * text and enhance auto-generated prose with real, model-written copy.
     * Receives (userPrompt, systemPrompt?) and returns the generated text.
     * LLM failures are always non-fatal — the pure-function output is used
     * as the fallback.
     */
    callLlm?: LlmCallFn;
    /**
     * Optional browser page reader.
     * Provided by the executor from the existing Playwright/web-actions
     * infrastructure. Navigates to a URL and returns structured page content
     * (title, text, headings, optional tables and screenshot path).
     * Used by workspace_tw_product_crawl, workspace_tw_screenshot_doc, and
     * workspace_tw_doc_gap_scan (URL mode).
     * Returns null on navigation failure — the caller skips that URL gracefully.
     */
    browsePage?: BrowsePageFn;
    /**
     * Optional multi-step interaction runner.
     * Provided by the executor via a persistent Playwright page.
     * Used by workspace_tw_interact_product.
     */
    interactPage?: InteractPageFn;
    /** Optional — when provided, RAG context is fetched and injected into every LLM call. */
    gatewayBaseUrl?: string;
    serviceToken?: string;
    workspaceId?: string;
}): Promise<LocalWorkspaceResult> {
    const { actionType, taskId, payload, workspaceDir, runCommand, callLlm: rawCallLlm, browsePage, interactPage,
            gatewayBaseUrl, serviceToken, workspaceId } = params;
    const tenantId = String(params['tenantId'] ?? '');
    const botId = String(params['botId'] ?? '');

    // RAG pre-flight — wrap callLlm with prior docs, style guides, and TW lessons
    let callLlm = rawCallLlm;
    if (rawCallLlm && gatewayBaseUrl && serviceToken && workspaceId) {
        try {
            const { buildTechnicalWriterRagContext } = await import('./technical-writer-rag-retriever.js');
            const ragCtx = await buildTechnicalWriterRagContext(
                {
                    tenantId, botId,
                    docTitle: String(payload['title'] ?? payload['doc_title'] ?? actionType),
                    docDescription: String(payload['description'] ?? ''),
                    documentType: 'api_reference',
                },
                gatewayBaseUrl, serviceToken, workspaceId,
            );
            if (ragCtx.contextBlock) {
                callLlm = (prompt: string, sys?: string): Promise<string> =>
                    rawCallLlm(prompt, sys ? `${sys}\n\n${ragCtx.contextBlock}` : ragCtx.contextBlock);
            }
        } catch { /* non-fatal */ }
    }

    switch (actionType) {

        // ------------------------------------------------------------------
        // workspace_tw_doc_diff
        // Generate a documentation update from a git diff.
        //
        // payload:
        //   diff_text?    — pre-computed unified diff string
        //   ref1?         — git ref for diff start (e.g. HEAD~1, main)
        //   ref2?         — git ref for diff end (defaults to HEAD)
        //   doc_file_path — documentation file to update (relative to workspaceDir)
        //   doc_title?    — title for the generated section
        // ------------------------------------------------------------------
        case 'workspace_tw_doc_diff': {
            try {
                let diffText = typeof payload['diff_text'] === 'string' ? payload['diff_text'] : '';

                // If no diff text provided, compute it from git refs
                if (!diffText && runCommand) {
                    const ref1 = typeof payload['ref1'] === 'string' ? payload['ref1'].trim() : '';
                    const ref2 = typeof payload['ref2'] === 'string' ? payload['ref2'].trim() : '';
                    const diffArgs = ['git', 'diff'];
                    if (ref1 && ref2) diffArgs.push(`${ref1}..${ref2}`);
                    else if (ref1) diffArgs.push(`${ref1}..HEAD`);
                    else diffArgs.push('HEAD~1..HEAD');

                    const diffResult = await runCommand(diffArgs, workspaceDir, 30_000);
                    if (diffResult.exitCode !== 0) {
                        return { ok: false, output: '', errorOutput: `git diff failed: ${diffResult.stderr}` };
                    }
                    diffText = diffResult.stdout;
                }

                if (!diffText.trim()) {
                    return { ok: false, output: '', errorOutput: 'No diff text available. Provide diff_text or ref1/ref2 with a runCommand callback.' };
                }

                const changedFiles = parseUnifiedDiff(diffText);
                const docFilePathRaw = typeof payload['doc_file_path'] === 'string'
                    ? payload['doc_file_path'].trim()
                    : '';
                const docTitle = typeof payload['doc_title'] === 'string' && payload['doc_title'].trim()
                    ? payload['doc_title'].trim()
                    : 'Documentation Update';

                const existingContent = docFilePathRaw
                    ? await readDocFile(workspaceDir, docFilePathRaw)
                    : null;

                const docContent = buildDocUpdateFromDiff(changedFiles, existingContent, docTitle);

                // LLM enhancement: prepend a prose narrative summary of the changes.
                let finalDocContent = docContent;
                if (callLlm && changedFiles.length > 0) {
                    const extraContext =
                        typeof payload['context'] === 'string' ? payload['context'] : undefined;
                    const narrativePrompt = buildDocDiffNarrativePrompt(
                        changedFiles.map((f) => ({
                            file: f.filePath,
                            additions: f.additions,
                            deletions: f.deletions,
                            changed_symbols: f.changedSymbols,
                        })),
                        docTitle,
                        extraContext,
                    );
                    const narrativeSummary = await callLlmSafe(callLlm, narrativePrompt);
                    if (narrativeSummary) {
                        // Insert the LLM narrative before the raw diff breakdown.
                        const replaced = docContent.replace(
                            /\n## (Recent Changes|Change Summary)\n/,
                            `\n${narrativeSummary}\n\n## Change Details\n`,
                        );
                        finalDocContent = replaced !== docContent ? replaced : narrativeSummary + '\n\n' + docContent;
                    }
                }

                if (docFilePathRaw) {
                    await writeDocFile(workspaceDir, docFilePathRaw, finalDocContent);
                }

                return safeJson({
                    changed_files: changedFiles.map((f) => ({
                        file: f.filePath,
                        additions: f.additions,
                        deletions: f.deletions,
                        changed_symbols: f.changedSymbols,
                    })),
                    doc_content: finalDocContent,
                    written_to: docFilePathRaw || null,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_api_doc_openapi
        // Parse an OpenAPI/Swagger spec and generate markdown API reference.
        //
        // payload:
        //   spec_file_path   — path to .json / .yaml / .yml spec (relative to workspaceDir)
        //   spec_content?    — inline spec content (alternative to file path)
        //   output_path?     — where to write the generated markdown
        // ------------------------------------------------------------------
        case 'workspace_tw_api_doc_openapi': {
            try {
                let specContent = typeof payload['spec_content'] === 'string'
                    ? payload['spec_content']
                    : '';

                const specFilePathRaw = typeof payload['spec_file_path'] === 'string'
                    ? payload['spec_file_path'].trim()
                    : '';

                if (!specContent && specFilePathRaw) {
                    const fileContent = await readDocFile(workspaceDir, specFilePathRaw);
                    if (fileContent === null) {
                        return { ok: false, output: '', errorOutput: `Spec file not found: ${specFilePathRaw}` };
                    }
                    specContent = fileContent;
                }

                if (!specContent) {
                    return { ok: false, output: '', errorOutput: 'payload.spec_file_path or payload.spec_content is required.' };
                }

                const { info, endpoints } = parseOpenApiSpec(specContent);
                let markdown = generateApiDocMarkdown(info, endpoints);

                // LLM enhancement: fill in missing endpoint/parameter descriptions.
                if (callLlm && endpoints.length > 0) {
                    const enhanced = await callLlmSafe(
                        callLlm,
                        buildApiDocEnhancementPrompt(markdown, info.title),
                    );
                    if (enhanced) markdown = enhanced;
                }

                const outputPath = typeof payload['output_path'] === 'string'
                    ? payload['output_path'].trim()
                    : '';
                if (outputPath) {
                    await writeDocFile(workspaceDir, outputPath, markdown);
                }

                return safeJson({
                    api_title: info.title,
                    api_version: info.version,
                    endpoint_count: endpoints.length,
                    doc_content: markdown,
                    written_to: outputPath || null,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_api_doc_code
        // Extract JSDoc/TSDoc from source files and generate API docs.
        //
        // payload:
        //   source_files  — string path or array of paths (relative to workspaceDir)
        //   output_path?  — where to write the generated markdown
        // ------------------------------------------------------------------
        case 'workspace_tw_api_doc_code': {
            try {
                const rawFiles = payload['source_files'];
                const filePaths: string[] = Array.isArray(rawFiles)
                    ? rawFiles.filter((f): f is string => typeof f === 'string')
                    : typeof rawFiles === 'string'
                        ? [rawFiles]
                        : [];

                if (filePaths.length === 0) {
                    return { ok: false, output: '', errorOutput: 'payload.source_files (string or string[]) is required.' };
                }

                const sourceFiles: Array<{ path: string; symbols: ExtractedSymbol[] }> = [];

                for (const filePath of filePaths) {
                    const content = await readDocFile(workspaceDir, filePath);
                    if (content === null) {
                        // Skip missing files, don't abort
                        continue;
                    }
                    const symbols = extractDocSymbols(content, filePath);
                    sourceFiles.push({ path: filePath, symbols });
                }

                if (sourceFiles.length === 0) {
                    return { ok: false, output: '', errorOutput: 'No source files could be read.' };
                }

                let markdown = generateCodeDocMarkdown(sourceFiles);
                const symbolCount = sourceFiles.reduce((n, f) => n + f.symbols.length, 0);

                // LLM enhancement: write natural-language descriptions for undocumented symbols.
                if (callLlm && symbolCount > 0) {
                    const enhanced = await callLlmSafe(
                        callLlm,
                        buildCodeDocEnhancementPrompt(markdown, sourceFiles.map((f) => f.path)),
                    );
                    if (enhanced) markdown = enhanced;
                }

                const outputPath = typeof payload['output_path'] === 'string'
                    ? payload['output_path'].trim()
                    : '';
                if (outputPath) {
                    await writeDocFile(workspaceDir, outputPath, markdown);
                }

                return safeJson({
                    files_processed: sourceFiles.length,
                    symbol_count: symbolCount,
                    doc_content: markdown,
                    written_to: outputPath || null,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_release_notes
        // Generate structured release notes from git log.
        //
        // payload:
        //   from_ref?      — start git ref (e.g. v1.0.0, HEAD~20)
        //   to_ref?        — end git ref (defaults to HEAD)
        //   since?         — git --since date string (e.g. "2 weeks ago")
        //   limit?         — max commits to include (default 100)
        //   project_name?  — project name for the title
        //   version?       — release version string (e.g. "v1.2.0")
        //   output_path?   — where to write the generated markdown
        //   commits?       — pre-parsed commit list (skips git log call)
        // ------------------------------------------------------------------
        case 'workspace_tw_release_notes': {
            try {
                let commits: CommitEntry[] = [];

                const rawCommits = payload['commits'];
                if (Array.isArray(rawCommits) && rawCommits.length > 0) {
                    // Pre-parsed commits provided (e.g. from a prior git_log action)
                    const gitLogLines = rawCommits
                        .map((c) => {
                            if (typeof c === 'string') return c;
                            if (typeof c === 'object' && c !== null) {
                                const obj = c as Record<string, unknown>;
                                return [
                                    obj['hash'] ?? '',
                                    obj['short_hash'] ?? obj['shortHash'] ?? '',
                                    obj['subject'] ?? '',
                                    obj['author_name'] ?? obj['authorName'] ?? '',
                                    '',
                                    obj['date'] ?? '',
                                ].join('|');
                            }
                            return '';
                        })
                        .filter(Boolean)
                        .join('\n');
                    commits = parseGitLogOutput(gitLogLines);
                } else if (runCommand) {
                    const logArgs = buildGitLogArgs({
                        limit: typeof payload['limit'] === 'number' ? payload['limit'] : undefined,
                        fromRef: typeof payload['from_ref'] === 'string' ? payload['from_ref'] : undefined,
                        toRef: typeof payload['to_ref'] === 'string' ? payload['to_ref'] : undefined,
                        since: typeof payload['since'] === 'string' ? payload['since'] : undefined,
                    });
                    const logResult = await runCommand(logArgs, workspaceDir, 15_000);
                    if (logResult.exitCode !== 0) {
                        return { ok: false, output: '', errorOutput: `git log failed: ${logResult.stderr}` };
                    }
                    commits = parseGitLogOutput(logResult.stdout);
                } else {
                    return { ok: false, output: '', errorOutput: 'No commits provided and no runCommand callback available to run git log.' };
                }

                let notes = buildReleaseNotesMarkdown(commits, {
                    projectName: typeof payload['project_name'] === 'string' ? payload['project_name'] : undefined,
                    version: typeof payload['version'] === 'string' ? payload['version'] : undefined,
                    fromRef: typeof payload['from_ref'] === 'string' ? payload['from_ref'] : undefined,
                    toRef: typeof payload['to_ref'] === 'string' ? payload['to_ref'] : undefined,
                });

                // LLM enhancement: rewrite terse commit messages as user-facing change descriptions.
                if (callLlm && commits.length > 0) {
                    const enhanced = await callLlmSafe(
                        callLlm,
                        buildReleaseNotesEnhancementPrompt(notes),
                    );
                    if (enhanced) notes = enhanced;
                }

                const outputPath = typeof payload['output_path'] === 'string'
                    ? payload['output_path'].trim()
                    : '';
                if (outputPath) {
                    await writeDocFile(workspaceDir, outputPath, notes);
                }

                return safeJson({
                    commit_count: commits.length,
                    doc_content: notes,
                    written_to: outputPath || null,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_style_check
        // Run a prose style linter over documentation files.
        //
        // payload:
        //   file_paths    — string path or array of paths (relative to workspaceDir)
        //   rules?        — array of rule names to enable (default: all)
        //                   options: sentence-too-long, passive-voice, jargon,
        //                            trailing-whitespace, heading-hierarchy,
        //                            missing-alt-text, long-paragraph
        // ------------------------------------------------------------------
        case 'workspace_tw_style_check': {
            try {
                const rawPaths = payload['file_paths'];
                const filePaths: string[] = Array.isArray(rawPaths)
                    ? rawPaths.filter((f): f is string => typeof f === 'string')
                    : typeof rawPaths === 'string'
                        ? [rawPaths]
                        : [];

                if (filePaths.length === 0) {
                    return { ok: false, output: '', errorOutput: 'payload.file_paths (string or string[]) is required.' };
                }

                const enabledRules = Array.isArray(payload['rules'])
                    ? new Set(payload['rules'].filter((r): r is string => typeof r === 'string'))
                    : null; // null = all rules enabled

                const fileResults: StyleFileResult[] = [];
                let totalViolations = 0;

                for (const filePath of filePaths) {
                    const content = await readDocFile(workspaceDir, filePath);
                    if (content === null) continue;

                    let result = checkProseStyle(content, filePath);

                    // Filter to enabled rules if a subset was requested
                    if (enabledRules) {
                        result = {
                            ...result,
                            violations: result.violations.filter((v) => enabledRules.has(v.rule)),
                        };
                    }

                    fileResults.push(result);
                    totalViolations += result.violations.length;
                }

                return safeJson({
                    total_violations: totalViolations,
                    files_checked: fileResults.length,
                    files: fileResults.map((f) => ({
                        file_path: f.filePath,
                        violation_count: f.violations.length,
                        violations: f.violations,
                    })),
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_standup_report
        // Generate a structured standup summary from episodic memory.
        //
        // payload:
        //   recent_memory?            — array of memory string records
        //   bot_name?                 — display name of the TW agent
        //   team_name?                — display name of the team
        //   sprint_number?            — current sprint number
        //   sprint_goal?              — sprint goal text
        //   sprint_days_remaining?    — calendar days left in the sprint
        //   docs_updated_this_sprint? — count of doc sections updated
        //   doc_impact_stories?       — string[] of story IDs with doc impact
        // ------------------------------------------------------------------
        case 'workspace_tw_standup_report': {
            const rawMemory = Array.isArray(payload['recent_memory'])
                ? (payload['recent_memory'] as unknown[]).filter((x): x is string => typeof x === 'string')
                : [];

            const botName = typeof payload['bot_name'] === 'string' && payload['bot_name'].trim()
                ? payload['bot_name'].trim()
                : 'Technical Writer';
            const teamName = typeof payload['team_name'] === 'string' && payload['team_name'].trim()
                ? payload['team_name'].trim()
                : 'the team';

            const sprintContext = buildSprintContextFromPayload(payload);

            const summary = buildTechnicalWriterStandupSummary(rawMemory, { botName, teamName, sprintContext });

            return safeJson({ summary, bot_name: botName, team_name: teamName });
        }

        // ------------------------------------------------------------------
        // workspace_tw_sme_interview
        // Generate an SME interview plan from source code or a feature
        // description, or synthesise SME responses into a doc brief.
        //
        // payload:
        //   mode             — 'plan_from_code' | 'plan_from_description' | 'synthesise'
        //   source_file?     — path to source file (mode: plan_from_code)
        //   source_content?  — inline source code (alternative to source_file)
        //   feature_summary? — short context for the interview plan
        //   description?     — feature description text (mode: plan_from_description)
        //   title?           — title for the plan or brief
        //   questions?       — array of SmeInterviewQuestion (mode: synthesise)
        //   responses?       — array of SmeInterviewResponse (mode: synthesise)
        //   output_path?     — path to write the markdown output
        // ------------------------------------------------------------------
        case 'workspace_tw_sme_interview': {
            try {
                const mode = typeof payload['mode'] === 'string' ? payload['mode'] : 'plan_from_description';
                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';

                if (mode === 'plan_from_code') {
                    let source = typeof payload['source_content'] === 'string' ? payload['source_content'] : '';
                    const sourceFilePath = typeof payload['source_file'] === 'string' ? payload['source_file'].trim() : '';

                    if (!source && sourceFilePath) {
                        const content = await readDocFile(workspaceDir, sourceFilePath);
                        if (content === null) {
                            return { ok: false, output: '', errorOutput: `Source file not found: ${sourceFilePath}` };
                        }
                        source = content;
                    }

                    if (!source) {
                        return { ok: false, output: '', errorOutput: 'payload.source_file or payload.source_content is required for mode plan_from_code.' };
                    }

                    const featureSummary = typeof payload['feature_summary'] === 'string' ? payload['feature_summary'] : '';
                    const plan = buildInterviewPlanFromCode(source, sourceFilePath || 'source', featureSummary);

                    if (outputPath) await writeDocFile(workspaceDir, outputPath, plan.markdownOutput);

                    return safeJson({
                        mode: 'plan_from_code',
                        title: plan.title,
                        question_count: plan.questions.length,
                        markdown_output: plan.markdownOutput,
                        written_to: outputPath || null,
                    });
                }

                if (mode === 'synthesise') {
                    const rawQuestions = Array.isArray(payload['questions']) ? payload['questions'] : [];
                    const rawResponses = Array.isArray(payload['responses']) ? payload['responses'] : [];

                    const questions = rawQuestions.filter(
                        (q): q is SmeInterviewQuestion =>
                            typeof q === 'object' && q !== null &&
                            typeof (q as Record<string, unknown>)['id'] === 'string' &&
                            typeof (q as Record<string, unknown>)['question'] === 'string',
                    );
                    const responses = rawResponses.filter(
                        (r): r is SmeInterviewResponse =>
                            typeof r === 'object' && r !== null &&
                            typeof (r as Record<string, unknown>)['questionId'] === 'string' &&
                            typeof (r as Record<string, unknown>)['answer'] === 'string',
                    );

                    if (questions.length === 0) {
                        return { ok: false, output: '', errorOutput: 'payload.questions array is required for mode synthesise.' };
                    }

                    const brief = synthesiseDocBrief(questions, responses);

                    // LLM enhancement: write a professional doc brief from the Q&A responses.
                    let finalMarkdownBrief = brief.markdownBrief;
                    if (callLlm && responses.length > 0) {
                        const qaList = questions
                            .map((q) => {
                                const resp = responses.find((r) => r.questionId === q.id);
                                return {
                                    question: q.question,
                                    answer: resp?.answer ?? '',
                                    category: q.category,
                                };
                            })
                            .filter((qa) => qa.answer.trim().length > 0);
                        if (qaList.length > 0) {
                            const briefTitle =
                                typeof payload['title'] === 'string' && payload['title'].trim()
                                    ? payload['title'].trim()
                                    : brief.title;
                            const llmBrief = await callLlmSafe(
                                callLlm,
                                buildSmeBriefProsePrompt(qaList, briefTitle),
                            );
                            if (llmBrief) finalMarkdownBrief = llmBrief;
                        }
                    }

                    if (outputPath) await writeDocFile(workspaceDir, outputPath, finalMarkdownBrief);

                    return safeJson({
                        mode: 'synthesise',
                        title: brief.title,
                        key_points: brief.keyPoints.length,
                        open_questions: brief.openQuestions.length,
                        markdown_brief: finalMarkdownBrief,
                        written_to: outputPath || null,
                    });
                }

                // Default: plan_from_description
                const description = typeof payload['description'] === 'string' ? payload['description'] : '';
                const title = typeof payload['title'] === 'string' ? payload['title'] : '';

                if (!description && !title) {
                    return { ok: false, output: '', errorOutput: 'payload.description or payload.title is required for mode plan_from_description.' };
                }

                const plan = buildInterviewPlanFromDescription(description || title, title);

                if (outputPath) await writeDocFile(workspaceDir, outputPath, plan.markdownOutput);

                return safeJson({
                    mode: 'plan_from_description',
                    title: plan.title,
                    question_count: plan.questions.length,
                    markdown_output: plan.markdownOutput,
                    written_to: outputPath || null,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_manual
        // Generate a user manual — either from pre-written sections or as a
        // skeleton template driven by a feature list.
        //
        // payload:
        //   mode          — 'from_sections' | 'template' (default: template)
        //   metadata      — ManualMetadata object (title, product, version, audience, …)
        //   features?     — string[] of feature names (mode: template)
        //   sections?     — ManualSection[] (mode: from_sections)
        //   output_path?  — where to write the generated markdown
        // ------------------------------------------------------------------
        case 'workspace_tw_manual': {
            try {
                const mode = typeof payload['mode'] === 'string' ? payload['mode'] : 'template';
                const rawMeta = payload['metadata'] as Record<string, unknown> | undefined;
                if (!rawMeta || typeof rawMeta !== 'object') {
                    return { ok: false, output: '', errorOutput: 'payload.metadata (ManualMetadata) is required.' };
                }

                const meta: ManualMetadata = {
                    title: String(rawMeta['title'] ?? 'User Manual'),
                    product: String(rawMeta['product'] ?? ''),
                    version: String(rawMeta['version'] ?? '1.0'),
                    audience: (['end-user', 'developer', 'admin', 'all'].includes(String(rawMeta['audience']))
                        ? String(rawMeta['audience'])
                        : 'all') as ManualAudience,
                    authors: Array.isArray(rawMeta['authors'])
                        ? (rawMeta['authors'] as unknown[]).filter((a): a is string => typeof a === 'string')
                        : [],
                    date: typeof rawMeta['date'] === 'string' ? rawMeta['date'] : undefined,
                    description: typeof rawMeta['description'] === 'string' ? rawMeta['description'] : undefined,
                    confidentiality: typeof rawMeta['confidentiality'] === 'string'
                        ? rawMeta['confidentiality'] as ManualMetadata['confidentiality']
                        : 'public',
                };

                let markdown: string;
                if (mode === 'from_sections') {
                    const sections = parseManualSections(payload['sections']);
                    if (sections.length === 0) {
                        return { ok: false, output: '', errorOutput: 'payload.sections (ManualSection[]) is required for mode from_sections.' };
                    }
                    markdown = buildManualFromSections(meta, sections);
                } else {
                    const features = Array.isArray(payload['features'])
                        ? (payload['features'] as unknown[]).filter((f): f is string => typeof f === 'string')
                        : [];
                    markdown = buildManualTemplate(meta, features);
                }

                // LLM enhancement: fill in all _[Add: ...]_ placeholder sections with real prose.
                if (callLlm && hasPlaceholders(markdown)) {
                    const enhanced = await callLlmSafe(
                        callLlm,
                        buildManualProsePrompt(markdown, {
                            title: meta.title,
                            product: meta.product,
                            audience: meta.audience,
                        }),
                    );
                    if (enhanced) markdown = enhanced;
                }

                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';
                if (outputPath) await writeDocFile(workspaceDir, outputPath, markdown);

                return safeJson({ mode, title: meta.title, written_to: outputPath || null, doc_content: markdown });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_faq
        // Build an FAQ document from Q&A pairs, generate a skeleton by
        // category, or extract Q&A candidates from raw support text.
        //
        // payload:
        //   mode           — 'from_entries' | 'template' | 'extract' (default: template)
        //   title?         — FAQ document title
        //   product?       — product name
        //   categories?    — string[] of category names
        //   entries?       — FaqEntry[] (mode: from_entries)
        //   raw_text?      — unstructured support text (mode: extract)
        //   output_path?   — where to write the generated markdown
        // ------------------------------------------------------------------
        case 'workspace_tw_faq': {
            try {
                const mode = typeof payload['mode'] === 'string' ? payload['mode'] : 'template';
                const title = typeof payload['title'] === 'string' ? payload['title'] : 'Frequently Asked Questions';
                const product = typeof payload['product'] === 'string' ? payload['product'] : '';
                const categories = Array.isArray(payload['categories'])
                    ? (payload['categories'] as unknown[]).filter((c): c is string => typeof c === 'string')
                    : DEFAULT_FAQ_CATEGORIES;
                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';

                let markdown: string;
                let extractedCount: number | undefined;

                if (mode === 'from_entries') {
                    const entries = parseFaqEntries(payload['entries']);
                    if (entries.length === 0) {
                        return { ok: false, output: '', errorOutput: 'payload.entries (FaqEntry[]) is required for mode from_entries.' };
                    }
                    const intro = typeof payload['intro'] === 'string' ? payload['intro'] : undefined;
                    markdown = buildFaqMarkdown({ title, product, categories, entries, intro });
                } else if (mode === 'extract') {
                    const rawText = typeof payload['raw_text'] === 'string' ? payload['raw_text'] : '';
                    if (!rawText) {
                        return { ok: false, output: '', errorOutput: 'payload.raw_text is required for mode extract.' };
                    }
                    const defaultCategory = typeof payload['default_category'] === 'string'
                        ? payload['default_category']
                        : 'Troubleshooting';
                    const result = extractFaqFromSupportText(rawText, defaultCategory);
                    const categorized = categorizeFaqEntries(result.candidates);
                    extractedCount = categorized.length;
                    markdown = buildFaqMarkdown({ title, product, categories: [...new Set(categorized.map((e) => e.category))], entries: categorized });
                } else {
                    markdown = buildFaqTemplate(title, product, categories);
                }

                // LLM enhancement: generate real Q&A entries to replace placeholder text.
                if (callLlm && hasPlaceholders(markdown)) {
                    const enhanced = await callLlmSafe(
                        callLlm,
                        buildFaqProsePrompt(markdown, { title, product, categories }),
                    );
                    if (enhanced) markdown = enhanced;
                }

                if (outputPath) await writeDocFile(workspaceDir, outputPath, markdown);

                return safeJson({
                    mode,
                    title,
                    extracted_count: extractedCount,
                    written_to: outputPath || null,
                    doc_content: markdown,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_tutorial
        // Generate a step-by-step tutorial or a series of tutorials.
        //
        // payload:
        //   mode           — 'single' | 'series' | 'template' (default: template)
        //   tutorial?      — Tutorial object (mode: single)
        //   series?        — TutorialSeries object (mode: series)
        //   title?         — tutorial title (mode: template)
        //   level?         — 'beginner' | 'intermediate' | 'advanced' (mode: template)
        //   step_count?    — number of steps (mode: template, default: 5)
        //   product?       — product name (mode: template)
        //   output_path?   — where to write the generated markdown
        // ------------------------------------------------------------------
        case 'workspace_tw_tutorial': {
            try {
                const mode = typeof payload['mode'] === 'string' ? payload['mode'] : 'template';
                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';
                let markdown: string;

                if (mode === 'series') {
                    const rawSeries = payload['series'] as Record<string, unknown> | undefined;
                    if (!rawSeries) return { ok: false, output: '', errorOutput: 'payload.series (TutorialSeries) is required for mode series.' };
                    const series: TutorialSeries = {
                        title: String(rawSeries['title'] ?? 'Tutorial Series'),
                        description: String(rawSeries['description'] ?? ''),
                        tutorials: parseTutorials(rawSeries['tutorials']),
                    };
                    if (series.tutorials.length === 0) {
                        return { ok: false, output: '', errorOutput: 'payload.series.tutorials must be a non-empty array.' };
                    }
                    markdown = buildTutorialSeries(series);
                } else if (mode === 'single') {
                    const rawTutorial = payload['tutorial'] as Record<string, unknown> | undefined;
                    if (!rawTutorial) return { ok: false, output: '', errorOutput: 'payload.tutorial (Tutorial) is required for mode single.' };
                    const tutorial = parseTutorial(rawTutorial);
                    markdown = buildTutorialMarkdown(tutorial);
                } else {
                    const title = typeof payload['title'] === 'string' ? payload['title'] : '_[Tutorial Title]_';
                    const rawLevel = typeof payload['level'] === 'string' ? payload['level'] : 'beginner';
                    const level: TutorialLevel = (['beginner', 'intermediate', 'advanced'].includes(rawLevel) ? rawLevel : 'beginner') as TutorialLevel;
                    const stepCount = typeof payload['step_count'] === 'number' ? payload['step_count'] : 5;
                    const product = typeof payload['product'] === 'string' ? payload['product'] : undefined;
                    const tmpl = buildTutorialTemplate(title, level, stepCount, product);
                    markdown = buildTutorialMarkdown(tmpl);
                }

                // LLM enhancement: fill in step descriptions, expected outputs, and troubleshooting tips.
                if (callLlm && hasPlaceholders(markdown)) {
                    const tutTitle = typeof payload['title'] === 'string' ? payload['title'] : 'Tutorial';
                    const tutLevel = typeof payload['level'] === 'string' ? payload['level'] : 'beginner';
                    const tutProduct = typeof payload['product'] === 'string' ? payload['product'] : undefined;
                    const enhanced = await callLlmSafe(
                        callLlm,
                        buildTutorialProsePrompt(markdown, { title: tutTitle, level: tutLevel, product: tutProduct }),
                    );
                    if (enhanced) markdown = enhanced;
                }

                if (outputPath) await writeDocFile(workspaceDir, outputPath, markdown);
                return safeJson({ mode, written_to: outputPath || null, doc_content: markdown });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_onboarding
        // Generate a role-specific onboarding guide.
        //
        // payload:
        //   mode           — 'from_flow' | 'template' | 'checklist' (default: template)
        //   product        — product name
        //   role?          — 'developer' | 'admin' | 'end-user' (default: end-user)
        //   flow?          — OnboardingFlow object (mode: from_flow or checklist)
        //   output_path?   — where to write the generated markdown
        // ------------------------------------------------------------------
        case 'workspace_tw_onboarding': {
            try {
                const mode = typeof payload['mode'] === 'string' ? payload['mode'] : 'template';
                const product = typeof payload['product'] === 'string' ? payload['product'] : 'the product';
                const rawRole = typeof payload['role'] === 'string' ? payload['role'] : 'end-user';
                const role: OnboardingRole = (['developer', 'admin', 'end-user'].includes(rawRole) ? rawRole : 'end-user') as OnboardingRole;
                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';

                let markdown: string;

                if (mode === 'checklist') {
                    const flow = parseOnboardingFlow(payload['flow']) ?? buildOnboardingTemplate(product, role);
                    markdown = buildOnboardingChecklist(flow);
                } else if (mode === 'from_flow') {
                    const flow = parseOnboardingFlow(payload['flow']);
                    if (!flow) return { ok: false, output: '', errorOutput: 'payload.flow (OnboardingFlow) is required for mode from_flow.' };
                    markdown = buildOnboardingFlowMarkdown(flow);
                } else {
                    const flow = buildOnboardingTemplate(product, role);
                    markdown = buildOnboardingFlowMarkdown(flow);
                }

                // LLM enhancement: write real task descriptions and welcome copy to replace placeholders.
                if (callLlm && hasPlaceholders(markdown)) {
                    const enhanced = await callLlmSafe(
                        callLlm,
                        buildOnboardingProsePrompt(markdown, { product, role }),
                    );
                    if (enhanced) markdown = enhanced;
                }

                if (outputPath) await writeDocFile(workspaceDir, outputPath, markdown);
                return safeJson({ mode, role, product, written_to: outputPath || null, doc_content: markdown });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_whitepaper
        // Generate a white paper document.
        //
        // payload:
        //   mode          — 'from_sections' | 'template' (default: template)
        //   metadata      — WhitepaperMetadata object
        //   sections?     — WhitepaperSection[] (mode: from_sections)
        //   output_path?  — where to write the generated markdown
        // ------------------------------------------------------------------
        case 'workspace_tw_whitepaper': {
            try {
                const mode = typeof payload['mode'] === 'string' ? payload['mode'] : 'template';
                const rawMeta = payload['metadata'] as Record<string, unknown> | undefined;
                if (!rawMeta || typeof rawMeta !== 'object') {
                    return { ok: false, output: '', errorOutput: 'payload.metadata (WhitepaperMetadata) is required.' };
                }

                const meta: WhitepaperMetadata = {
                    title: String(rawMeta['title'] ?? 'White Paper'),
                    subtitle: typeof rawMeta['subtitle'] === 'string' ? rawMeta['subtitle'] : undefined,
                    authors: Array.isArray(rawMeta['authors'])
                        ? (rawMeta['authors'] as unknown[]).filter((a): a is string => typeof a === 'string')
                        : [String(rawMeta['author'] ?? 'Author')],
                    organization: String(rawMeta['organization'] ?? rawMeta['organisation'] ?? ''),
                    date: typeof rawMeta['date'] === 'string' ? rawMeta['date'] : undefined,
                    abstract: String(rawMeta['abstract'] ?? '_[Add abstract]_'),
                    keywords: Array.isArray(rawMeta['keywords'])
                        ? (rawMeta['keywords'] as unknown[]).filter((k): k is string => typeof k === 'string')
                        : undefined,
                    version: typeof rawMeta['version'] === 'string' ? rawMeta['version'] : undefined,
                    confidentiality: typeof rawMeta['confidentiality'] === 'string'
                        ? rawMeta['confidentiality'] as WhitepaperMetadata['confidentiality']
                        : 'public',
                };

                let markdown: string;
                if (mode === 'from_sections') {
                    const sections = parseWhitepaperSections(payload['sections']);
                    if (sections.length === 0) {
                        return { ok: false, output: '', errorOutput: 'payload.sections (WhitepaperSection[]) is required for mode from_sections.' };
                    }
                    markdown = buildWhitepaperFromSections(meta, sections);
                } else {
                    markdown = buildWhitepaperTemplate(meta);
                }

                // LLM enhancement: write substantive content for every placeholder section.
                if (callLlm && hasPlaceholders(markdown)) {
                    const enhanced = await callLlmSafe(
                        callLlm,
                        buildWhitepaperProsePrompt(markdown, {
                            title: meta.title,
                            organization: meta.organization || undefined,
                            abstract: rawMeta['abstract'] as string | undefined,
                        }),
                    );
                    if (enhanced) markdown = enhanced;
                }

                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';
                if (outputPath) await writeDocFile(workspaceDir, outputPath, markdown);

                return safeJson({ mode, title: meta.title, written_to: outputPath || null, doc_content: markdown });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_endpoint_verify
        // Read-only verification of HTTP endpoints before documenting them.
        // Only GET and HEAD methods are allowed — no write operations.
        //
        // payload:
        //   endpoints     — string URL or string[] of URLs
        //   method?       — 'GET' | 'HEAD' (default: HEAD)
        //   headers?      — Record<string, string> of request headers
        //   timeout_ms?   — per-request timeout (default 10000, max 30000)
        //   sample_body?  — true to capture first 500 chars of response body (GET only)
        // ------------------------------------------------------------------
        case 'workspace_tw_endpoint_verify': {
            try {
                if (!runCommand) {
                    return { ok: false, output: '', errorOutput: 'workspace_tw_endpoint_verify requires a runCommand callback.' };
                }

                const rawEndpoints = payload['endpoints'];
                const urls: string[] = Array.isArray(rawEndpoints)
                    ? (rawEndpoints as unknown[]).filter((u): u is string => typeof u === 'string')
                    : typeof rawEndpoints === 'string'
                        ? [rawEndpoints]
                        : [];

                if (urls.length === 0) {
                    return { ok: false, output: '', errorOutput: 'payload.endpoints (string or string[]) is required.' };
                }

                const rawMethod = typeof payload['method'] === 'string' ? payload['method'].toUpperCase() : 'HEAD';
                const method = rawMethod === 'GET' ? 'GET' : 'HEAD';
                const sampleBody = method === 'GET' && payload['sample_body'] === true;
                const timeoutMs = Math.min(
                    typeof payload['timeout_ms'] === 'number' ? payload['timeout_ms'] : 10_000,
                    30_000,
                );
                const headers = typeof payload['headers'] === 'object' && payload['headers'] !== null
                    ? payload['headers'] as Record<string, string>
                    : {};

                const results: Array<{
                    url: string;
                    status: number | null;
                    contentType: string;
                    responseTimeMs: number | null;
                    sampleBody?: string;
                    error?: string;
                    documented: boolean;
                }> = [];

                for (const url of urls.slice(0, 20)) { // cap at 20 to prevent abuse
                    // Validate URL scheme — only allow http/https
                    if (!/^https?:\/\//i.test(url)) {
                        results.push({ url, status: null, contentType: '', responseTimeMs: null, error: 'Only http:// and https:// URLs are allowed.', documented: false });
                        continue;
                    }

                    const headerArgs = Object.entries(headers).flatMap(([k, v]) => ['-H', `${k}: ${v}`]);
                    const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
                    const bodyFlag = sampleBody ? [] : ['-o', nullDevice];
                    const args = [
                        'curl', '-s', '-X', method,
                        '-w', '%{http_code}|%{content_type}|%{time_total}',
                        ...headerArgs,
                        ...bodyFlag,
                        '--max-time', String(Math.ceil(timeoutMs / 1000)),
                        url,
                    ];

                    const r = await runCommand(args, workspaceDir, timeoutMs + 2_000);

                    if (r.exitCode !== 0 && !r.stdout.trim()) {
                        results.push({ url, status: null, contentType: '', responseTimeMs: null, error: r.stderr.slice(0, 200), documented: false });
                        continue;
                    }

                    // stdout format when no body: "200|application/json|0.123"
                    // stdout format with body: "<body>200|application/json|0.123"
                    const lastLine = r.stdout.trim().split('\n').pop() ?? r.stdout.trim();
                    const [statusStr, contentType = '', timeStr = ''] = lastLine.split('|');
                    const status = parseInt(statusStr ?? '', 10);
                    const responseTimeMs = parseFloat(timeStr) * 1000;

                    let sampleBodyText: string | undefined;
                    if (sampleBody && r.stdout.length > lastLine.length) {
                        sampleBodyText = r.stdout.slice(0, r.stdout.length - lastLine.length).slice(0, 500);
                    }

                    results.push({
                        url,
                        status: isNaN(status) ? null : status,
                        contentType: contentType.split(';')[0]?.trim() ?? '',
                        responseTimeMs: isNaN(responseTimeMs) ? null : Math.round(responseTimeMs),
                        sampleBody: sampleBodyText,
                        documented: !isNaN(status) && status < 500,
                    });
                }

                const successCount = results.filter((r) => r.documented).length;
                const failCount = results.length - successCount;

                // Produce a Markdown verification report
                const reportLines = [
                    '# Endpoint Verification Report',
                    '',
                    `**Method:** ${method}  `,
                    `**Checked:** ${results.length} endpoint(s)  `,
                    `**Reachable:** ${successCount}  `,
                    `**Unreachable / error:** ${failCount}`,
                    '',
                    '| URL | Status | Content-Type | Time (ms) | Safe to Document? |',
                    '|-----|--------|--------------|-----------|-------------------|',
                    ...results.map((r) => {
                        const statusBadge = r.status !== null ? String(r.status) : '—';
                        const safe = r.documented ? '✅ Yes' : '❌ No';
                        return `| \`${r.url}\` | ${statusBadge} | ${r.contentType || '—'} | ${r.responseTimeMs ?? '—'} | ${safe} |`;
                    }),
                ];

                return safeJson({
                    results,
                    success_count: successCount,
                    fail_count: failCount,
                    verification_report: reportLines.join('\n'),
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_audience_rewrite
        // Analyse or adapt document content for a target audience persona.
        //
        // payload:
        //   mode            — 'analyze' | 'adapt' | 'compare' (default: analyze)
        //   file_path?      — doc file to read (relative to workspaceDir)
        //   content?        — inline doc content (alternative to file_path)
        //   target_audience — 'end-user' | 'developer' | 'admin'
        //   vocabulary_map? — Record<string,string> custom substitution overrides
        //   output_path?    — write adapted content here (mode: adapt only)
        // ------------------------------------------------------------------
        case 'workspace_tw_audience_rewrite': {
            try {
                const mode = typeof payload['mode'] === 'string' ? payload['mode'] : 'analyze';
                let content = typeof payload['content'] === 'string' ? payload['content'] : '';
                const filePath = typeof payload['file_path'] === 'string' ? payload['file_path'].trim() : '';

                if (!content && filePath) {
                    const fc = await readDocFile(workspaceDir, filePath);
                    if (fc === null) return { ok: false, output: '', errorOutput: `File not found: ${filePath}` };
                    content = fc;
                }
                if (!content) return { ok: false, output: '', errorOutput: 'payload.content or payload.file_path is required.' };

                const rawPersona = typeof payload['target_audience'] === 'string' ? payload['target_audience'] : 'end-user';
                const persona: AudiencePersona = (['end-user', 'developer', 'admin'].includes(rawPersona) ? rawPersona : 'end-user') as AudiencePersona;
                const customVocabMap = typeof payload['vocabulary_map'] === 'object' && payload['vocabulary_map'] !== null
                    ? payload['vocabulary_map'] as Record<string, string>
                    : {};
                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';

                if (mode === 'compare') {
                    const comparisons = compareAudiences(content);
                    const reportLines = ['# Audience Comparison\n'];
                    for (const [p, analysis] of Object.entries(comparisons)) {
                        reportLines.push(`## ${p}: ${analysis.matchScore}/100 — ${analysis.matchLabel}`);
                    }
                    return safeJson({ mode, comparisons: Object.fromEntries(Object.entries(comparisons).map(([p, a]) => [p, { score: a.matchScore, label: a.matchLabel, mismatch_count: a.mismatches.length }])), report: reportLines.join('\n') });
                }

                if (mode === 'adapt') {
                    const adaptation = adaptForAudience(content, persona, customVocabMap);
                    if (outputPath) await writeDocFile(workspaceDir, outputPath, adaptation.adapted);
                    return safeJson({
                        mode,
                        persona,
                        substitution_count: adaptation.substitutionCount,
                        manual_rewrite_needed: adaptation.manualRewriteNeeded.length,
                        adapted_content: adaptation.adapted,
                        written_to: outputPath || null,
                        report: adaptation.markdownReport,
                    });
                }

                // Default: analyze
                const analysis = analyzeAudienceMatch(content, persona);
                return safeJson({
                    mode,
                    persona,
                    match_score: analysis.matchScore,
                    match_label: analysis.matchLabel,
                    mismatch_count: analysis.mismatches.length,
                    missing_sections: analysis.missingSections,
                    inappropriate_sections: analysis.inappropriateSections,
                    stats: analysis.stats,
                    report: analysis.markdownReport,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_feedback_analysis
        // Analyse user feedback to surface doc gaps and recommended actions.
        //
        // payload:
        //   feedback_items    — array of { id, text, source?, doc_section?, date? }
        //   doc_sections?     — string[] of known section names for coverage check
        //   output_path?      — where to write the Markdown report
        // ------------------------------------------------------------------
        case 'workspace_tw_feedback_analysis': {
            try {
                const rawItems = payload['feedback_items'];
                if (!Array.isArray(rawItems) || rawItems.length === 0) {
                    return { ok: false, output: '', errorOutput: 'payload.feedback_items (array) is required.' };
                }

                const items: FeedbackItem[] = rawItems.flatMap((item) => {
                    if (typeof item !== 'object' || item === null) return [];
                    const obj = item as Record<string, unknown>;
                    return [{
                        id: String(obj['id'] ?? ''),
                        text: String(obj['text'] ?? ''),
                        source: (typeof obj['source'] === 'string' ? obj['source'] : 'other') as FeedbackSource,
                        docSection: typeof obj['doc_section'] === 'string' ? obj['doc_section'] : undefined,
                        date: typeof obj['date'] === 'string' ? obj['date'] : undefined,
                        tags: Array.isArray(obj['tags']) ? (obj['tags'] as unknown[]).filter((t): t is string => typeof t === 'string') : undefined,
                    }];
                });

                const knownSections = Array.isArray(payload['doc_sections'])
                    ? (payload['doc_sections'] as unknown[]).filter((s): s is string => typeof s === 'string')
                    : [];

                const result = analyzeFeedback(items, knownSections);
                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';
                if (outputPath) await writeDocFile(workspaceDir, outputPath, result.markdownReport);

                return safeJson({
                    total_items: result.totalItems,
                    sentiment_breakdown: result.sentimentBreakdown,
                    top_gaps: result.topGaps.slice(0, 5).map((g) => ({ section: g.section, priority: g.priority, recommendation: g.recommendation })),
                    written_to: outputPath || null,
                    report: result.markdownReport,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_nav_audit
        // Audit doc tree for orphans, broken links, duplicate titles, structure.
        //
        // payload:
        //   file_paths        — string[] of doc file paths (relative to workspaceDir)
        //   required_sections? — string[] override for section completeness check
        //   output_path?      — where to write the Markdown report
        // ------------------------------------------------------------------
        case 'workspace_tw_nav_audit': {
            try {
                const rawPaths = payload['file_paths'];
                const filePaths: string[] = Array.isArray(rawPaths)
                    ? (rawPaths as unknown[]).filter((p): p is string => typeof p === 'string')
                    : typeof rawPaths === 'string' ? [rawPaths] : [];

                if (filePaths.length === 0) return { ok: false, output: '', errorOutput: 'payload.file_paths is required.' };

                const files: NavDocFile[] = [];
                for (const fp of filePaths) {
                    const content = await readDocFile(workspaceDir, fp);
                    if (content !== null) files.push({ path: fp, content });
                }

                const requiredSections = Array.isArray(payload['required_sections'])
                    ? (payload['required_sections'] as unknown[]).filter((s): s is string => typeof s === 'string')
                    : undefined;

                const result = auditNavigation(files, requiredSections);
                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';
                if (outputPath) await writeDocFile(workspaceDir, outputPath, result.markdownReport);

                return safeJson({
                    health_score: result.healthScore,
                    health_label: result.healthLabel,
                    total_files: result.totalFiles,
                    total_issues: result.issues.length,
                    orphaned_pages: result.orphanedPages.length,
                    broken_links: result.brokenLinks.length,
                    duplicate_titles: result.duplicateTitles.length,
                    toc: result.markdownToc,
                    written_to: outputPath || null,
                    report: result.markdownReport,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_localization
        // Track translation status, find stale/missing translations, export strings.
        //
        // payload:
        //   mode              — 'status' | 'export' | 'report' (default: status)
        //   manifest          — LocalizationManifest object
        //   source_files?     — array of { path, last_modified, char_count } (mode: status/report)
        //   translations?     — Record<locale, [{path, locale, last_modified}]> (mode: status/report)
        //   export_file?      — source file path to extract strings from (mode: export)
        //   export_content?   — inline content alternative (mode: export)
        //   string_prefix?    — prefix for generated string IDs (mode: export)
        //   output_path?      — where to write the output
        // ------------------------------------------------------------------
        case 'workspace_tw_localization': {
            try {
                const mode = typeof payload['mode'] === 'string' ? payload['mode'] : 'status';
                const rawManifest = payload['manifest'] as Record<string, unknown> | undefined;
                if (!rawManifest) return { ok: false, output: '', errorOutput: 'payload.manifest (LocalizationManifest) is required.' };

                const manifest: LocalizationManifest = {
                    sourceLocale: String(rawManifest['source_locale'] ?? 'en'),
                    targetLocales: Array.isArray(rawManifest['target_locales'])
                        ? (rawManifest['target_locales'] as unknown[]).filter((l): l is string => typeof l === 'string')
                        : [],
                    localeDirs: typeof rawManifest['locale_dirs'] === 'object' && rawManifest['locale_dirs'] !== null
                        ? rawManifest['locale_dirs'] as Record<string, string>
                        : {},
                };
                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';

                if (mode === 'export') {
                    let content = typeof payload['export_content'] === 'string' ? payload['export_content'] : '';
                    const exportFile = typeof payload['export_file'] === 'string' ? payload['export_file'].trim() : '';
                    if (!content && exportFile) {
                        const fc = await readDocFile(workspaceDir, exportFile);
                        if (fc === null) return { ok: false, output: '', errorOutput: `File not found: ${exportFile}` };
                        content = fc;
                    }
                    if (!content) return { ok: false, output: '', errorOutput: 'payload.export_file or payload.export_content required for mode export.' };

                    const exported = generateStringExport(exportFile || 'source', content, manifest.sourceLocale);
                    if (outputPath) await writeDocFile(workspaceDir, outputPath, exported.jsonExport);
                    return safeJson({ mode, string_count: exported.strings.length, json_export: exported.jsonExport, markdown_table: exported.markdownTable, written_to: outputPath || null });
                }

                // status or report
                const rawSources = Array.isArray(payload['source_files']) ? payload['source_files'] : [];
                const sourceFiles: SourceFileInfo[] = rawSources.flatMap((s) => {
                    if (typeof s !== 'object' || s === null) return [];
                    const obj = s as Record<string, unknown>;
                    return [{ path: String(obj['path'] ?? ''), lastModified: String(obj['last_modified'] ?? obj['lastModified'] ?? ''), charCount: typeof obj['char_count'] === 'number' ? obj['char_count'] : 0 }];
                });

                const rawTrans = payload['translations'] as Record<string, unknown> | undefined ?? {};
                const translations: Record<string, TranslationFileInfo[]> = {};
                for (const [locale, files] of Object.entries(rawTrans)) {
                    if (!Array.isArray(files)) continue;
                    translations[locale] = files.flatMap((f) => {
                        if (typeof f !== 'object' || f === null) return [];
                        const obj = f as Record<string, unknown>;
                        return [{ path: String(obj['path'] ?? ''), locale, lastModified: typeof obj['last_modified'] === 'string' ? obj['last_modified'] : null }];
                    });
                }

                // If no translation data provided, try to infer from git log via runCommand
                if (Object.keys(translations).length === 0 && sourceFiles.length > 0 && runCommand) {
                    for (const locale of manifest.targetLocales) {
                        translations[locale] = [];
                        const dir = manifest.localeDirs[locale] ?? `docs/${locale}/`;
                        for (const sf of sourceFiles) {
                            const translationPath = dir + sf.path;
                            const logResult = await runCommand(['git', 'log', '--format=%ai -- %s', '-1', '--', translationPath], workspaceDir, 10_000);
                            const lastMod = parseGitLastModified(logResult.stdout);
                            translations[locale].push({ path: translationPath, locale, lastModified: lastMod });
                        }
                    }
                }

                const statuses = buildLocalizationStatus(manifest, sourceFiles, translations);
                const report = buildLocalizationReport(manifest, statuses);

                if (outputPath) await writeDocFile(workspaceDir, outputPath, report.markdownReport);

                const urgentCount = statuses.filter((s) => s.status === 'stale' || s.status === 'missing').length;
                return safeJson({ mode, total_pairs: statuses.length, urgent: urgentCount, per_locale: report.summary.perLocale, written_to: outputPath || null, report: report.markdownReport });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_doc_audit
        // Full lifecycle audit: staleness, coverage, quality, broken links.
        //
        // payload:
        //   file_paths          — string[] of doc file paths (relative to workspaceDir)
        //   feature_list?       — string[] of features to check coverage
        //   required_sections?  — string[] section names every doc must have
        //   staleness_days?     — days threshold for stale flag (default: 180)
        //   use_git_dates?      — true to fetch last-modified dates from git log
        //   code_changes?       — [{file_path, last_changed}] for code-changed checks
        //   output_path?        — where to write the Markdown report
        // ------------------------------------------------------------------
        case 'workspace_tw_doc_audit': {
            try {
                const rawPaths = payload['file_paths'];
                const filePaths: string[] = Array.isArray(rawPaths)
                    ? (rawPaths as unknown[]).filter((p): p is string => typeof p === 'string')
                    : typeof rawPaths === 'string' ? [rawPaths] : [];

                if (filePaths.length === 0) return { ok: false, output: '', errorOutput: 'payload.file_paths is required.' };

                const useGitDates = payload['use_git_dates'] === true && !!runCommand;

                const auditFiles: AuditDocFile[] = [];
                for (const fp of filePaths) {
                    const content = await readDocFile(workspaceDir, fp);
                    if (content === null) continue;
                    let lastModified: string | undefined;
                    if (useGitDates) {
                        const logResult = await runCommand!(['git', 'log', '--format=%ai', '-1', '--', fp], workspaceDir, 10_000);
                        const dateMatch = logResult.stdout.trim().match(/^(\d{4}-\d{2}-\d{2})/);
                        if (dateMatch) lastModified = dateMatch[1];
                    }
                    auditFiles.push({ path: fp, content, lastModified });
                }

                const featureList = Array.isArray(payload['feature_list'])
                    ? (payload['feature_list'] as unknown[]).filter((f): f is string => typeof f === 'string')
                    : [];
                const requiredSections = Array.isArray(payload['required_sections'])
                    ? (payload['required_sections'] as unknown[]).filter((s): s is string => typeof s === 'string')
                    : undefined;
                const stalenessThresholdDays = typeof payload['staleness_days'] === 'number' ? payload['staleness_days'] : 180;

                const rawCodeChanges = Array.isArray(payload['code_changes']) ? payload['code_changes'] : [];
                const codeChanges: CodeChangeRecord[] = rawCodeChanges.flatMap((c) => {
                    if (typeof c !== 'object' || c === null) return [];
                    const obj = c as Record<string, unknown>;
                    return [{ filePath: String(obj['file_path'] ?? obj['filePath'] ?? ''), lastChanged: String(obj['last_changed'] ?? obj['lastChanged'] ?? '') }];
                });

                const options: DocAuditOptions = { featureList, requiredSections, stalenessThresholdDays, codeChanges };
                const result = auditDocLifecycle(auditFiles, options);

                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';
                if (outputPath) await writeDocFile(workspaceDir, outputPath, result.markdownReport);

                return safeJson({
                    overall_health_score: result.overallHealthScore,
                    health_label: result.healthLabel,
                    total_files: result.totalFiles,
                    total_actions: result.prioritisedActions.length,
                    feature_coverage: result.featureCoverage.map((f) => ({ feature: f.feature, status: f.status })),
                    top_actions: result.prioritisedActions.slice(0, 5),
                    written_to: outputPath || null,
                    report: result.markdownReport,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_product_crawl
        // Navigate to real product pages and extract structured content as
        // documentation source material. Closes the "writes from payload
        // data, not from actual product knowledge" gap.
        //
        // payload:
        //   urls              — string URL or string[] of pages to crawl (max 10)
        //   credentials?      — { url, username, password } for authenticated products
        //   extract?          — 'text' | 'tables' | 'all' (default: 'text')
        //   max_chars?        — max chars of body text per page (default: 3000)
        //   output_path?      — write discovery report as markdown
        // ------------------------------------------------------------------
        case 'workspace_tw_product_crawl': {
            try {
                if (!browsePage) {
                    return { ok: false, output: '', errorOutput: 'workspace_tw_product_crawl requires a browsePage callback.' };
                }

                const rawUrls = payload['urls'];
                const urls: string[] = Array.isArray(rawUrls)
                    ? (rawUrls as unknown[]).filter((u): u is string => typeof u === 'string')
                    : typeof rawUrls === 'string' ? [rawUrls] : [];

                if (urls.length === 0) {
                    return { ok: false, output: '', errorOutput: 'payload.urls (string or string[]) is required.' };
                }

                const extract = typeof payload['extract'] === 'string' ? payload['extract'] as 'text' | 'tables' | 'all' : 'text';
                const maxChars = typeof payload['max_chars'] === 'number' ? Math.min(payload['max_chars'], 8000) : 3000;
                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';
                const taskId = params.taskId;

                // Optional: login before crawling
                const creds = payload['credentials'] as Record<string, unknown> | undefined;
                if (creds && typeof creds['url'] === 'string' && typeof creds['username'] === 'string' && typeof creds['password'] === 'string') {
                    // Login via the browsePage callback by visiting the login URL first.
                    // The underlying BrowserContext retains the session cookie for subsequent calls.
                    await browsePage(creds['url'] as string, { extract: 'text' });
                }

                const crawled: CrawledPage[] = [];

                for (const url of urls.slice(0, 10)) {
                    if (!/^https?:\/\//i.test(url)) continue; // scheme check
                    const result = await browsePage(url, { extract, screenshot: false, taskId });
                    if (!result || !result.ok) continue;

                    crawled.push({
                        url,
                        title: result.title,
                        text: result.text.slice(0, maxChars),
                        headings: result.headings,
                        tables: result.tables,
                        screenshotPath: result.screenshotPath,
                        extractedAt: new Date().toISOString(),
                    });
                }

                if (crawled.length === 0) {
                    return { ok: false, output: '', errorOutput: 'No pages could be crawled. Check URLs and network access.' };
                }

                const report = buildProductDiscoveryReport(crawled);

                // LLM enhancement: generate doc outline from the crawled product content.
                let finalReport = report.markdownReport;
                if (callLlm && crawled.length > 0) {
                    const pagesSummary = crawled
                        .map((p) => `### ${p.title || p.url}\n${p.headings.slice(0, 5).join(', ')}\n${p.text.slice(0, 400)}`)
                        .join('\n\n');
                    const llmResult = await callLlmSafe(callLlm, {
                        system: 'You are an expert technical writer analyzing a product to plan documentation. Identify the key user-facing features, workflows, and concepts that need documentation based on what you see.',
                        user: `Based on the following pages crawled from the product, write a "Documentation Planning Brief" that lists:\n1. The top 5-10 user-facing features that need documentation\n2. Suggested doc titles and brief descriptions\n3. Recommended documentation structure\n\nCRAWLED PAGES:\n${pagesSummary}`,
                    });
                    if (llmResult) finalReport = finalReport + '\n\n---\n\n## Documentation Planning Brief (AI-Generated)\n\n' + llmResult;
                }

                if (outputPath) await writeDocFile(workspaceDir, outputPath, finalReport);

                return safeJson({
                    pages_crawled: crawled.length,
                    features_found: report.allFeatures.length,
                    features: report.allFeatures.slice(0, 30),
                    pages: crawled.map((p) => ({ url: p.url, title: p.title, heading_count: p.headings.length })),
                    written_to: outputPath || null,
                    report: finalReport,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_screenshot_doc
        // Take a screenshot of a product page and generate a documentation
        // page skeleton with embedded screenshot reference, heading outline,
        // and extracted page content. Closes the "can't observe the UI" gap.
        //
        // payload:
        //   url               — page URL to screenshot and document
        //   label?            — human-readable name for the page
        //   output_path?      — write the generated doc page as markdown
        //   screenshot_dir?   — directory to save screenshot file
        // ------------------------------------------------------------------
        case 'workspace_tw_screenshot_doc': {
            try {
                if (!browsePage) {
                    return { ok: false, output: '', errorOutput: 'workspace_tw_screenshot_doc requires a browsePage callback.' };
                }

                const url = typeof payload['url'] === 'string' ? payload['url'].trim() : '';
                if (!url) {
                    return { ok: false, output: '', errorOutput: 'payload.url is required.' };
                }
                if (!/^https?:\/\//i.test(url)) {
                    return { ok: false, output: '', errorOutput: 'payload.url must be an http/https URL.' };
                }

                const label = typeof payload['label'] === 'string' ? payload['label'].trim() : '';
                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';

                const result = await browsePage(url, { extract: 'all', screenshot: true, taskId: params.taskId });
                if (!result || !result.ok) {
                    return { ok: false, output: '', errorOutput: `Could not load page: ${url}` };
                }

                const crawledPage: CrawledPage = {
                    url,
                    title: result.title,
                    text: result.text.slice(0, 2000),
                    headings: result.headings,
                    tables: result.tables,
                    screenshotPath: result.screenshotPath,
                    extractedAt: new Date().toISOString(),
                };

                let docPage = buildScreenshotDocPage(crawledPage, label || undefined);

                // LLM enhancement: write real descriptions for each page section.
                if (callLlm && hasPlaceholders(docPage)) {
                    const enhanced = await callLlmSafe(callLlm, {
                        system: 'You are an expert technical writer documenting a product UI page. Write clear, user-focused descriptions for each section based on the page structure and content.',
                        user: `Complete this UI documentation page. Fill in ALL _[Add: ...]_ placeholders with clear, user-focused descriptions based on the page content below.\n\nPage content from ${url}:\nTitle: ${result.title}\nHeadings: ${result.headings.join(', ')}\nText: ${result.text.slice(0, 800)}\n\nDOC PAGE TEMPLATE:\n${docPage}`,
                    });
                    if (enhanced) docPage = enhanced;
                }

                if (outputPath) await writeDocFile(workspaceDir, outputPath, docPage);

                return safeJson({
                    url,
                    title: result.title,
                    heading_count: result.headings.length,
                    screenshot_path: result.screenshotPath ?? null,
                    written_to: outputPath || null,
                    doc_content: docPage,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_doc_gap_scan
        // Discover what's in the codebase or product that has no documentation.
        // Closes the "no self-direction" gap — the agent can now find its own
        // work without being told what to document.
        //
        // payload:
        //   source_type       — 'code' | 'urls' (where to discover features)
        //   source_files?     — string[] of code file paths (source_type: code)
        //   product_urls?     — string[] of product URLs to crawl (source_type: urls)
        //   doc_file_paths?   — existing doc files to check coverage against
        //   output_path?      — write the gap report as markdown
        // ------------------------------------------------------------------
        case 'workspace_tw_doc_gap_scan': {
            try {
                const sourceType = typeof payload['source_type'] === 'string'
                    ? payload['source_type']
                    : 'code';
                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';

                // Read existing doc files
                const rawDocPaths = payload['doc_file_paths'];
                const docFilePaths: string[] = Array.isArray(rawDocPaths)
                    ? (rawDocPaths as unknown[]).filter((p): p is string => typeof p === 'string')
                    : [];

                const docFiles: Array<{ path: string; content: string }> = [];
                for (const fp of docFilePaths) {
                    const content = await readDocFile(workspaceDir, fp);
                    if (content !== null) docFiles.push({ path: fp, content });
                }

                let features: string[] = [];

                if (sourceType === 'code') {
                    // Extract features from source code
                    const rawSourcePaths = payload['source_files'];
                    const sourceFilePaths: string[] = Array.isArray(rawSourcePaths)
                        ? (rawSourcePaths as unknown[]).filter((p): p is string => typeof p === 'string')
                        : [];

                    if (sourceFilePaths.length === 0) {
                        return { ok: false, output: '', errorOutput: 'payload.source_files is required for source_type: code.' };
                    }

                    const sourceFiles: Array<{ path: string; content: string }> = [];
                    for (const fp of sourceFilePaths) {
                        const content = await readDocFile(workspaceDir, fp);
                        if (content !== null) sourceFiles.push({ path: fp, content });
                    }

                    features = extractFeaturesFromCode(sourceFiles);

                } else if (sourceType === 'urls') {
                    // Extract features by crawling product URLs
                    if (!browsePage) {
                        return { ok: false, output: '', errorOutput: 'source_type: urls requires a browsePage callback.' };
                    }

                    const rawUrls = payload['product_urls'];
                    const urls: string[] = Array.isArray(rawUrls)
                        ? (rawUrls as unknown[]).filter((u): u is string => typeof u === 'string')
                        : [];

                    if (urls.length === 0) {
                        return { ok: false, output: '', errorOutput: 'payload.product_urls is required for source_type: urls.' };
                    }

                    const crawled: CrawledPage[] = [];
                    for (const url of urls.slice(0, 10)) {
                        if (!/^https?:\/\//i.test(url)) continue;
                        const result = await browsePage(url, { extract: 'text' });
                        if (!result || !result.ok) continue;
                        crawled.push({
                            url, title: result.title, text: result.text.slice(0, 2000),
                            headings: result.headings, extractedAt: new Date().toISOString(),
                        });
                    }

                    const discReport = buildProductDiscoveryReport(crawled);
                    features = discReport.allFeatures;

                } else {
                    return { ok: false, output: '', errorOutput: `Unknown source_type "${sourceType}". Use "code" or "urls".` };
                }

                if (features.length === 0) {
                    return { ok: false, output: '', errorOutput: 'No features could be extracted from the source.' };
                }

                const gapReport = findDocGaps(features, docFiles);

                // LLM enhancement: write a doc plan for the top gaps.
                let finalReport = gapReport.markdownReport;
                if (callLlm && gapReport.undocumentedFeatures.length > 0) {
                    const topGaps = gapReport.prioritizedGaps.slice(0, 10).map((g) => `- ${g.feature}: ${g.reason}`).join('\n');
                    const llmResult = await callLlmSafe(callLlm, {
                        system: 'You are an expert technical writer planning documentation work. Given a list of undocumented features, write a concrete documentation plan.',
                        user: `Write a "Documentation Sprint Plan" for these undocumented features:\n${topGaps}\n\nFor each feature, write:\n- One sentence describing what needs to be documented\n- Suggested doc type (tutorial, reference, guide, etc.)\n- Estimated complexity (low/medium/high)\n\nReturn as a Markdown table.`,
                    });
                    if (llmResult) finalReport = finalReport + '\n\n---\n\n## Recommended Documentation Sprint Plan\n\n' + llmResult;
                }

                if (outputPath) await writeDocFile(workspaceDir, outputPath, finalReport);

                return safeJson({
                    source_type: sourceType,
                    total_features: gapReport.totalFeatures,
                    coverage_percent: gapReport.coveragePercent,
                    undocumented_count: gapReport.undocumentedFeatures.length,
                    partial_count: gapReport.partialFeatures.length,
                    top_gaps: gapReport.prioritizedGaps.slice(0, 10),
                    written_to: outputPath || null,
                    report: finalReport,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_verify_doc_steps
        // Walk through every procedural step in a documentation file and
        // verify it actually works: API endpoints are reachable, UI pages
        // load, and read-only CLI commands succeed.
        //
        // Closes the "accuracy verification" gap — the agent can now confirm
        // the docs it writes are correct before publishing them.
        //
        // payload:
        //   file_path?    — doc file to verify (relative to workspaceDir)
        //   content?      — inline doc content (alternative to file_path)
        //   safe_mode?    — boolean (default: true); skip CLI execution when true
        //   base_url?     — prepend to relative URLs found in steps
        //   output_path?  — write verification report as markdown
        // ------------------------------------------------------------------
        case 'workspace_tw_verify_doc_steps': {
            try {
                // 1. Load the document
                let content = typeof payload['content'] === 'string' ? payload['content'] : '';
                const filePath = typeof payload['file_path'] === 'string' ? payload['file_path'].trim() : '';
                if (!content && filePath) {
                    const fc = await readDocFile(workspaceDir, filePath);
                    if (fc === null) return { ok: false, output: '', errorOutput: `File not found: ${filePath}` };
                    content = fc;
                }
                if (!content) {
                    return { ok: false, output: '', errorOutput: 'payload.content or payload.file_path is required.' };
                }

                // 2. Extract and classify steps
                const steps = extractStepsFromMarkdown(content);
                if (steps.length === 0) {
                    return safeJson({
                        total_steps: 0,
                        pass_count: 0,
                        fail_count: 0,
                        skipped_count: 0,
                        error_count: 0,
                        results: [],
                        written_to: null,
                        report: 'No procedural steps found in the document.',
                    });
                }

                const safeMode   = payload['safe_mode'] !== false; // default true
                const baseUrl    = typeof payload['base_url'] === 'string' ? payload['base_url'].replace(/\/$/, '') : '';
                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';
                const timeoutMs  = 10_000;

                // 3. Verify each step according to its type
                const verifyResults: StepVerificationResult[] = [];

                for (const step of steps) {
                    const t0 = Date.now();

                    // --------------------------------------------------------
                    // api_call — use curl (HEAD by default) via runCommand
                    // --------------------------------------------------------
                    if (step.type === 'api_call') {
                        if (!runCommand) {
                            verifyResults.push({ step, status: 'skipped', details: 'No runCommand callback — cannot verify API calls.' });
                            continue;
                        }

                        let url = step.url ?? '';
                        if (url && !url.startsWith('http') && baseUrl) {
                            url = baseUrl + (url.startsWith('/') ? url : '/' + url);
                        }
                        if (!url) {
                            verifyResults.push({ step, status: 'skipped', details: 'No URL detected in step.' });
                            continue;
                        }

                        const method = step.method ?? 'GET';
                        const nullOut = process.platform === 'win32' ? 'NUL' : '/dev/null';
                        const args = [
                            'curl', '-s', '-X', method,
                            '-w', '%{http_code}',
                            '-o', nullOut,
                            '--max-time', String(Math.ceil(timeoutMs / 1000)),
                            url,
                        ];
                        const r = await runCommand(args, workspaceDir, timeoutMs + 2_000);
                        const durationMs = Date.now() - t0;
                        const raw = r.stdout.trim().split('\n').pop() ?? '';
                        const statusCode = parseInt(raw, 10);

                        if (r.exitCode !== 0 && !raw) {
                            verifyResults.push({ step, status: 'error', details: `curl error: ${r.stderr.slice(0, 150)}`, durationMs });
                        } else if (isNaN(statusCode) || statusCode >= 500) {
                            verifyResults.push({ step, status: 'fail', details: `HTTP ${isNaN(statusCode) ? 'unknown' : statusCode} — server error or unreachable.`, responseCode: isNaN(statusCode) ? undefined : statusCode, durationMs });
                        } else if (statusCode >= 400) {
                            verifyResults.push({ step, status: 'fail', details: `HTTP ${statusCode} — client error; check URL or authentication.`, responseCode: statusCode, durationMs });
                        } else {
                            verifyResults.push({ step, status: 'pass', details: `HTTP ${statusCode} — endpoint reachable.`, responseCode: statusCode, durationMs });
                        }

                    // --------------------------------------------------------
                    // ui_navigation — load the URL via browsePage
                    // --------------------------------------------------------
                    } else if (step.type === 'ui_navigation') {
                        if (!browsePage) {
                            verifyResults.push({ step, status: 'skipped', details: 'No browsePage callback — cannot verify UI navigation.' });
                            continue;
                        }

                        let url = step.url ?? '';
                        if (!url && baseUrl) url = baseUrl;
                        if (!url) {
                            verifyResults.push({ step, status: 'skipped', details: 'No URL detected in step.' });
                            continue;
                        }

                        const pageResult = await browsePage(url, { extract: 'text' });
                        const durationMs = Date.now() - t0;
                        if (!pageResult || !pageResult.ok) {
                            verifyResults.push({ step, status: 'fail', details: `Page failed to load: ${url}`, durationMs });
                        } else {
                            const title = pageResult.title ? `"${pageResult.title}"` : url;
                            verifyResults.push({ step, status: 'pass', details: `Page loaded: ${title}`, durationMs });
                        }

                    // --------------------------------------------------------
                    // cli_command — execute only read-only/safe commands when
                    //               safe_mode is disabled; otherwise skip
                    // --------------------------------------------------------
                    } else if (step.type === 'cli_command') {
                        if (safeMode) {
                            verifyResults.push({ step, status: 'skipped', details: 'CLI command skipped (safe_mode: true). Set safe_mode: false to execute CLI steps.' });
                            continue;
                        }
                        if (!runCommand) {
                            verifyResults.push({ step, status: 'skipped', details: 'No runCommand callback — cannot execute CLI commands.' });
                            continue;
                        }

                        const cmd = step.command ?? '';
                        if (!cmd) {
                            verifyResults.push({ step, status: 'skipped', details: 'No command detected in step.' });
                            continue;
                        }

                        // Only allow read-only commands even in non-safe mode
                        const SAFE_CLI_RE = /^(git\s+(status|log|diff|show)|ls|cat|echo|node\s+--version|npm\s+--version|yarn\s+--version|pnpm\s+--version|curl|ping|which)\b/i;
                        if (!SAFE_CLI_RE.test(cmd)) {
                            verifyResults.push({ step, status: 'skipped', details: `Command "${cmd.slice(0, 60)}" is not in the safe-run allowlist. Verify manually.` });
                            continue;
                        }

                        const tokens = cmd.split(/\s+/).filter(Boolean);
                        const r = await runCommand(tokens, workspaceDir, timeoutMs + 2_000);
                        const durationMs = Date.now() - t0;
                        if (r.exitCode !== 0) {
                            verifyResults.push({ step, status: 'fail', details: `Exit code ${r.exitCode}: ${r.stderr.slice(0, 150)}`, durationMs });
                        } else {
                            verifyResults.push({ step, status: 'pass', details: 'Command succeeded (exit 0).', durationMs });
                        }

                    // --------------------------------------------------------
                    // manual — always skipped; requires human verification
                    // --------------------------------------------------------
                    } else {
                        verifyResults.push({ step, status: 'skipped', details: 'Manual step — requires human verification.' });
                    }
                }

                // 4. Build structured report
                const report = buildVerificationReport(verifyResults);

                // 5. LLM enhancement: suggest doc fixes for failed steps
                let finalReport = report.markdownReport;
                if (callLlm && report.failCount + report.errorCount > 0) {
                    const failSummary = verifyResults
                        .filter((r) => r.status === 'fail' || r.status === 'error')
                        .map((r) => `Step ${r.step.number} (${r.step.type}): "${r.step.text.slice(0, 150)}" → ${r.details}`)
                        .join('\n');
                    const llmResult = await callLlmSafe(callLlm, {
                        system: 'You are an expert technical writer. Given a list of documentation steps that failed automated verification, suggest specific, actionable fixes.',
                        user: `The following documentation steps failed verification:\n\n${failSummary}\n\nFor each failed step:\n1. Briefly explain the likely root cause (broken URL, wrong command, stale info, etc.)\n2. Write a concrete fix to the documentation text (e.g., correct URL, updated command, add a prerequisite note)\n\nReturn your fixes as a numbered list, referencing each step number.`,
                    });
                    if (llmResult) finalReport += '\n\n---\n\n## Suggested Documentation Fixes\n\n' + llmResult;
                }

                if (outputPath) await writeDocFile(workspaceDir, outputPath, finalReport);

                return safeJson({
                    total_steps:   report.totalSteps,
                    pass_count:    report.passCount,
                    fail_count:    report.failCount,
                    skipped_count: report.skippedCount,
                    error_count:   report.errorCount,
                    results: report.results.map((r) => ({
                        step_number:   r.step.number,
                        step_type:     r.step.type,
                        status:        r.status,
                        details:       r.details,
                        response_code: r.responseCode,
                        duration_ms:   r.durationMs,
                    })),
                    written_to: outputPath || null,
                    report: finalReport,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_interact_product
        // Execute a multi-step interaction sequence against the live product
        // (navigate → login → fill → click → assert → read) using a persistent
        // Playwright page that maintains session state across steps.
        //
        // Closes gap 1: the agent can now log in, navigate authenticated flows,
        // and observe the real UI — not just read static HTML.
        //
        // payload:
        //   steps               — InteractionStep[] (type, url?, credentials?,
        //                         fields?, target?, expected?, label?)
        //   capture_screenshots? — boolean (default false)
        //   output_path?         — write the interaction report as markdown
        // ------------------------------------------------------------------
        case 'workspace_tw_interact_product': {
            try {
                if (!interactPage) {
                    return { ok: false, output: '', errorOutput: 'workspace_tw_interact_product requires an interactPage callback.' };
                }

                const rawSteps = payload['steps'];
                if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
                    return { ok: false, output: '', errorOutput: 'payload.steps (array of InteractionStep objects) is required.' };
                }

                // Coerce raw payload objects into typed InteractionStep records
                const steps: InteractionStep[] = (rawSteps as unknown[])
                    .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
                    .map((s): InteractionStep => {
                        const rawCreds = s['credentials'];
                        const rawFields = s['fields'];
                        return {
                            type: (typeof s['type'] === 'string' ? s['type'] : 'read') as InteractionStep['type'],
                            label:       typeof s['label']    === 'string' ? s['label']    : undefined,
                            url:         typeof s['url']      === 'string' ? s['url']      : undefined,
                            target:      typeof s['target']   === 'string' ? s['target']   : undefined,
                            expected:    typeof s['expected'] === 'string' ? s['expected'] : undefined,
                            credentials: typeof rawCreds === 'object' && rawCreds !== null
                                ? {
                                    username: String((rawCreds as Record<string, unknown>)['username'] ?? ''),
                                    password: String((rawCreds as Record<string, unknown>)['password'] ?? ''),
                                }
                                : undefined,
                            fields: typeof rawFields === 'object' && rawFields !== null
                                ? rawFields as Record<string, string>
                                : undefined,
                        };
                    });

                const captureScreenshots = payload['capture_screenshots'] === true;
                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';

                const results = await interactPage(steps, { captureScreenshots, taskId });
                const report  = buildInteractionReport(results);

                // LLM enhancement: narrative of what was observed
                let finalReport = report.markdownReport;
                if (callLlm && report.passCount > 0 && report.observedPages.length > 0) {
                    const pagesSummary = report.observedPages
                        .slice(0, 5)
                        .map((p) => `**${p.title}**: ${p.text.slice(0, 300)}`)
                        .join('\n\n');
                    const llmResult = await callLlmSafe(callLlm, {
                        system: 'You are an expert technical writer documenting product UX based on first-hand observation.',
                        user: `You navigated the following product pages:\n\n${pagesSummary}\n\nWrite a concise "What Was Observed" narrative (3–5 sentences) that another technical writer could use as background context when writing documentation. Note UI patterns, terminology, and user flow. Use the actual UI labels you observed.`,
                    });
                    if (llmResult) finalReport += '\n\n---\n\n## Observed Product Narrative\n\n' + llmResult;
                }

                if (outputPath) await writeDocFile(workspaceDir, outputPath, finalReport);

                return safeJson({
                    total_steps:          report.totalSteps,
                    pass_count:           report.passCount,
                    fail_count:           report.failCount,
                    observed_features:    report.observedFeatures,
                    observed_page_count:  report.observedPages.length,
                    written_to:           outputPath || null,
                    report:               finalReport,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_pr_review_respond
        // Read all inline review comments on a GitHub PR, apply LLM-generated
        // fixes to the doc files, and post a summary comment back on the PR.
        //
        // Closes gap 2: the agent can now close the review→revise loop
        // without human intervention for actionable inline comments.
        //
        // payload:
        //   pr_number  — integer PR number
        //   repo       — "owner/repo" string
        //   auto_fix?  — boolean (default true); set false to plan-only
        //   output_path? — write the response report as markdown
        // ------------------------------------------------------------------
        case 'workspace_tw_pr_review_respond': {
            try {
                if (!runCommand) {
                    return { ok: false, output: '', errorOutput: 'workspace_tw_pr_review_respond requires a runCommand callback.' };
                }

                const prNumber = typeof payload['pr_number'] === 'number'
                    ? payload['pr_number']
                    : parseInt(String(payload['pr_number'] ?? ''), 10);
                const repo = typeof payload['repo'] === 'string' ? payload['repo'].trim() : '';
                const autoFix = payload['auto_fix'] !== false;
                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';

                if (isNaN(prNumber) || prNumber <= 0) {
                    return { ok: false, output: '', errorOutput: 'payload.pr_number (positive integer) is required.' };
                }
                if (!repo || !repo.includes('/')) {
                    return { ok: false, output: '', errorOutput: 'payload.repo ("owner/repo") is required.' };
                }

                const [owner, repoName] = repo.split('/', 2) as [string, string];

                // Fetch inline review comments via gh CLI
                const ghResult = await runCommand(
                    ['gh', 'api', `repos/${owner}/${repoName}/pulls/${prNumber}/comments`],
                    workspaceDir, 30_000,
                );
                if (ghResult.exitCode !== 0) {
                    return { ok: false, output: '', errorOutput: `gh api failed: ${ghResult.stderr.slice(0, 200)}` };
                }

                let rawComments: unknown[];
                try {
                    rawComments = JSON.parse(ghResult.stdout) as unknown[];
                } catch {
                    return { ok: false, output: '', errorOutput: 'Could not parse gh api response as JSON.' };
                }

                const comments = parseGhPrReviewComments(rawComments);
                const fixes: ReviewFix[] = [];

                for (const comment of comments.slice(0, 30)) {
                    if (!isActionableComment(comment)) {
                        fixes.push({ comment, status: 'skipped', fixSummary: 'Non-actionable — no change requested.' });
                        continue;
                    }
                    if (!autoFix || !callLlm) {
                        fixes.push({ comment, status: 'manual', fixSummary: 'Auto-fix disabled or no LLM callback.' });
                        continue;
                    }

                    // Read the file and apply the fix
                    const fileContent = await readDocFile(workspaceDir, comment.path);
                    if (fileContent === null) {
                        fixes.push({ comment, status: 'manual', fixSummary: `File not in workspace: ${comment.path}` });
                        continue;
                    }

                    const fileLines = fileContent.split('\n');
                    const lineContext = comment.line
                        ? fileLines.slice(Math.max(0, comment.line - 5), comment.line + 5).join('\n')
                        : fileContent.slice(0, 600);

                    const llmResult = await callLlmSafe(callLlm, {
                        system: "You are a precise technical writer applying a reviewer's inline comment. Return ONLY the corrected text, no explanations.",
                        user: `File: ${comment.path}\nReviewer comment: "${comment.body}"\n\nContext:\n\`\`\`\n${lineContext}\n\`\`\`\n\nApply the reviewer's requested change and return the corrected text only.`,
                    });

                    if (!llmResult) {
                        fixes.push({ comment, status: 'manual', fixSummary: 'LLM returned no result — manual review required.' });
                        continue;
                    }

                    // Splice fix into the file at the anchored line
                    let newContent: string;
                    if (comment.line && comment.line <= fileLines.length) {
                        // Line-anchored: splice the fix in at the exact line
                        fileLines.splice(comment.line - 1, 1, llmResult.trim());
                        newContent = fileLines.join('\n');
                    } else {
                        // No line anchor: append the fix as an editor note so the
                        // file is not silently replaced with a partial snippet
                        newContent = fileContent + `\n\n<!-- TW-AGENT FIX (${comment.author}): ${comment.body.slice(0, 80)}\n${llmResult.trim()}\n-->`;
                    }

                    await writeDocFile(workspaceDir, comment.path, newContent);
                    fixes.push({ comment, status: 'fixed', fixSummary: `Applied fix to ${comment.path}:${comment.line ?? '?'}`, newContent });
                }

                const responseReport = buildReviewResponseReport(fixes);

                // Commit the applied fixes so they appear in the PR diff
                if (responseReport.fixedCount > 0 && runCommand) {
                    const fixedPaths = fixes
                        .filter((f) => f.status === 'fixed')
                        .map((f) => f.comment.path);
                    // Stage only the modified doc files (never `git add -A`)
                    for (const p of fixedPaths) {
                        await runCommand(['git', 'add', p], workspaceDir, 10_000).catch(() => {});
                    }
                    await runCommand(
                        ['git', 'commit', '-m', `docs: apply ${responseReport.fixedCount} PR review fix(es) [tw-agent]`],
                        workspaceDir, 15_000,
                    ).catch(() => { /* non-fatal: commit failure won't break the report */ });
                    await runCommand(['git', 'push'], workspaceDir, 20_000)
                        .catch(() => { /* non-fatal */ });
                }

                // Post a summary comment on the PR
                if (responseReport.fixedCount > 0) {
                    const prComment = `🤖 **TW Agent** applied ${responseReport.fixedCount} doc fix(es) from review comments.${responseReport.manualCount > 0 ? `\n⚠️ ${responseReport.manualCount} comment(s) still require manual review.` : ''}`;
                    await runCommand(
                        ['gh', 'pr', 'comment', String(prNumber), '--repo', repo, '--body', prComment],
                        workspaceDir, 15_000,
                    ).catch(() => { /* non-fatal: comment posting failure doesn't fail the action */ });
                }

                if (outputPath) await writeDocFile(workspaceDir, outputPath, responseReport.markdownReport);

                return safeJson({
                    total_comments: responseReport.totalComments,
                    fixed_count:    responseReport.fixedCount,
                    skipped_count:  responseReport.skippedCount,
                    manual_count:   responseReport.manualCount,
                    written_to:     outputPath || null,
                    report:         responseReport.markdownReport,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_doc_index
        // Walk all Markdown files in the workspace and build a cross-linked
        // index of titles, sections, topics, and doc types.
        //
        // Closes gap 3: the agent now has a complete mental model of the
        // entire doc set — not just files it personally created.
        //
        // payload:
        //   doc_dirs?    — string[] of directories to scan (default: ['.'])
        //   extensions?  — string[] of file extensions (default: ['.md', '.mdx'])
        //   output_path? — write the index summary as markdown
        //   memory_key?  — key for the JSON index file (default: 'tw_doc_index')
        // ------------------------------------------------------------------
        case 'workspace_tw_doc_index': {
            try {
                const rawDirs = payload['doc_dirs'];
                const docDirs: string[] = Array.isArray(rawDirs)
                    ? (rawDirs as unknown[]).filter((d): d is string => typeof d === 'string')
                    : ['.'];

                const rawExts = payload['extensions'];
                const extensions = new Set<string>(
                    Array.isArray(rawExts)
                        ? (rawExts as unknown[]).filter((e): e is string => typeof e === 'string')
                        : ['.md', '.mdx'],
                );

                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';
                const memoryKey = typeof payload['memory_key'] === 'string' ? payload['memory_key'].trim() : 'tw_doc_index';

                // Walk directories recursively to collect doc file paths
                const docFilePaths: string[] = [];

                async function walkDir(relDir: string): Promise<void> {
                    let safePath: string;
                    try {
                        safePath = safeWorkspacePath(workspaceDir, relDir);
                    } catch {
                        return;
                    }
                    let entries;
                    try {
                        entries = await readdir(safePath, { withFileTypes: true });
                    } catch {
                        return;
                    }
                    for (const entry of entries) {
                        if (entry.name.startsWith('.')) continue;
                        if (['node_modules', 'dist', 'build', '.git', 'coverage'].includes(entry.name)) continue;
                        const entryRel = join(relDir, entry.name);
                        if (entry.isDirectory()) {
                            await walkDir(entryRel);
                        } else if (entry.isFile() && extensions.has(extname(entry.name).toLowerCase())) {
                            docFilePaths.push(entryRel);
                        }
                    }
                }

                for (const dir of docDirs) {
                    await walkDir(dir);
                }

                if (docFilePaths.length === 0) {
                    return safeJson({
                        total_docs: 0,
                        message: 'No documentation files found in the specified directories.',
                        memory_key: memoryKey,
                        written_to: null,
                    });
                }

                // Extract index entries (cap at 500 files)
                const entries: DocIndexEntry[] = [];
                for (const fp of docFilePaths.slice(0, 500)) {
                    const content = await readDocFile(workspaceDir, fp);
                    if (content !== null) entries.push(extractDocEntry(fp, content));
                }

                const index = buildDocIndex(entries);

                // LLM enhancement: synthesise a doc set assessment
                let finalSummary = index.markdownSummary;
                if (callLlm && entries.length > 0) {
                    const sample = entries.slice(0, 10).map((e) => `- ${e.title} (${e.docType}, ${e.wordCount} words)`).join('\n');
                    const llmResult = await callLlmSafe(callLlm, {
                        system: 'You are a technical writing lead reviewing a repository documentation set.',
                        user: `This repository has ${entries.length} documentation file(s). Sample:\n${sample}\n\nIn 3–5 sentences describe the overall documentation structure, coverage strengths, and any obvious gaps. Be concise and actionable.`,
                    });
                    if (llmResult) finalSummary += '\n\n---\n\n## Documentation Set Assessment\n\n' + llmResult;
                }

                // Persist the index JSON for future memory lookups
                const memoryPath = `.tw-doc-index/${memoryKey}.json`;
                const indexJson = JSON.stringify({ entries, topicMap: index.topicMap }, null, 2);
                await writeDocFile(workspaceDir, memoryPath, indexJson);

                if (outputPath) await writeDocFile(workspaceDir, outputPath, finalSummary);

                const byType = Object.fromEntries(
                    (['tutorial', 'guide', 'api', 'reference', 'faq', 'onboarding', 'changelog', 'readme', 'adr', 'unknown'] as const)
                        .map((t): [string, number] => [t, entries.filter((e) => e.docType === t).length])
                        .filter(([, n]) => n > 0),
                );

                return safeJson({
                    total_docs:   index.totalDocs,
                    doc_types:    byType,
                    total_topics: Object.keys(index.topicMap).length,
                    memory_path:  memoryPath,
                    written_to:   outputPath || null,
                    summary:      finalSummary,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_roadmap_context
        // Fetch GitHub issues labelled deprecation / breaking-change /
        // enhancement and read local planning files (ROADMAP.md etc.)
        // to build a strategic context document.
        //
        // Closes gap 4: the agent now knows what's deprecated (don't document
        // it), what's breaking (update existing docs), and what's shipping
        // next (prioritise new docs).
        //
        // payload:
        //   repo            — "owner/repo" (required)
        //   planning_files? — string[] of local file paths (default: ROADMAP.md)
        //   output_path?    — write context as markdown
        // ------------------------------------------------------------------
        case 'workspace_tw_roadmap_context': {
            try {
                if (!runCommand) {
                    return { ok: false, output: '', errorOutput: 'workspace_tw_roadmap_context requires a runCommand callback.' };
                }

                const repo = typeof payload['repo'] === 'string' ? payload['repo'].trim() : '';
                if (!repo || !repo.includes('/')) {
                    return { ok: false, output: '', errorOutput: 'payload.repo ("owner/repo") is required.' };
                }

                const rawPlanFiles = payload['planning_files'];
                const planningFiles: string[] = Array.isArray(rawPlanFiles)
                    ? (rawPlanFiles as unknown[]).filter((p): p is string => typeof p === 'string')
                    : ['ROADMAP.md', 'CHANGELOG.md', 'docs/ROADMAP.md'];

                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';

                // Fetch issues in three label groups (deprecation, breaking, enhancement)
                const LABEL_QUERIES = ['deprecation', 'breaking-change', 'enhancement'];
                const allIssues: unknown[] = [];

                for (const label of LABEL_QUERIES) {
                    const r = await runCommand(
                        ['gh', 'issue', 'list', '--repo', repo, '--label', label,
                         '--json', 'number,title,body,url,labels,milestone', '--limit', '50'],
                        workspaceDir, 20_000,
                    );
                    if (r.exitCode === 0 && r.stdout.trim()) {
                        try {
                            const parsed = JSON.parse(r.stdout) as unknown[];
                            allIssues.push(...parsed);
                        } catch { /* skip malformed */ }
                    }
                }

                // Deduplicate issues by number
                const seen = new Set<number>();
                const deduped = (allIssues as Record<string, unknown>[]).filter((i) => {
                    const n = typeof i['number'] === 'number' ? i['number'] : NaN;
                    if (isNaN(n) || seen.has(n)) return false;
                    seen.add(n);
                    return true;
                });

                const { deprecated, upcoming, breaking } = parseGithubIssues(deduped);

                // Read local planning files
                let planningDocContent = '';
                for (const fp of planningFiles) {
                    const content = await readDocFile(workspaceDir, fp);
                    if (content) {
                        planningDocContent += `\n\n### ${fp}\n\n${content.slice(0, 1000)}`;
                    }
                }

                const context = buildRoadmapContext(deprecated, upcoming, breaking, planningDocContent || undefined);

                // LLM enhancement: doc prioritisation recommendation
                let finalContext = context.markdownContext;
                if (callLlm && (deprecated.length + upcoming.length + breaking.length) > 0) {
                    const snapshot = [
                        deprecated.length > 0 ? `${deprecated.length} deprecated: ${deprecated.slice(0, 3).map((d) => d.name).join(', ')}` : '',
                        breaking.length  > 0  ? `${breaking.length} breaking changes` : '',
                        upcoming.filter((u) => u.needsDocs).length > 0
                            ? `${upcoming.filter((u) => u.needsDocs).length} features needing docs`
                            : '',
                    ].filter(Boolean).join('; ');

                    const llmResult = await callLlmSafe(callLlm, {
                        system: 'You are a technical writing manager prioritising documentation work.',
                        user: `Roadmap snapshot: ${snapshot}\n\nWrite a concise 5-bullet prioritisation recommendation:\n- What to write this sprint\n- What existing docs need updating urgently  \n- What NOT to document (deprecated)\n\nBe specific and actionable.`,
                    });
                    if (llmResult) finalContext += '\n\n---\n\n## Documentation Prioritisation Recommendation\n\n' + llmResult;
                }

                if (outputPath) await writeDocFile(workspaceDir, outputPath, finalContext);

                return safeJson({
                    repo,
                    deprecated_count:   deprecated.length,
                    upcoming_count:     upcoming.length,
                    breaking_count:     breaking.length,
                    do_not_document:    context.doNotDocumentList,
                    high_priority_docs: context.highPriorityDocTargets,
                    written_to:         outputPath || null,
                    context:            finalContext,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        // ------------------------------------------------------------------
        // workspace_tw_sprint_doc
        // Generate Agile sprint documentation.
        //
        // payload:
        //   doc_type      — 'review' | 'retrospective' | 'user_stories' |
        //                   'acceptance_criteria' | 'sprint_plan'
        //   sprint        — SprintData object
        //   stories?      — array of UserStory objects
        //   retro_items?  — array of RetroItem objects (for retrospective)
        //   output_path?  — where to write the generated markdown
        // ------------------------------------------------------------------
        case 'workspace_tw_sprint_doc': {
            try {
                const docType = typeof payload['doc_type'] === 'string'
                    ? (payload['doc_type'] as SprintDocType)
                    : 'review';

                const validDocTypes: SprintDocType[] = ['review', 'retrospective', 'user_stories', 'acceptance_criteria', 'sprint_plan'];
                if (!validDocTypes.includes(docType)) {
                    return { ok: false, output: '', errorOutput: `Invalid doc_type "${docType}". Must be one of: ${validDocTypes.join(', ')}.` };
                }

                const rawSprint = payload['sprint'] as Record<string, unknown> | undefined;
                if (!rawSprint || typeof rawSprint !== 'object') {
                    return { ok: false, output: '', errorOutput: 'payload.sprint (SprintData object) is required.' };
                }

                const sprintData: SprintData = {
                    sprintNumber: typeof rawSprint['sprint_number'] === 'number' ? rawSprint['sprint_number'] : 0,
                    teamName: typeof rawSprint['team_name'] === 'string' ? rawSprint['team_name'] : 'Team',
                    startDate: typeof rawSprint['start_date'] === 'string' ? rawSprint['start_date'] : '',
                    endDate: typeof rawSprint['end_date'] === 'string' ? rawSprint['end_date'] : '',
                    goals: Array.isArray(rawSprint['goals'])
                        ? (rawSprint['goals'] as unknown[]).filter((g): g is string => typeof g === 'string')
                        : [],
                    velocity: typeof rawSprint['velocity'] === 'number' ? rawSprint['velocity'] : undefined,
                    plannedPoints: typeof rawSprint['planned_points'] === 'number' ? rawSprint['planned_points'] : undefined,
                    completedPoints: typeof rawSprint['completed_points'] === 'number' ? rawSprint['completed_points'] : undefined,
                };

                const stories = parseUserStories(payload['stories']);
                const retroItems = parseRetroItems(payload['retro_items']);

                const markdown = buildSprintDoc(docType, sprintData, stories, retroItems);

                const outputPath = typeof payload['output_path'] === 'string' ? payload['output_path'].trim() : '';
                if (outputPath) await writeDocFile(workspaceDir, outputPath, markdown);

                return safeJson({
                    doc_type: docType,
                    sprint_number: sprintData.sprintNumber,
                    story_count: stories.length,
                    doc_content: markdown,
                    written_to: outputPath || null,
                });
            } catch (err) {
                return { ok: false, output: '', errorOutput: String(err) };
            }
        }

        default: {
            const exhaustive: never = actionType;
            return { ok: false, output: '', errorOutput: `Unknown technical writer action: ${String(exhaustive)}` };
        }
    }
}

// ---------------------------------------------------------------------------
// Post-decision hooks
// ---------------------------------------------------------------------------

export async function onTwDocApproved(params: {
    tenantId: string; botId?: string; workspaceId: string; taskId: string;
    docTitle: string; documentType: import('./technical-writer-rag-retriever.js').TwDocumentType;
    content: string; sourceUrl?: string;
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { ingestApprovedDoc } = await import('./technical-writer-rag-retriever.js');
        await ingestApprovedDoc({ ...params });
    } catch { /* non-fatal */ }
}

export async function onTwFeedbackReceived(params: {
    tenantId: string; workspaceId: string; taskId: string; docId: string;
    feedbackReasons: string[];
    gatewayBaseUrl: string; serviceToken: string;
}): Promise<void> {
    try {
        const { ingestTwFeedback, GatewayTwLessonStore } = await import('./technical-writer-lesson-pipeline.js');
        const store = new GatewayTwLessonStore(params.gatewayBaseUrl, params.serviceToken);
        await ingestTwFeedback(
            { tenantId: params.tenantId, workspaceId: params.workspaceId, taskId: params.taskId, docId: params.docId, documentType: 'any', actionType: 'feedback', correlationId: params.taskId },
            params.feedbackReasons.map((body) => ({ body })),
            store,
        );
    } catch { /* non-fatal */ }
}
