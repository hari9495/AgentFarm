// ============================================================================
// Tracker Poller (C4) — task-pull intake.
//
// Push intake (email/slack/webhook) waits for work to arrive. This source lets
// an agent persona *pull* tickets assigned to it from Jira / Linear / GitHub
// Issues and dispatch each as a task — the "agent picks up assigned tickets"
// behaviour a human teammate has.
//
// Design:
//   • Tracker query fns (pollJira/pollLinear/pollGithub) are pure: given a
//     config + token + fetcher they return NormalizedTicket[]. Unit-testable
//     with a capturing fetcher, no DB or network.
//   • runTrackerPollSweep() loads enabled TrackerPollSource rows, resolves the
//     secret-backed token, polls each due source, dedups against
//     TrackerPollDispatch, and dispatches new tickets to agent-runtime.
//   • startTrackerPollSweep() runs it on an interval, mirroring the other
//     trigger-service sweeps.
// ============================================================================

import type { PrismaClient } from '@prisma/client';

export type TrackerKind = 'jira' | 'linear' | 'github' | 'custom';

export type FetchFn = (
    url: string,
    init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<Response>;

/** Configuration for one poll source (mirrors the TrackerPollSource model). */
/**
 * CustomPollSpec — describes how to pull + normalize assigned items from an
 * arbitrary REST tracker, so the platform supports ANY tool the customer uses
 * without per-vendor code (Asana, ClickUp, Azure DevOps, Shortcut, ServiceNow…).
 *
 * Templating: `url`, `body`, and header values support `{{assignee}}`,
 * `{{projectFilter}}`, and `{{baseUrl}}` placeholders, substituted (and, in the
 * URL/query, URL-encoded) at poll time.
 */
export type CustomPollSpec = {
    /** Full URL, or a path appended to `baseUrl`. */
    url: string;
    method?: 'GET' | 'POST';
    /** How the resolved token is attached. Default 'bearer'. */
    auth?: 'bearer' | 'token' | 'raw' | 'header' | 'none';
    /** Header name when auth='header' (e.g. 'X-Api-Key'). */
    authHeaderName?: string;
    /** Extra static headers (values are templated). */
    headers?: Record<string, string>;
    /** Templated request body (e.g. a GraphQL query) for POST. */
    body?: string;
    /** Dot path to the array of items in the response. '' / omitted → top-level array. */
    itemsPath?: string;
    /** Dot path to the stable item id (required for dedup). */
    idField: string;
    /** Dot path to a human title. */
    titleField?: string;
    /** Dot path to a web URL. */
    urlField?: string;
    /** Dot path to a description/body. */
    bodyField?: string;
    /** Optional prefix to make externalId globally unique (e.g. "asana:"). */
    idPrefix?: string;
};

export type PollSourceConfig = {
    id: string;
    tenantId: string;
    agentId?: string | null;
    tracker: TrackerKind;
    baseUrl?: string | null;
    assignee: string;
    projectFilter?: string | null;
    /** Required when tracker='custom'. */
    customConfig?: CustomPollSpec | null;
};

/** A ticket normalized across trackers. */
export type NormalizedTicket = {
    /** Stable per-tracker identity used for dedup (e.g. "PROJ-12", "owner/repo#5"). */
    externalId: string;
    title: string;
    url?: string;
    body?: string;
};

// ---------------------------------------------------------------------------
// Credential resolution
// ---------------------------------------------------------------------------

/** Resolves a secretRef into a raw token string. */
export type CredentialResolver = (secretRef: string | null | undefined) => Promise<string | null>;

/**
 * Default resolver: supports `env://VAR_NAME` refs (dev / VM) and treats any
 * other non-empty value as a literal token. Returns null when unresolvable so
 * the sweep can fail-closed (skip the source) rather than poll unauthenticated.
 */
export const defaultCredentialResolver: CredentialResolver = async (secretRef) => {
    if (!secretRef) return null;
    const envMatch = secretRef.match(/^env:\/\/(.+)$/);
    if (envMatch) {
        return process.env[envMatch[1]!.trim()] ?? null;
    }
    // kv:// / https vault refs are not resolvable here without the Azure SDK;
    // treat anything else as a literal token (operator pasted it directly).
    if (/^(kv:\/\/|https:\/\/)/.test(secretRef)) return null;
    return secretRef;
};

// ---------------------------------------------------------------------------
// Per-tracker query functions (pure)
// ---------------------------------------------------------------------------

const DEFAULT_JIRA_BASE = '';
const DEFAULT_GITHUB_API = 'https://api.github.com';
const LINEAR_GRAPHQL_URL = 'https://api.linear.app/graphql';

/** Jira Cloud/Server: open issues assigned to `assignee`. */
export async function pollJira(
    config: PollSourceConfig,
    token: string,
    fetcher: FetchFn,
): Promise<NormalizedTicket[]> {
    const base = (config.baseUrl ?? DEFAULT_JIRA_BASE).replace(/\/$/, '');
    if (!base) throw new Error('jira poll source requires baseUrl');

    // JQL: assigned to the persona, not yet done, newest first.
    const clauses = [`assignee = "${config.assignee.replace(/"/g, '\\"')}"`, 'statusCategory != Done'];
    if (config.projectFilter) clauses.unshift(`project = "${config.projectFilter.replace(/"/g, '\\"')}"`);
    const jql = clauses.join(' AND ') + ' ORDER BY updated DESC';

    const url = `${base}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=50&fields=summary`;
    const res = await fetcher(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`jira search failed ${res.status}`);
    const data = (await res.json()) as { issues?: Array<{ key?: string; fields?: { summary?: string } }> };
    return (data.issues ?? [])
        .filter((i) => i.key)
        .map((i) => ({
            externalId: i.key!,
            title: i.fields?.summary ?? i.key!,
            url: `${base}/browse/${i.key}`,
        }));
}

/** Linear (GraphQL): open issues assigned to `assignee` (user id or email). */
export async function pollLinear(
    config: PollSourceConfig,
    token: string,
    fetcher: FetchFn,
): Promise<NormalizedTicket[]> {
    const query = `query AssignedIssues($email: String!) {
  issues(filter: { assignee: { email: { eq: $email } }, state: { type: { nin: ["completed", "canceled"] } } }, first: 50) {
    nodes { identifier title url }
  }
}`;
    const res = await fetcher(LINEAR_GRAPHQL_URL, {
        method: 'POST',
        headers: { Authorization: token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { email: config.assignee } }),
    });
    if (!res.ok) throw new Error(`linear query failed ${res.status}`);
    const data = (await res.json()) as {
        data?: { issues?: { nodes?: Array<{ identifier?: string; title?: string; url?: string }> } };
    };
    return (data.data?.issues?.nodes ?? [])
        .filter((n) => n.identifier)
        .map((n) => ({ externalId: n.identifier!, title: n.title ?? n.identifier!, url: n.url }));
}

