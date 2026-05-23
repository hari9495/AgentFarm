// ============================================================================
// API DOC GENERATOR
// Sprint 16 — Technical Writer Role
//
// Two distinct generation paths, same output type (Markdown string):
//   1. generateApiDocFromOpenApi  — converts an OpenAPI 3.x JSON object into
//      a Markdown API reference (paths, methods, parameters, response schemas).
//   2. generateApiDocFromCode     — extracts JSDoc / TSDoc / Python docstring
//      comments from source text and formats them as Markdown.
//
// Pure functions — no connector calls, no LLM calls.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenApiDocument {
    openapi?: string;
    info?: { title?: string; version?: string; description?: string };
    paths?: Record<string, OpenApiPathItem>;
    components?: { schemas?: Record<string, OpenApiSchema> };
}

export interface OpenApiPathItem {
    get?: OpenApiOperation;
    post?: OpenApiOperation;
    put?: OpenApiOperation;
    patch?: OpenApiOperation;
    delete?: OpenApiOperation;
    head?: OpenApiOperation;
    options?: OpenApiOperation;
}

export interface OpenApiOperation {
    summary?: string;
    description?: string;
    operationId?: string;
    parameters?: OpenApiParameter[];
    requestBody?: { description?: string; required?: boolean; content?: Record<string, { schema?: OpenApiSchema }> };
    responses?: Record<string, { description?: string; content?: Record<string, { schema?: OpenApiSchema }> }>;
    tags?: string[];
}

export interface OpenApiParameter {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    required?: boolean;
    description?: string;
    schema?: OpenApiSchema;
}

