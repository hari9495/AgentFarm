import test from 'node:test';
import assert from 'node:assert/strict';
import {
    pollJira,
    pollLinear,
    pollGithub,
    pollCustom,
    getByPath,
    defaultCredentialResolver,
    runTrackerPollSweep,
    type PollSourceConfig,
    type FetchFn,
} from './tracker-poller.js';

// ---------------------------------------------------------------------------
// Capturing fetcher helper
// ---------------------------------------------------------------------------

type Capture = { url: string; init?: Parameters<FetchFn>[1] };

const captureFetcher = (
    responseBody: unknown,
    opts: { ok?: boolean; status?: number } = {},
): { fetcher: FetchFn; calls: Capture[] } => {
    const calls: Capture[] = [];
    const fetcher: FetchFn = async (url, init) => {
        calls.push({ url, init });
        return {
            ok: opts.ok ?? true,
            status: opts.status ?? 200,
            json: async () => responseBody,
            text: async () => JSON.stringify(responseBody),
        } as unknown as Response;
    };
    return { fetcher, calls };
};

const jiraConfig: PollSourceConfig = {
    id: 's_jira',
    tenantId: 't1',
    agentId: 'agent_1',
    tracker: 'jira',
    baseUrl: 'https://acme.atlassian.net',
    assignee: 'dev@acme.io',
    projectFilter: 'PROJ',
};

// ---------------------------------------------------------------------------
// 1. pollJira — builds JQL + Bearer auth, normalizes issues
// ---------------------------------------------------------------------------
test('pollJira — builds JQL, uses Bearer auth, normalizes issues', async () => {
    const { fetcher, calls } = captureFetcher({
        issues: [{ key: 'PROJ-1', fields: { summary: 'Fix login' } }],
    });
    const tickets = await pollJira(jiraConfig, 'tok123', fetcher);

    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/rest\/api\/3\/search\?jql=/);
    assert.match(decodeURIComponent(calls[0]!.url), /assignee = "dev@acme.io"/);
    assert.match(decodeURIComponent(calls[0]!.url), /project = "PROJ"/);
    assert.match(decodeURIComponent(calls[0]!.url), /statusCategory != Done/);
    assert.equal(calls[0]!.init?.headers?.['Authorization'], 'Bearer tok123');
    assert.deepEqual(tickets, [
        { externalId: 'PROJ-1', title: 'Fix login', url: 'https://acme.atlassian.net/browse/PROJ-1' },
    ]);
});

// 2. pollJira — throws without baseUrl
test('pollJira — throws when baseUrl is missing', async () => {
    await assert.rejects(
        () => pollJira({ ...jiraConfig, baseUrl: null }, 'tok', captureFetcher({}).fetcher),
        /requires baseUrl/,
    );
});

// 3. pollJira — non-2xx throws
test('pollJira — throws on non-2xx', async () => {
    const { fetcher } = captureFetcher({}, { ok: false, status: 403 });
    await assert.rejects(() => pollJira(jiraConfig, 'tok', fetcher), /jira search failed 403/);
});

// ---------------------------------------------------------------------------
// 4. pollLinear — GraphQL POST with raw Authorization
// ---------------------------------------------------------------------------
test('pollLinear — posts GraphQL with raw Authorization, normalizes nodes', async () => {
    const { fetcher, calls } = captureFetcher({
        data: { issues: { nodes: [{ identifier: 'ENG-5', title: 'Ship API', url: 'https://linear.app/x/ENG-5' }] } },
    });
    const tickets = await pollLinear(
        { id: 's', tenantId: 't1', tracker: 'linear', assignee: 'dev@acme.io' },
        'lin_key',
        fetcher,
    );

    assert.equal(calls[0]!.url, 'https://api.linear.app/graphql');
    assert.equal(calls[0]!.init?.method, 'POST');
    assert.equal(calls[0]!.init?.headers?.['Authorization'], 'lin_key');
    assert.match(calls[0]!.init?.body ?? '', /dev@acme.io/);
    assert.deepEqual(tickets, [
        { externalId: 'ENG-5', title: 'Ship API', url: 'https://linear.app/x/ENG-5' },
    ]);
});