/** GitHub Issues: open issues assigned to `assignee` in `owner/repo`. */
export async function pollGithub(
    config: PollSourceConfig,
    token: string,
    fetcher: FetchFn,
): Promise<NormalizedTicket[]> {
    const api = (config.baseUrl ?? DEFAULT_GITHUB_API).replace(/\/$/, '');
    const repo = config.projectFilter;
    if (!repo || !repo.includes('/')) {
        throw new Error('github poll source requires projectFilter "owner/repo"');
    }
    const url = `${api}/repos/${repo}/issues?state=open&assignee=${encodeURIComponent(config.assignee)}&per_page=50`;
    const res = await fetcher(url, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'agentfarm-tracker-poller',
        },
    });
    if (!res.ok) throw new Error(`github issues failed ${res.status}`);
    const issues = (await res.json()) as Array<{
        number?: number;
        title?: string;
        html_url?: string;
        body?: string | null;
        pull_request?: unknown;
    }>;
    return (Array.isArray(issues) ? issues : [])
        .filter((i) => typeof i.number === 'number' && !i.pull_request) // exclude PRs
        .map((i) => ({
            externalId: `${repo}#${i.number}`,
            title: i.title ?? `${repo}#${i.number}`,
            url: i.html_url,
            body: i.body ?? undefined,
        }));
}

// ---------------------------------------------------------------------------
// Universal (custom) tracker — any REST API, driven by CustomPollSpec.
// ---------------------------------------------------------------------------

/** Read a value at a dot-path (e.g. "data.issues.0.id"); '' / undefined → root. */
export function getByPath(obj: unknown, path: string | undefined): unknown {
    if (!path) return obj;
    return path.split('.').reduce<unknown>((acc, key) => {
        if (acc == null) return undefined;
        if (Array.isArray(acc)) {
            const idx = Number(key);
            return Number.isInteger(idx) ? acc[idx] : undefined;
        }
        if (typeof acc === 'object') return (acc as Record<string, unknown>)[key];
        return undefined;
    }, obj);
}

/** Substitute {{assignee}} / {{projectFilter}} / {{baseUrl}} placeholders. */
function applyTemplate(input: string, config: PollSourceConfig, encode: boolean): string {
    const sub = (v: string | null | undefined): string => {
        const val = v ?? '';
        return encode ? encodeURIComponent(val) : val;
    };
    return input
        .replace(/\{\{\s*assignee\s*\}\}/g, sub(config.assignee))
        .replace(/\{\{\s*projectFilter\s*\}\}/g, sub(config.projectFilter))
        .replace(/\{\{\s*baseUrl\s*\}\}/g, sub(config.baseUrl));
}

