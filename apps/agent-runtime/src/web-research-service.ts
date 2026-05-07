/**
 * Feature #1 — Web Research Service
 * Frozen 2026-05-07
 *
 * Gives the agent read-only access to a curated allowlist of technical
 * documentation sources.  When the execution engine hits an error it cannot
 * resolve after 2 retries it calls researchForTask() before escalating —
 * exactly what a human developer does (Google the error before asking for help).
 *
 * Security posture:
 *   - Only URLs in ALLOWED_SOURCES may be fetched; no arbitrary open-web access.
 *   - Each source has a sanitised base-URL prefix; paths that escape the prefix
 *     are rejected.
 *   - Responses are truncated to MAX_RESPONSE_BYTES to prevent prompt injection
 *     via massive payloads.
 *   - A per-workspace rate limiter (max 10 fetches / minute) prevents cost runaway.
 */

import { randomUUID } from 'node:crypto';
import type {
    WebResearchQuery,
    WebResearchResult,
    WebResearchResultItem,
    WebResearchSource,
    WebResearchIntent,
} from '@agentfarm/shared-types';
import { CONTRACT_VERSIONS } from '@agentfarm/shared-types';

export type { WebResearchQuery, WebResearchResult, WebResearchSource, WebResearchIntent };

// ── Allowed source registry ──────────────────────────────────────────────────

const SOURCE_REGISTRY: Record<WebResearchSource, { baseUrl: string; displayName: string }> = {
    npm_registry: { baseUrl: 'https://registry.npmjs.org', displayName: 'npm Registry' },
    mdn: { baseUrl: 'https://developer.mozilla.org/en-US', displayName: 'MDN Web Docs' },
    github_issues: { baseUrl: 'https://github.com', displayName: 'GitHub Issues' },
    typescript_docs: { baseUrl: 'https://www.typescriptlang.org/docs', displayName: 'TypeScript Docs' },
    nodejs_docs: { baseUrl: 'https://nodejs.org/en/docs', displayName: 'Node.js Docs' },
    prisma_docs: { baseUrl: 'https://www.prisma.io/docs', displayName: 'Prisma Docs' },
    react_docs: { baseUrl: 'https://react.dev', displayName: 'React Docs' },
    azure_docs: { baseUrl: 'https://learn.microsoft.com/en-us/azure', displayName: 'Azure Docs' },
};

const MAX_RESPONSE_BYTES = 8_192;
const MAX_RESULTS = 5;

// ── Intent → default sources mapping ────────────────────────────────────────

const INTENT_DEFAULT_SOURCES: Record<WebResearchIntent, WebResearchSource[]> = {
    error_lookup: ['npm_registry', 'github_issues', 'nodejs_docs'],
    docs_lookup: ['mdn', 'typescript_docs', 'nodejs_docs'],
    package_info: ['npm_registry'],
    stackoverflow: ['github_issues', 'mdn'],
};

// ── Fetch abstraction (injectable for tests) ─────────────────────────────────

export type FetchFn = (url: string) => Promise<{ text: () => Promise<string>; ok: boolean; status: number }>;

// ── Per-workspace rate limiter ───────────────────────────────────────────────

const rateLimitWindows = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(workspaceId: string): boolean {
    const now = Date.now();
    const window = rateLimitWindows.get(workspaceId);
    if (!window || now - window.windowStart > RATE_LIMIT_WINDOW_MS) {
        rateLimitWindows.set(workspaceId, { count: 1, windowStart: now });
        return true;
    }
    if (window.count >= RATE_LIMIT_MAX) return false;
    window.count += 1;
    return true;
}

// ── URL validation ────────────────────────────────────────────────────────────