// ---------------------------------------------------------------------------
// 5. pollGithub — owner/repo issues, excludes PRs
// ---------------------------------------------------------------------------
test('pollGithub — lists assigned issues and excludes pull requests', async () => {
    const { fetcher, calls } = captureFetcher([
        { number: 7, title: 'Bug', html_url: 'https://github.com/o/r/issues/7', body: 'details' },
        { number: 8, title: 'A PR', html_url: 'https://github.com/o/r/pull/8', pull_request: { url: 'x' } },
    ]);
    const tickets = await pollGithub(
        { id: 's', tenantId: 't1', tracker: 'github', assignee: 'octocat', projectFilter: 'o/r' },
        'gh_tok',
        fetcher,
    );

    assert.match(calls[0]!.url, /\/repos\/o\/r\/issues\?state=open&assignee=octocat/);
    assert.equal(calls[0]!.init?.headers?.['Authorization'], 'Bearer gh_tok');
    assert.equal(tickets.length, 1);
    assert.deepEqual(tickets[0], {
        externalId: 'o/r#7',
        title: 'Bug',
        url: 'https://github.com/o/r/issues/7',
        body: 'details',
    });
});

// 6. pollGithub — throws without owner/repo
test('pollGithub — throws when projectFilter is not owner/repo', async () => {
    await assert.rejects(
        () =>
            pollGithub(
                { id: 's', tenantId: 't1', tracker: 'github', assignee: 'octocat', projectFilter: 'norepo' },
                'tok',
                captureFetcher([]).fetcher,
            ),
        /owner\/repo/,
    );
});

// ---------------------------------------------------------------------------
// Universal (custom) tracker
// ---------------------------------------------------------------------------

// 6b. getByPath — dot paths into nested objects/arrays
test('getByPath — resolves nested dot paths and array indices', () => {
    const obj = { data: { items: [{ id: 'X1' }, { id: 'X2' }] } };
    assert.equal(getByPath(obj, 'data.items.1.id'), 'X2');
    assert.equal(getByPath(obj, ''), obj);
    assert.equal(getByPath(obj, 'data.missing.deep'), undefined);
});

// 6c. pollCustom — maps an arbitrary REST tracker (e.g. Asana-shaped) via field map
test('pollCustom — fetches and normalizes any REST tracker via field map', async () => {
    const { fetcher, calls } = captureFetcher({
        data: [
            { gid: '111', name: 'Write spec', permalink_url: 'https://app.asana.com/0/1/111', notes: 'do it' },
            { gid: '222', name: 'Review PR', permalink_url: 'https://app.asana.com/0/1/222' },
        ],
    });
    const config: PollSourceConfig = {
        id: 's_custom',
        tenantId: 't1',
        tracker: 'custom',
        baseUrl: 'https://app.asana.com/api/1.0',
        assignee: 'me@acme.io',
        projectFilter: '99',
        customConfig: {
            url: '/tasks?assignee={{assignee}}&project={{projectFilter}}&completed_since=now',
            auth: 'bearer',
            itemsPath: 'data',
            idField: 'gid',
            titleField: 'name',
            urlField: 'permalink_url',
            bodyField: 'notes',
            idPrefix: 'asana:',
        },
    };

    const tickets = await pollCustom(config, 'asana_tok', fetcher);

    // URL built from baseUrl + templated, encoded query
    assert.match(calls[0]!.url, /^https:\/\/app\.asana\.com\/api\/1\.0\/tasks\?assignee=me%40acme\.io&project=99/);
    assert.equal(calls[0]!.init?.headers?.['Authorization'], 'Bearer asana_tok');
    assert.deepEqual(tickets, [
        { externalId: 'asana:111', title: 'Write spec', url: 'https://app.asana.com/0/1/111', body: 'do it' },
        { externalId: 'asana:222', title: 'Review PR', url: 'https://app.asana.com/0/1/222', body: undefined },
    ]);
});