function asStringOrUndefined(v: unknown): string | undefined {
    if (v == null) return undefined;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return undefined;
}

/**
 * pollCustom — generic REST poller. Calls the customer's "list my assigned
 * items" endpoint and maps the JSON to NormalizedTicket[] via the field map.
 * Works for any tracker without bespoke code.
 */
export async function pollCustom(
    config: PollSourceConfig,
    token: string,
    fetcher: FetchFn,
): Promise<NormalizedTicket[]> {
    const spec = config.customConfig;
    if (!spec || !spec.url || !spec.idField) {
        throw new Error('custom poll source requires customConfig with url and idField');
    }

    // Resolve URL: absolute, or appended to baseUrl. Template + encode query parts.
    const rawUrl = /^https?:\/\//.test(spec.url)
        ? spec.url
        : `${(config.baseUrl ?? '').replace(/\/$/, '')}${spec.url.startsWith('/') ? '' : '/'}${spec.url}`;
    const url = applyTemplate(rawUrl, config, true);

    // Auth header.
    const headers: Record<string, string> = { Accept: 'application/json' };
    const auth = spec.auth ?? 'bearer';
    if (auth === 'bearer') headers['Authorization'] = `Bearer ${token}`;
    else if (auth === 'token') headers['Authorization'] = `token ${token}`;
    else if (auth === 'raw') headers['Authorization'] = token;
    else if (auth === 'header') headers[spec.authHeaderName || 'X-Api-Key'] = token;
    // auth === 'none' → no auth header
    for (const [k, v] of Object.entries(spec.headers ?? {})) {
        headers[k] = applyTemplate(v, config, false);
    }

    const method = spec.method ?? 'GET';
    const body = spec.body ? applyTemplate(spec.body, config, false) : undefined;
    if (body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';

    const res = await fetcher(url, { method, headers, body });
    if (!res.ok) throw new Error(`custom tracker request failed ${res.status}`);

    const json = await res.json();
    const itemsRaw = getByPath(json, spec.itemsPath);
    const items = Array.isArray(itemsRaw) ? itemsRaw : [];

    const tickets: NormalizedTicket[] = [];
    for (const item of items) {
        const id = asStringOrUndefined(getByPath(item, spec.idField));
        if (!id) continue; // no stable id → can't dedup; skip
        const externalId = `${spec.idPrefix ?? ''}${id}`;
        tickets.push({
            externalId,
            title: asStringOrUndefined(getByPath(item, spec.titleField)) ?? externalId,
            url: asStringOrUndefined(getByPath(item, spec.urlField)),
            body: asStringOrUndefined(getByPath(item, spec.bodyField)),
        });
    }
    return tickets;
}

/** Dispatch to the right tracker query. */
export async function pollTracker(
    config: PollSourceConfig,
    token: string,
    fetcher: FetchFn,
): Promise<NormalizedTicket[]> {
    switch (config.tracker) {
        case 'jira':
            return pollJira(config, token, fetcher);
        case 'linear':
            return pollLinear(config, token, fetcher);
        case 'github':
            return pollGithub(config, token, fetcher);
        case 'custom':
            return pollCustom(config, token, fetcher);
        default:
            throw new Error(`unsupported tracker: ${config.tracker as string}`);
    }
}

// ---------------------------------------------------------------------------
// Sweep
// ---------------------------------------------------------------------------

export type TrackerPollDeps = {
    fetcher?: FetchFn;
    resolveCredentials?: CredentialResolver;
    /** agent-runtime base URL for /run-task dispatch. */
    agentRuntimeUrl?: string;
    now?: () => Date;
};

export type TrackerPollSweepResult = {
    polled: number;
    dispatched: number;
    skipped: number;
    errors: number;
};

export async function runTrackerPollSweep(
    prisma: PrismaClient,
    deps: TrackerPollDeps = {},
): Promise<TrackerPollSweepResult> {
    const fetcher = deps.fetcher ?? ((url, init) => fetch(url, init as RequestInit));
    const resolveCredentials = deps.resolveCredentials ?? defaultCredentialResolver;
    const now = deps.now ? deps.now() : new Date();
    const runtimeUrl = (deps.agentRuntimeUrl ?? process.env['AGENT_RUNTIME_URL'] ?? 'http://localhost:4000').replace(
        /\/+$/,
        '',
    );
    const runTaskUrl = `${runtimeUrl}/run-task`;

    const result: TrackerPollSweepResult = { polled: 0, dispatched: 0, skipped: 0, errors: 0 };

    let sources: Array<PollSourceConfig & { secretRef: string | null; intervalSec: number; lastPolledAt: Date | null }>;
    try {
        sources = (await (prisma as any).trackerPollSource.findMany({
            where: { enabled: true },
        })) as typeof sources;
    } catch (err) {
        console.error('[tracker-poller] failed to load sources:', err);
        return result;
    }

    for (const source of sources) {
        // Respect per-source cadence.
        if (source.lastPolledAt) {
            const dueAt = source.lastPolledAt.getTime() + Math.max(source.intervalSec, 30) * 1000;
            if (now.getTime() < dueAt) {
                result.skipped += 1;
                continue;
            }
        }

        const config: PollSourceConfig = {
            id: source.id,
            tenantId: source.tenantId,
            agentId: source.agentId,
            tracker: source.tracker,
            baseUrl: source.baseUrl,
            assignee: source.assignee,
            projectFilter: source.projectFilter,
            customConfig: (source as { customConfig?: CustomPollSpec | null }).customConfig ?? null,
        };

        // A custom source with auth='none' (public/unauthenticated tracker)
        // legitimately needs no token; everything else fails closed without one.
        const authless = config.tracker === 'custom' && config.customConfig?.auth === 'none';

        let lastError: string | null = null;
        try {
            const token = await resolveCredentials(source.secretRef);
            if (!token && !authless) {
                throw new Error('credentials unavailable (secretRef did not resolve to a token)');
            }

            const tickets = await pollTracker(config, token ?? '', fetcher);
            result.polled += 1;

            // Dedup: which externalIds have we already dispatched for this source?
            const externalIds = tickets.map((t) => t.externalId);
            const seen =
                externalIds.length === 0
                    ? []
                    : ((await (prisma as any).trackerPollDispatch.findMany({
                          where: { sourceId: source.id, externalId: { in: externalIds } },
                          select: { externalId: true },
                      })) as Array<{ externalId: string }>);
            const seenSet = new Set(seen.map((s) => s.externalId));

            for (const ticket of tickets) {
                if (seenSet.has(ticket.externalId)) continue;
                const dispatched = await dispatchTicket(
                    fetcher,
                    runTaskUrl,
                    config,
                    ticket,
                );
                if (!dispatched.ok) {
                    lastError = dispatched.error ?? 'dispatch failed';
                    result.errors += 1;
                    continue; // do NOT record dispatch → retried next sweep
                }
                // Record dispatch for dedup. Unique constraint guards races.
                try {
                    await (prisma as any).trackerPollDispatch.create({
                        data: {
                            sourceId: source.id,
                            tenantId: source.tenantId,
                            tracker: source.tracker,
                            externalId: ticket.externalId,
                            title: ticket.title,
                        },
                    });
                    result.dispatched += 1;
                } catch {
                    // Likely a unique-constraint race with a concurrent sweep — fine.
                }
            }
        } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
            result.errors += 1;
            console.error(`[tracker-poller] source ${source.id} (${source.tracker}) failed:`, lastError);
        }

        // Advance the cursor regardless so a failing source doesn't hot-loop.
        try {
            await (prisma as any).trackerPollSource.update({
                where: { id: source.id },
                data: { lastPolledAt: now, lastError },
            });
        } catch (err) {
            console.error(`[tracker-poller] failed to update cursor for ${source.id}:`, err);
        }
    }

    return result;
}