export interface OpenApiSchema {
    type?: string;
    format?: string;
    description?: string;
    properties?: Record<string, OpenApiSchema>;
    items?: OpenApiSchema;
    $ref?: string;
    enum?: unknown[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;
type HttpMethod = typeof HTTP_METHODS[number];

function schemaToTypeString(schema: OpenApiSchema | undefined): string {
    if (!schema) return 'any';
    if (schema.$ref) {
        const parts = schema.$ref.split('/');
        return parts[parts.length - 1] ?? 'object';
    }
    if (schema.type === 'array') {
        return `${schemaToTypeString(schema.items)}[]`;
    }
    if (schema.enum) {
        return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
    }
    return schema.format ? `${schema.type}(${schema.format})` : (schema.type ?? 'any');
}

function renderParameters(params: OpenApiParameter[]): string {
    if (params.length === 0) return '';
    const rows = params.map((p) => {
        const required = p.required ? '**required**' : 'optional';
        const type = schemaToTypeString(p.schema);
        const desc = p.description ?? '';
        return `| \`${p.name}\` | \`${p.in}\` | \`${type}\` | ${required} | ${desc} |`;
    });
    return [
        '**Parameters**',
        '',
        '| Name | In | Type | Required | Description |',
        '|------|-----|------|----------|-------------|',
        ...rows,
        '',
    ].join('\n');
}

function renderResponses(responses: Record<string, { description?: string }>): string {
    const rows = Object.entries(responses).map(
        ([code, resp]) => `| \`${code}\` | ${resp.description ?? ''} |`,
    );
    return [
        '**Responses**',
        '',
        '| Status | Description |',
        '|--------|-------------|',
        ...rows,
        '',
    ].join('\n');
}

// ---------------------------------------------------------------------------
// Public API — OpenAPI path
// ---------------------------------------------------------------------------

/**
 * Convert an OpenAPI 3.x JSON object into a Markdown API reference.
 *
 * Output format:
 *   # <API title>
 *   ## <PATH METHOD>
 *   Summary / description / parameters table / responses table
 */
export function generateApiDocFromOpenApi(openApiJson: OpenApiDocument): string {
    const title = openApiJson.info?.title ?? 'API Reference';
    const version = openApiJson.info?.version ? ` (${openApiJson.info.version})` : '';
    const description = openApiJson.info?.description ?? '';

    const lines: string[] = [`# ${title}${version}`, ''];
    if (description) lines.push(description, '');

    const paths = openApiJson.paths ?? {};
    if (Object.keys(paths).length === 0) {
        lines.push('*No paths defined.*', '');
        return lines.join('\n');
    }

    for (const [path, pathItem] of Object.entries(paths)) {
        for (const method of HTTP_METHODS) {
            const op = (pathItem as Record<string, OpenApiOperation>)[method];
            if (!op) continue;

            lines.push(`## ${method.toUpperCase()} ${path}`, '');

            if (op.summary) lines.push(`**${op.summary}**`, '');
            if (op.description) lines.push(op.description, '');

            const params = op.parameters ?? [];
            if (params.length > 0) {
                lines.push(renderParameters(params));
            }

            if (op.requestBody) {
                const bodyDesc = op.requestBody.description ?? 'Request body';
                const required = op.requestBody.required ? ' *(required)*' : '';
                lines.push(`**Request Body**${required}: ${bodyDesc}`, '');
            }

            if (op.responses && Object.keys(op.responses).length > 0) {
                lines.push(renderResponses(op.responses));
            }

            lines.push('---', '');
        }
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API — Code comment extraction path
// ---------------------------------------------------------------------------

/**
 * Extract JSDoc / TSDoc / Python docstring comments from source text and
 * format as a Markdown API reference.
 *
 * Supported languages: 'typescript' | 'javascript' | 'python'
 *
 * For TypeScript/JavaScript: matches /** ... *‌/ blocks followed by a
 * function/class/const declaration line.
 *
 * For Python: matches triple-quoted docstrings after a def/class line.
 *
 * Returns an empty Markdown string when no comments are found.
 */
export function generateApiDocFromCode(
    sourceText: string,
    language: 'typescript' | 'javascript' | 'python' | string,
): string {
    const isJs = language === 'typescript' || language === 'javascript';
    const isPy = language === 'python';

    if (!isJs && !isPy) {
        // Fallback: try JSDoc patterns anyway
        return extractJsDocComments(sourceText);
    }
    if (isPy) return extractPythonDocstrings(sourceText);
    return extractJsDocComments(sourceText);
}

// ---------------------------------------------------------------------------
// JSDoc / TSDoc extraction
// ---------------------------------------------------------------------------

interface CommentBlock {
    comment: string;
    declaration: string;
}

function extractJsDocComments(source: string): string {
    const lines: string[] = [];

    // Regex: /** ... */ block followed immediately by a declaration line
    const blockRegex = /\/\*\*([\s\S]*?)\*\//g;
    let match: RegExpExecArray | null;

    while ((match = blockRegex.exec(source)) !== null) {
        const commentBody = match[1]
            .split('\n')
            .map((l) => l.replace(/^\s*\*\s?/, '').trimEnd())
            .join('\n')
            .trim();

        if (!commentBody) continue;

        // Look for the declaration on the lines after the comment
        const afterComment = source.slice(match.index + match[0].length);
        const firstLine = afterComment.trimStart().split('\n')[0] ?? '';
        const declarationMatch = firstLine.match(
            /(?:export\s+)?(?:async\s+)?(?:function|class|const|interface|type|enum)\s+([A-Za-z_$][A-Za-z0-9_$]*)/,
        );
        const symbol = declarationMatch?.[1] ?? null;

        if (symbol) {
            lines.push(`## \`${symbol}\``, '', commentBody, '', '---', '');
        } else {
            lines.push(commentBody, '', '---', '');
        }
    }

    if (lines.length === 0) return '';

    return ['# API Reference', '', ...lines].join('\n');
}

// ---------------------------------------------------------------------------
// Python docstring extraction
// ---------------------------------------------------------------------------

function extractPythonDocstrings(source: string): string {
    const lines: string[] = [];

    // Match: def/class line → optional newline → triple-quoted docstring
    // Use [^\n]* instead of [^:]* to handle type annotations containing colons.
    const pyRegex =
        /(?:def|class)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[^\n]*:\s*\n\s*"""([\s\S]*?)"""/g;
    let match: RegExpExecArray | null;

    while ((match = pyRegex.exec(source)) !== null) {
        const symbol = match[1];
        const docstring = match[2].trim();
        lines.push(`## \`${symbol}\``, '', docstring, '', '---', '');
    }

    if (lines.length === 0) return '';

    return ['# API Reference', '', ...lines].join('\n');
}