// 6d. pollCustom — header auth + top-level array + POST body templating
test('pollCustom — supports header auth, POST body, and top-level array', async () => {
    const { fetcher, calls } = captureFetcher([{ id: 9, title: 'T' }]);
    const config: PollSourceConfig = {
        id: 's',
        tenantId: 't1',
        tracker: 'custom',
        baseUrl: 'https://api.example.com',
        assignee: 'u-1',
        customConfig: {
            url: '/search',
            method: 'POST',
            auth: 'header',
            authHeaderName: 'X-Api-Key',
            body: '{"assignee":"{{assignee}}"}',
            idField: 'id',
            titleField: 'title',
        },
    };

    const tickets = await pollCustom(config, 'k3y', fetcher);

    assert.equal(calls[0]!.init?.method, 'POST');
    assert.equal(calls[0]!.init?.headers?.['X-Api-Key'], 'k3y');
    assert.equal(calls[0]!.init?.headers?.['Content-Type'], 'application/json');
    assert.equal(calls[0]!.init?.body, '{"assignee":"u-1"}');
    assert.deepEqual(tickets, [{ externalId: '9', title: 'T', url: undefined, body: undefined }]);
});

// 6e. pollCustom — requires url + idField
test('pollCustom — throws without url/idField config', async () => {
    await assert.rejects(
        () =>
            pollCustom(
                { id: 's', tenantId: 't1', tracker: 'custom', assignee: 'a', customConfig: null },
                'tok',
                captureFetcher({}).fetcher,
            ),
        /requires customConfig/,
    );
});

// 6f. pollCustom — skips items with no id (can't dedup)
test('pollCustom — skips items missing the id field', async () => {
    const { fetcher } = captureFetcher([{ name: 'no id here' }, { ref: 'A', name: 'ok' }]);
    const tickets = await pollCustom(
        {
            id: 's',
            tenantId: 't1',
            tracker: 'custom',
            assignee: 'a',
            customConfig: { url: 'https://x/list', idField: 'ref', titleField: 'name' },
        },
        'tok',
        fetcher,
    );
    assert.deepEqual(tickets, [{ externalId: 'A', title: 'ok', url: undefined, body: undefined }]);
});

// ---------------------------------------------------------------------------
// 7. defaultCredentialResolver — env:// and literal and unresolvable kv://
// ---------------------------------------------------------------------------
test('defaultCredentialResolver — resolves env://, literals, fails on kv://', async () => {
    process.env['TRACKER_TEST_TOK'] = 'secret-value';
    assert.equal(await defaultCredentialResolver('env://TRACKER_TEST_TOK'), 'secret-value');
    assert.equal(await defaultCredentialResolver('raw-literal'), 'raw-literal');
    assert.equal(await defaultCredentialResolver('kv://vault/secrets/x'), null);
    assert.equal(await defaultCredentialResolver(null), null);
    delete process.env['TRACKER_TEST_TOK'];
});

// ---------------------------------------------------------------------------
// Mock prisma for sweep tests
// ---------------------------------------------------------------------------

const makeSweepPrisma = (
    sources: any[],
    seen: Array<{ externalId: string }> = [],
    persona: { timezone: string; workingHours: unknown } | null = null,
) => {
    const dispatchCreates: any[] = [];
    const sourceUpdates: any[] = [];
    const deferredCreates: any[] = [];
    const prisma = {
        trackerPollSource: {
            findMany: async () => sources.filter((s) => s.enabled),
            update: async (args: any) => {
                sourceUpdates.push(args);
                return {};
            },
        },
        trackerPollDispatch: {
            findMany: async () => seen,
            create: async (args: any) => {
                dispatchCreates.push(args);
                return {};
            },
        },
        agentPersona: {
            findUnique: async () => persona,
        },
        deferredTask: {
            create: async (args: any) => {
                deferredCreates.push(args);
                return { id: `def_${deferredCreates.length}` };
            },
        },
    } as any;
    return { prisma, dispatchCreates, sourceUpdates, deferredCreates };
};