async function dispatchTicket(
    fetcher: FetchFn,
    runTaskUrl: string,
    config: PollSourceConfig,
    ticket: NormalizedTicket,
): Promise<{ ok: boolean; error?: string }> {
    const taskLines = [
        `You have been assigned ${config.tracker} ticket ${ticket.externalId}: ${ticket.title}`,
    ];
    if (ticket.url) taskLines.push(`Link: ${ticket.url}`);
    if (ticket.body) taskLines.push('', ticket.body);

    try {
        const res = await fetcher(runTaskUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                tenantId: config.tenantId,
                agentId: config.agentId ?? undefined,
                task: taskLines.join('\n'),
                goal: taskLines.join('\n'),
                source: `tracker:${config.tracker}`,
                triggeredBy: 'tracker_poll',
                externalRef: ticket.externalId,
            }),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            return { ok: false, error: `run-task ${res.status}: ${body.slice(0, 200)}` };
        }
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

// ---------------------------------------------------------------------------
// Interval runner
// ---------------------------------------------------------------------------

export function startTrackerPollSweep(
    prisma: PrismaClient,
    deps: TrackerPollDeps = {},
    intervalMs = 60_000,
): NodeJS.Timeout {
    runTrackerPollSweep(prisma, deps).catch(console.error);
    return setInterval(() => {
        runTrackerPollSweep(prisma, deps).catch(console.error);
    }, intervalMs);
}