function isAllowedUrl(url: string, source: WebResearchSource): boolean {
    const registry = SOURCE_REGISTRY[source];
    return url.startsWith(registry.baseUrl);
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function fetchAndSummarise(
    url: string,
    source: WebResearchSource,
    fetchFn: FetchFn,
): Promise<{ text: string; ok: boolean }> {
    if (!isAllowedUrl(url, source)) {
        return { text: '', ok: false };
    }

    try {
        const response = await fetchFn(url);
        if (!response.ok) return { text: '', ok: false };
        const raw = await response.text();
        // Truncate to prevent prompt injection via massive docs pages
        const truncated = raw.slice(0, MAX_RESPONSE_BYTES);
        return { text: truncated, ok: true };
    } catch {
        return { text: '', ok: false };
    }
}

// ── Query builder for each intent ────────────────────────────────────────────

function buildLookupUrl(intent: WebResearchIntent, query: string, source: WebResearchSource): string {
    const base = SOURCE_REGISTRY[source].baseUrl;
    const encoded = encodeURIComponent(query);
    switch (source) {
        case 'npm_registry':
            // Direct package or search endpoint
            return `${base}/-/v1/search?text=${encoded}&size=3`;
        case 'mdn':
            return `${base}/search?q=${encoded}`;
        case 'github_issues':
            return `${base}/search?q=${encoded}&type=issues`;
        case 'typescript_docs':
            return `${base}/search?q=${encoded}`;
        case 'nodejs_docs':
            return `${base}/api/search?query=${encoded}`;
        case 'prisma_docs':
            return `${base}/search?q=${encoded}`;
        case 'react_docs':
            return `${base}/search?q=${encoded}`;
        case 'azure_docs':
            return `${base}/search?search=${encoded}`;
        default:
            return `${base}?q=${encoded}`;
    }
}

// ── Synthesiser ──────────────────────────────────────────────────────────────
// In production this delegates to an LLM call; here we produce a deterministic
// summary from the raw text so the service is testable without live LLM calls.

export type SynthesiseFn = (query: string, snippets: string[]) => Promise<string>;

export const defaultSynthesise: SynthesiseFn = async (query, snippets) => {
    if (snippets.length === 0) return `No results found for: ${query}`;
    const combined = snippets.join('\n\n').slice(0, 2_000);
    return `Research summary for "${query}":\n${combined}`;
};

// ── Public API ────────────────────────────────────────────────────────────────

export interface ResearchContext {
    tenantId: string;
    workspaceId: string;
    taskId: string;
    correlationId: string;
}

/**
 * Main entry point: research an error message or query before escalating.
 * Falls back to an empty result if rate-limited or all fetches fail.
 */
export async function researchForTask(
    query: WebResearchQuery,
    ctx: ResearchContext,
    fetchFn: FetchFn,
    synthesise: SynthesiseFn = defaultSynthesise,
): Promise<WebResearchResult> {
    const sources = query.allowedSources.length > 0
        ? query.allowedSources
        : INTENT_DEFAULT_SOURCES[query.intent];

    const allowed = checkRateLimit(ctx.workspaceId);
    const resultItems: WebResearchResultItem[] = [];
    const snippets: string[] = [];

    if (allowed) {
        const limit = Math.min(query.maxResults, MAX_RESULTS);
        for (const source of sources.slice(0, limit)) {
            const url = buildLookupUrl(query.intent, query.query, source);
            const { text, ok } = await fetchAndSummarise(url, source, fetchFn);
            if (ok && text) {
                resultItems.push({
                    url,
                    source,
                    summary: text.slice(0, 512),
                    relevance: 0.8, // placeholder — production uses embedding similarity
                });
                snippets.push(text);
            }
        }
    }

    const synthesizedAnswer = await synthesise(query.query, snippets);

    return {
        id: randomUUID(),
        contractVersion: CONTRACT_VERSIONS.WEB_RESEARCH,
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId,
        taskId: ctx.taskId,
        query,
        sources: resultItems,
        synthesizedAnswer,
        usedInDecision: false,
        fetchedAt: new Date().toISOString(),
        correlationId: ctx.correlationId,
    };
}

/**
 * Convenience builder for error-lookup queries.
 */
export function buildErrorQuery(
    errorMessage: string,
    allowedSources: WebResearchSource[] = [],
): WebResearchQuery {
    return {
        query: errorMessage,
        intent: 'error_lookup',
        allowedSources,
        maxResults: 3,
    };
}