// 8. sweep — dispatches new tickets, records dedup rows, advances cursor
test('runTrackerPollSweep — dispatches new tickets and records dedup', async () => {
    const source = {
        id: 's_jira',
        tenantId: 't1',
        agentId: 'agent_1',
        tracker: 'jira',
        baseUrl: 'https://acme.atlassian.net',
        assignee: 'dev@acme.io',
        projectFilter: null,
        secretRef: 'env://TRACKER_SWEEP_TOK',
        enabled: true,
        intervalSec: 300,
        lastPolledAt: null,
    };
    process.env['TRACKER_SWEEP_TOK'] = 'tok';
    const { prisma, dispatchCreates, sourceUpdates } = makeSweepPrisma([source]);

    // Two calls: tracker search, then run-task dispatch.
    const calls: Capture[] = [];
    const fetcher: FetchFn = async (url, init) => {
        calls.push({ url, init });
        if (url.includes('/rest/api/3/search')) {
            return { ok: true, status: 200, json: async () => ({ issues: [{ key: 'PROJ-9', fields: { summary: 'Do it' } }] }) } as any;
        }
        return { ok: true, status: 200, text: async () => 'ok' } as any;
    };

    const result = await runTrackerPollSweep(prisma, { fetcher, agentRuntimeUrl: 'http://rt' });

    assert.equal(result.polled, 1);
    assert.equal(result.dispatched, 1);
    assert.equal(result.errors, 0);
    // run-task POST happened
    const runTaskCall = calls.find((c) => c.url === 'http://rt/run-task');
    assert.ok(runTaskCall, 'should POST to run-task');
    const payload = JSON.parse(runTaskCall!.init!.body!);
    assert.equal(payload.tenantId, 't1');
    assert.equal(payload.agentId, 'agent_1');
    assert.equal(payload.triggeredBy, 'tracker_poll');
    // runtime parses `goal` as JSON; metadata is packed there
    const goal = JSON.parse(payload.goal);
    assert.equal(goal.externalRef, 'PROJ-9');
    assert.equal(goal.source, 'tracker:jira');
    // dedup row + cursor advanced
    assert.equal(dispatchCreates.length, 1);
    assert.equal(dispatchCreates[0].data.externalId, 'PROJ-9');
    assert.equal(sourceUpdates.length, 1);
    assert.ok(sourceUpdates[0].data.lastPolledAt instanceof Date);
    delete process.env['TRACKER_SWEEP_TOK'];
});

// 9. sweep — skips already-dispatched tickets (dedup)
test('runTrackerPollSweep — does not re-dispatch a seen ticket', async () => {
    const source = {
        id: 's_jira',
        tenantId: 't1',
        agentId: null,
        tracker: 'jira',
        baseUrl: 'https://acme.atlassian.net',
        assignee: 'dev@acme.io',
        projectFilter: null,
        secretRef: 'literal-tok',
        enabled: true,
        intervalSec: 300,
        lastPolledAt: null,
    };
    const { prisma, dispatchCreates } = makeSweepPrisma([source], [{ externalId: 'PROJ-9' }]);

    let runTaskCalled = false;
    const fetcher: FetchFn = async (url) => {
        if (url.includes('/search')) {
            return { ok: true, status: 200, json: async () => ({ issues: [{ key: 'PROJ-9', fields: { summary: 'x' } }] }) } as any;
        }
        runTaskCalled = true;
        return { ok: true, status: 200, text: async () => 'ok' } as any;
    };

    const result = await runTrackerPollSweep(prisma, { fetcher });

    assert.equal(result.dispatched, 0);
    assert.equal(runTaskCalled, false, 'must not dispatch a seen ticket');
    assert.equal(dispatchCreates.length, 0);
});

// 10. sweep — respects per-source cadence (not yet due)
test('runTrackerPollSweep — skips a source that is not yet due', async () => {
    const recent = new Date(Date.now() - 10_000); // 10s ago, interval 300s
    const source = {
        id: 's',
        tenantId: 't1',
        agentId: null,
        tracker: 'jira',
        baseUrl: 'https://x',
        assignee: 'a',
        projectFilter: null,
        secretRef: 'tok',
        enabled: true,
        intervalSec: 300,
        lastPolledAt: recent,
    };
    const { prisma } = makeSweepPrisma([source]);
    let fetched = false;
    const fetcher: FetchFn = async () => {
        fetched = true;
        return { ok: true, status: 200, json: async () => ({}) } as any;
    };

    const result = await runTrackerPollSweep(prisma, { fetcher });

    assert.equal(result.skipped, 1);
    assert.equal(result.polled, 0);
    assert.equal(fetched, false);
});

