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

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, relative } from 'node:path';
import type { LocalWorkspaceResult } from './local-workspace-executor.js';
import { buildTechnicalWriterStandupSummary } from './technical-writer-standup-builder.js';
import {
    buildInterviewPlanFromCode,
    buildInterviewPlanFromDescription,
    synthesiseDocBrief,
    type SmeInterviewQuestion,
    type SmeInterviewResponse,
} from './technical-writer/sme-interview-builder.js';
import {
    buildSprintDoc,
    type SprintDocType,
    type SprintData,
    type UserStory,
    type RetroItem,
} from './technical-writer/sprint-doc-builder.js';

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
    | 'workspace_tw_sprint_doc';

export function isTechnicalWriterActionType(t: string): t is TechnicalWriterActionType {
    return (
        t === 'workspace_tw_doc_diff' ||
        t === 'workspace_tw_api_doc_openapi' ||
        t === 'workspace_tw_api_doc_code' ||
        t === 'workspace_tw_release_notes' ||
        t === 'workspace_tw_style_check' ||
        t === 'workspace_tw_standup_report' ||
        t === 'workspace_tw_sme_interview' ||
        t === 'workspace_tw_sprint_doc'
    );
}

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
}): Promise<LocalWorkspaceResult> {
    const { actionType, payload, workspaceDir, runCommand } = params;

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

                if (docFilePathRaw) {
                    await writeDocFile(workspaceDir, docFilePathRaw, docContent);
                }

                return safeJson({
                    changed_files: changedFiles.map((f) => ({
                        file: f.filePath,
                        additions: f.additions,
                        deletions: f.deletions,
                        changed_symbols: f.changedSymbols,
                    })),
                    doc_content: docContent,
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
                const markdown = generateApiDocMarkdown(info, endpoints);

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

                const markdown = generateCodeDocMarkdown(sourceFiles);

                const outputPath = typeof payload['output_path'] === 'string'
                    ? payload['output_path'].trim()
                    : '';
                if (outputPath) {
                    await writeDocFile(workspaceDir, outputPath, markdown);
                }

                const symbolCount = sourceFiles.reduce((n, f) => n + f.symbols.length, 0);

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

                const notes = buildReleaseNotesMarkdown(commits, {
                    projectName: typeof payload['project_name'] === 'string' ? payload['project_name'] : undefined,
                    version: typeof payload['version'] === 'string' ? payload['version'] : undefined,
                    fromRef: typeof payload['from_ref'] === 'string' ? payload['from_ref'] : undefined,
                    toRef: typeof payload['to_ref'] === 'string' ? payload['to_ref'] : undefined,
                });

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

            return safeJson({ dry_run: true, summary });
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

                    if (outputPath) await writeDocFile(workspaceDir, outputPath, brief.markdownBrief);

                    return safeJson({
                        mode: 'synthesise',
                        title: brief.title,
                        key_points: brief.keyPoints.length,
                        open_questions: brief.openQuestions.length,
                        markdown_brief: brief.markdownBrief,
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
    }
}
