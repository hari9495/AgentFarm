/**
 * OpenAPI → agent tool catalog (C6).
 *
 * Lets a Custom API (generic REST) connector become *self-describing*, the same way an
 * MCP server is. A customer attaches an OpenAPI 3.x spec when they create the connector;
 * we parse it into a flat list of operations the agent can reason over (name, description,
 * method, path template, params), exactly mirroring MCP's tools/list. At execution time the
 * agent picks an operation by name + supplies args; `resolveOperation` turns that into the
 * concrete { method, path, query, body } the existing custom_api executor already accepts.
 *
 * This is the linchpin of universal integration: with it, the agent can autonomously drive
 * ANY REST API the customer describes — not just APIs whose exact endpoints it was told.
 *
 * Pure functions, no I/O — fully unit-testable.
 */

export type CustomApiTool = {
    /** Stable identifier the agent calls (operationId, else `METHOD /path`). */
    name: string;
    /** Human/LLM-readable description (summary + description from the spec). */
    description: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    /** Path template with `{param}` placeholders, relative to the connector base_url. */
    path: string;
    /** Names of `{param}` placeholders that must be supplied in args. */
    pathParams: string[];
    /** Query parameter names defined by the operation. */
    queryParams: string[];
    /** Params (path or required query) the agent MUST provide. */
    requiredParams: string[];
    /** Whether the operation accepts a request body. */
    hasBody: boolean;
};

type OpenApiParameter = {
    name?: unknown;
    in?: unknown;
    required?: unknown;
};

type OpenApiOperation = {
    operationId?: unknown;
    summary?: unknown;
    description?: unknown;
    parameters?: unknown;
    requestBody?: unknown;
};

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

const extractPathParams = (path: string): string[] => {
    const out: string[] = [];
    const re = /\{([^}]+)\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(path)) !== null) {
        if (m[1]) out.push(m[1]);
    }
    return out;
};

const toToolName = (operationId: string | null, method: string, path: string): string =>
    operationId && operationId.trim() ? operationId.trim() : `${method.toUpperCase()} ${path}`;

/**
 * Parse an OpenAPI 3.x document (already JSON-parsed) into a flat tool catalog.
 * Tolerant of partial specs: skips malformed operations rather than throwing.
 */
export const parseOpenApiToToolCatalog = (spec: unknown): CustomApiTool[] => {
    if (!spec || typeof spec !== 'object') return [];
    const paths = (spec as { paths?: unknown }).paths;
    if (!paths || typeof paths !== 'object') return [];

    const tools: CustomApiTool[] = [];
    const seenNames = new Set<string>();

    for (const [rawPath, pathItem] of Object.entries(paths as Record<string, unknown>)) {
        if (!pathItem || typeof pathItem !== 'object') continue;
        const path = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
        const pathParams = extractPathParams(path);

        for (const method of HTTP_METHODS) {
            const op = (pathItem as Record<string, unknown>)[method] as OpenApiOperation | undefined;
            if (!op || typeof op !== 'object') continue;

            const parameters = Array.isArray(op.parameters) ? (op.parameters as OpenApiParameter[]) : [];
            const queryParams: string[] = [];
            const requiredParams: string[] = [...pathParams]; // path params are always required
            for (const p of parameters) {
                const pname = typeof p?.name === 'string' ? p.name : null;
                if (!pname) continue;
                if (p.in === 'query') {
                    queryParams.push(pname);
                    if (p.required === true) requiredParams.push(pname);
                }
            }

            const operationId = typeof op.operationId === 'string' ? op.operationId : null;
            let name = toToolName(operationId, method, path);
            // Guarantee uniqueness within the catalog.
            if (seenNames.has(name)) {
                let i = 2;
                while (seenNames.has(`${name}#${i}`)) i += 1;
                name = `${name}#${i}`;
            }
            seenNames.add(name);

            const summary = typeof op.summary === 'string' ? op.summary : '';
            const description = typeof op.description === 'string' ? op.description : '';
            const fullDescription = [summary, description].filter(Boolean).join(' — ') || name;

            tools.push({
                name,
                description: fullDescription,
                method: method.toUpperCase() as CustomApiTool['method'],
                path,
                pathParams,
                queryParams,
                requiredParams: Array.from(new Set(requiredParams)),
                hasBody: op.requestBody !== undefined && op.requestBody !== null,
            });
        }
    }

    return tools;
};

export type ResolvedRequest = {
    method: string;
    /** Path with placeholders substituted and query string appended. */
    path: string;
    /** Request body (undefined for GET/HEAD or when no body args remain). */
    body?: Record<string, unknown>;
};

export type ResolveResult =
    | { ok: true; request: ResolvedRequest }
    | { ok: false; error: string };

/**
 * Resolve a chosen operation + agent-supplied args into a concrete request the custom_api
 * executor understands. Path params fill `{placeholders}`, declared query params go to the
 * query string, everything else becomes the JSON body (for non-GET methods).
 */
export const resolveOperation = (
    tool: CustomApiTool,
    args: Record<string, unknown>,
): ResolveResult => {
    // Validate required params are present.
    const missing = tool.requiredParams.filter(
        (p) => args[p] === undefined || args[p] === null || args[p] === '',
    );
    if (missing.length > 0) {
        return { ok: false, error: `Missing required parameter(s): ${missing.join(', ')}` };
    }

    // Substitute path params.
    let path = tool.path;
    for (const p of tool.pathParams) {
        path = path.replace(`{${p}}`, encodeURIComponent(String(args[p])));
    }

    // Build query string from declared query params present in args.
    const usedKeys = new Set<string>([...tool.pathParams]);
    const query = new URLSearchParams();
    for (const q of tool.queryParams) {
        if (args[q] !== undefined && args[q] !== null) {
            query.set(q, String(args[q]));
            usedKeys.add(q);
        }
    }
    const queryString = query.toString();
    if (queryString) path = `${path}?${queryString}`;

    // Remaining args become the body for methods that allow one.
    const isBodyless = tool.method === 'GET' || tool.method === 'DELETE';
    let body: Record<string, unknown> | undefined;
    if (!isBodyless && tool.hasBody) {
        const bodyEntries = Object.entries(args).filter(([k]) => !usedKeys.has(k));
        if (bodyEntries.length > 0) body = Object.fromEntries(bodyEntries);
    }

    return { ok: true, request: { method: tool.method, path, body } };
};