// 11. sweep — fails closed when credentials unresolvable (no poll)
test('runTrackerPollSweep — fails closed when token cannot be resolved', async () => {
    const source = {
        id: 's',
        tenantId: 't1',
        agentId: null,
        tracker: 'jira',
        baseUrl: 'https://x',
        assignee: 'a',
        projectFilter: null,
        secretRef: 'kv://vault/secrets/missing',
        enabled: true,
        intervalSec: 300,
        lastPolledAt: null,
    };
    const { prisma, sourceUpdates } = makeSweepPrisma([source]);
    let fetched = false;
    const fetcher: FetchFn = async () => {
        fetched = true;
        return { ok: true, status: 200, json: async () => ({}) } as any;
    };

    const result = await runTrackerPollSweep(prisma, { fetcher });

    assert.equal(result.errors, 1);
    assert.equal(result.polled, 0);
    assert.equal(fetched, false, 'must not poll the tracker without a token');
    // cursor still advanced with lastError recorded
    assert.equal(sourceUpdates.length, 1);
    assert.match(sourceUpdates[0].data.lastError, /credentials unavailable/);
});

// 12. sweep — custom source with auth='none' polls without a token
test('runTrackerPollSweep — custom auth=none source polls without credentials', async () => {
    const source = {
        id: 's_custom',
        tenantId: 't1',
        agentId: null,
        tracker: 'custom',
        baseUrl: 'https://public.tracker',
        assignee: 'a',
        projectFilter: null,
        secretRef: null, // no credentials
        customConfig: { url: '/items', auth: 'none', idField: 'id', titleField: 'name' },
        enabled: true,
        intervalSec: 300,
        lastPolledAt: null,
    };
    const { prisma, dispatchCreates } = makeSweepPrisma([source]);

    const calls: Capture[] = [];
    const fetcher: FetchFn = async (url, init) => {
        calls.push({ url, init });
        if (url.includes('/items')) {
            return { ok: true, status: 200, json: async () => [{ id: 'PUB-1', name: 'Public task' }] } as any;
        }
        return { ok: true, status: 200, text: async () => 'ok' } as any;
    };

    const result = await runTrackerPollSweep(prisma, { fetcher, agentRuntimeUrl: 'http://rt' });

    assert.equal(result.polled, 1);
    assert.equal(result.dispatched, 1);
    assert.equal(result.errors, 0);
    // no Authorization header sent
    const listCall = calls.find((c) => c.url.includes('/items'));
    assert.equal(listCall!.init?.headers?.['Authorization'], undefined);
    assert.equal(dispatchCreates[0].data.externalId, 'PUB-1');
});

// 13. sweep — off-shift agent defers the ticket instead of dispatching (C5)
test('runTrackerPollSweep — off-shift ticket is deferred, not dispatched', async () => {
    const source = {
        id: 's_jira',
        tenantId: 't1',
        agentId: 'agent_off',
        tracker: 'jira',
        baseUrl: 'https://acme.atlassian.net',
        assignee: 'dev@acme.io',
        projectFilter: null,
        secretRef: 'tok',
        enabled: true,
        intervalSec: 300,
        lastPolledAt: null,
    };
    // Persona working Mon–Fri 09:00–18:00 UTC; poll at Sat → closed.
    const persona = { timezone: 'UTC', workingHours: { start: '09:00', end: '18:00', days: [1, 2, 3, 4, 5] } };
    const { prisma, dispatchCreates, deferredCreates } = makeSweepPrisma([source], [], persona);

    let runTaskCalled = false;
    const fetcher: FetchFn = async (url) => {
        if (url.includes('/search')) {
            return { ok: true, status: 200, json: async () => ({ issues: [{ key: 'PROJ-5', fields: { summary: 'Later' } }] }) } as any;
        }
        runTaskCalled = true;
        return { ok: true, status: 200, text: async () => 'ok' } as any;
    };

    const now = new Date('2026-06-27T12:00:00Z'); // Saturday
    const result = await runTrackerPollSweep(prisma, { fetcher, agentRuntimeUrl: 'http://rt', now: () => now });

    assert.equal(result.deferred, 1);
    assert.equal(result.dispatched, 0);
    assert.equal(runTaskCalled, false, 'off-shift task must NOT be dispatched to runtime');
    // parked with runAfter = Monday 09:00 UTC
    assert.equal(deferredCreates.length, 1);
    assert.equal(deferredCreates[0].data.runAfter.toISOString(), '2026-06-29T09:00:00.000Z');
    assert.equal(deferredCreates[0].data.reason, 'shift_closed');
    // still recorded as handled (dedup) so it isn't re-polled
    assert.equal(dispatchCreates.length, 1);
    assert.equal(dispatchCreates[0].data.externalId, 'PROJ-5');
});
