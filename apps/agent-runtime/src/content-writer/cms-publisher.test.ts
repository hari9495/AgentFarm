import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { publishToCms, promoteToCms } from './cms-publisher.js';
import type { CmsFetchFn, PublishDraftInput, WordPressTarget, HubSpotTarget, ContentfulTarget, MediumTarget, GhostTarget } from './cms-publisher.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const baseInput: PublishDraftInput = {
    title: 'Why TypeScript Matters',
    body: '<p>TypeScript improves developer productivity.</p>',
    metaDescription: 'Learn why TypeScript matters for teams.',
    tags: ['typescript', 'programming'],
};

function makeSuccessFetch(responseJson: unknown): CmsFetchFn {
    return async () => ({
        ok: true,
        status: 200,
        json: async () => responseJson,
    });
}

function makeFailFetch(status: number): CmsFetchFn {
    return async () => ({
        ok: false,
        status,
        json: async () => ({}),
    });
}

function makeThrowFetch(): CmsFetchFn {
    return async () => {
        throw new Error('Network unreachable');
    };
}

// ---------------------------------------------------------------------------
// WordPress tests
// ---------------------------------------------------------------------------

describe('publishToCms — WordPress', () => {
    const wpTarget: WordPressTarget = {
        platform: 'wordpress',
        baseUrl: 'https://myblog.com',
        applicationPassword: 'dXNlcjpwYXNz', // base64
        authorId: 1,
    };

    test('returns ok=true with draftId and draftUrl on success', async () => {
        const result = await publishToCms(
            baseInput,
            wpTarget,
            makeSuccessFetch({ id: 42, link: 'https://myblog.com/?p=42' }),
        );
        assert.equal(result.ok, true);
        assert.equal(result.platform, 'wordpress');
        assert.equal(result.draftId, '42');
        assert.equal(result.draftUrl, 'https://myblog.com/?p=42');
        assert.equal(result.errorMessage, null);
    });

    test('returns ok=false on HTTP error', async () => {
        const result = await publishToCms(baseInput, wpTarget, makeFailFetch(401));
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('401'));
    });

    test('returns ok=false on network throw', async () => {
        const result = await publishToCms(baseInput, wpTarget, makeThrowFetch());
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('Network unreachable'));
    });

    test('always sends status=draft in request body', async () => {
        const sentBodies: string[] = [];
        const captureFetch: CmsFetchFn = async (_url, init) => {
            sentBodies.push(init.body ?? '');
            return { ok: true, status: 200, json: async () => ({ id: 1 }) };
        };

        await publishToCms(baseInput, wpTarget, captureFetch);
        const parsed = JSON.parse(sentBodies[0] ?? '{}') as Record<string, unknown>;
        assert.equal(parsed['status'], 'draft');
    });
});

// ---------------------------------------------------------------------------
// HubSpot tests
// ---------------------------------------------------------------------------

describe('publishToCms — HubSpot', () => {
    const hsTarget: HubSpotTarget = {
        platform: 'hubspot',
        accessToken: 'pat-token-123',
        blogId: '9876543',
    };

    test('returns ok=true on success', async () => {
        const result = await publishToCms(
            baseInput,
            hsTarget,
            makeSuccessFetch({ id: 'post-id-789', url: 'https://myblog.hubspot.com/blog/post-789' }),
        );
        assert.equal(result.ok, true);
        assert.equal(result.platform, 'hubspot');
        assert.equal(result.draftId, 'post-id-789');
    });

    test('returns ok=false on HTTP error', async () => {
        const result = await publishToCms(baseInput, hsTarget, makeFailFetch(403));
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('403'));
    });

    test('sends DRAFT state in request', async () => {
        const sentBodies: string[] = [];
        const captureFetch: CmsFetchFn = async (_url, init) => {
            sentBodies.push(init.body ?? '');
            return { ok: true, status: 200, json: async () => ({ id: '1' }) };
        };

        await publishToCms(baseInput, hsTarget, captureFetch);
        const parsed = JSON.parse(sentBodies[0] ?? '{}') as Record<string, unknown>;
        assert.equal(parsed['state'], 'DRAFT');
    });
});

// ---------------------------------------------------------------------------
// Contentful tests
// ---------------------------------------------------------------------------

describe('publishToCms — Contentful', () => {
    const cfTarget: ContentfulTarget = {
        platform: 'contentful',
        spaceId: 'sp123',
        environmentId: 'master',
        contentTypeId: 'blogPost',
        accessToken: 'cma-token-456',
        titleField: 'title',
        bodyField: 'body',
        locale: 'en-US',
    };

    test('returns ok=true with entry URL on success', async () => {
        const result = await publishToCms(
            baseInput,
            cfTarget,
            makeSuccessFetch({ sys: { id: 'entry-abc' } }),
        );
        assert.equal(result.ok, true);
        assert.equal(result.draftId, 'entry-abc');
        assert.ok(result.draftUrl?.includes('entry-abc'));
    });

    test('returns ok=false on HTTP error', async () => {
        const result = await publishToCms(baseInput, cfTarget, makeFailFetch(422));
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('422'));
    });
});

// ---------------------------------------------------------------------------
// verifyCmsDraft tests
// ---------------------------------------------------------------------------

import { verifyCmsDraft } from './cms-publisher.js';
import type { PublishResult } from './cms-publisher.js';

const successPublishResult: PublishResult = {
    ok: true,
    platform: 'wordpress',
    draftId: '99',
    draftUrl: 'https://myblog.com/?p=99',
    errorMessage: null,
};

const wpTarget: WordPressTarget = {
    platform: 'wordpress',
    baseUrl: 'https://myblog.com',
    applicationPassword: 'dXNlcjpwYXNz',
    authorId: 1,
};

describe('verifyCmsDraft', () => {
    test('returns ok=true and renderedTitleFound=true when title appears in response', async () => {
        const fetchFn: CmsFetchFn = async () => ({
            ok: true,
            status: 200,
            json: async () => ({ id: 99, title: { rendered: 'Why TypeScript Matters' }, status: 'draft' }),
        });

        const result = await verifyCmsDraft(successPublishResult, 'Why TypeScript Matters', wpTarget, fetchFn);
        assert.equal(result.ok, true);
        assert.equal(result.httpStatus, 200);
        assert.equal(result.renderedTitleFound, true);
        assert.equal(result.errorMessage, null);
    });

    test('returns renderedTitleFound=false when title is absent from response', async () => {
        const fetchFn: CmsFetchFn = async () => ({
            ok: true,
            status: 200,
            json: async () => ({ id: 99, title: { rendered: 'A Different Title' }, status: 'draft' }),
        });

        const result = await verifyCmsDraft(successPublishResult, 'Why TypeScript Matters', wpTarget, fetchFn);
        assert.equal(result.ok, false);
        assert.equal(result.renderedTitleFound, false);
    });

    test('returns ok=false when HTTP status is non-200', async () => {
        const fetchFn: CmsFetchFn = async () => ({
            ok: false,
            status: 404,
            json: async () => ({}),
        });

        const result = await verifyCmsDraft(successPublishResult, 'Why TypeScript Matters', wpTarget, fetchFn);
        assert.equal(result.ok, false);
        assert.equal(result.httpStatus, 404);
    });

    test('returns error when publishResult has no draftId', async () => {
        const noDraftId: PublishResult = { ...successPublishResult, draftId: null };
        const fetchFn: CmsFetchFn = async () => ({ ok: true, status: 200, json: async () => ({}) });

        const result = await verifyCmsDraft(noDraftId, 'Title', wpTarget, fetchFn);
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage !== null);
    });
});

// ---------------------------------------------------------------------------
// promoteToCms tests
// ---------------------------------------------------------------------------

import type { PromoteResult } from './cms-publisher.js';

describe('promoteToCms — WordPress', () => {
    test('returns ok=true with liveUrl when PATCH succeeds', async () => {
        const fetchFn: CmsFetchFn = async () => ({
            ok: true, status: 200,
            json: async () => ({ id: 42, link: 'https://myblog.com/why-typescript-matters/' }),
        });
        const result = await promoteToCms('42', wpTarget, fetchFn);
        assert.equal(result.ok, true);
        assert.equal(result.platform, 'wordpress');
        assert.equal(result.liveUrl, 'https://myblog.com/why-typescript-matters/');
        assert.equal(result.errorMessage, null);
    });

    test('sends status=publish in PATCH body', async () => {
        const sentBodies: string[] = [];
        const fetchFn: CmsFetchFn = async (_url, init) => {
            sentBodies.push(init.body ?? '');
            return { ok: true, status: 200, json: async () => ({ link: 'https://myblog.com/p/1' }) };
        };
        await promoteToCms('1', wpTarget, fetchFn);
        const parsed = JSON.parse(sentBodies[0] ?? '{}') as Record<string, unknown>;
        assert.equal(parsed['status'], 'publish');
    });

    test('returns ok=false on HTTP error', async () => {
        const fetchFn: CmsFetchFn = async () => ({ ok: false, status: 403, json: async () => ({}) });
        const result = await promoteToCms('42', wpTarget, fetchFn);
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('403'));
    });

    test('returns ok=false on network throw', async () => {
        const fetchFn: CmsFetchFn = async () => { throw new Error('timeout'); };
        const result = await promoteToCms('42', wpTarget, fetchFn);
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('timeout'));
    });
});

describe('promoteToCms — HubSpot', () => {
    const hsTarget: HubSpotTarget = { platform: 'hubspot', accessToken: 'pat-token-123', blogId: '9876543' };

    test('returns ok=true with liveUrl when PATCH succeeds', async () => {
        const fetchFn: CmsFetchFn = async () => ({
            ok: true, status: 200,
            json: async () => ({ id: 'post-id-789', url: 'https://myblog.hubspot.com/blog/live-post' }),
        });
        const result = await promoteToCms('post-id-789', hsTarget, fetchFn);
        assert.equal(result.ok, true);
        assert.equal(result.platform, 'hubspot');
        assert.equal(result.liveUrl, 'https://myblog.hubspot.com/blog/live-post');
    });

    test('sends state=PUBLISHED in PATCH body', async () => {
        const sentBodies: string[] = [];
        const fetchFn: CmsFetchFn = async (_url, init) => {
            sentBodies.push(init.body ?? '');
            return { ok: true, status: 200, json: async () => ({ url: 'https://hs.com/p' }) };
        };
        await promoteToCms('post-id-789', hsTarget, fetchFn);
        const parsed = JSON.parse(sentBodies[0] ?? '{}') as Record<string, unknown>;
        assert.equal(parsed['state'], 'PUBLISHED');
    });

    test('returns ok=false on HTTP error', async () => {
        const fetchFn: CmsFetchFn = async () => ({ ok: false, status: 409, json: async () => ({}) });
        const result = await promoteToCms('post-id-789', hsTarget, fetchFn);
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('409'));
    });
});

describe('promoteToCms — Contentful', () => {
    const cfTarget: ContentfulTarget = {
        platform: 'contentful', spaceId: 'sp123', environmentId: 'master',
        contentTypeId: 'blogPost', accessToken: 'cma-token-456',
        titleField: 'title', bodyField: 'body', locale: 'en-US',
    };

    test('GETs entry version then PUTs to /published', async () => {
        const calls: Array<{ url: string; method: string }> = [];
        const fetchFn: CmsFetchFn = async (url, init) => {
            calls.push({ url, method: init.method });
            if (init.method === 'GET') {
                return { ok: true, status: 200, json: async () => ({ sys: { id: 'entry-abc', version: 3 } }) };
            }
            return { ok: true, status: 200, json: async () => ({ sys: { id: 'entry-abc' } }) };
        };
        const result = await promoteToCms('entry-abc', cfTarget, fetchFn);
        assert.equal(result.ok, true);
        assert.equal(calls.length, 2);
        assert.equal(calls[0]?.method, 'GET');
        assert.equal(calls[1]?.method, 'PUT');
        assert.ok(calls[1]?.url.endsWith('/published'));
    });

    test('sends X-Contentful-Version header from GET response', async () => {
        const sentHeaders: Record<string, string>[] = [];
        const fetchFn: CmsFetchFn = async (_url, init) => {
            sentHeaders.push(init.headers);
            if (init.method === 'GET') {
                return { ok: true, status: 200, json: async () => ({ sys: { version: 7 } }) };
            }
            return { ok: true, status: 200, json: async () => ({ sys: { id: 'entry-abc' } }) };
        };
        await promoteToCms('entry-abc', cfTarget, fetchFn);
        assert.equal(sentHeaders[1]?.['X-Contentful-Version'], '7');
    });

    test('returns ok=false when GET entry fails', async () => {
        const fetchFn: CmsFetchFn = async (_url, init) => {
            if (init.method === 'GET') return { ok: false, status: 404, json: async () => ({}) };
            return { ok: true, status: 200, json: async () => ({}) };
        };
        const result = await promoteToCms('entry-abc', cfTarget, fetchFn);
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('404'));
    });

    test('returns ok=false when PUT to /published fails', async () => {
        const fetchFn: CmsFetchFn = async (_url, init) => {
            if (init.method === 'GET') return { ok: true, status: 200, json: async () => ({ sys: { version: 2 } }) };
            return { ok: false, status: 422, json: async () => ({}) };
        };
        const result = await promoteToCms('entry-abc', cfTarget, fetchFn);
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('422'));
    });
});

// ---------------------------------------------------------------------------
// Medium tests
// ---------------------------------------------------------------------------

const medTarget: MediumTarget = {
    platform: 'medium',
    accessToken: 'medium-token',
    authorId: 'user123',
};

describe('publishToCms — Medium', () => {
    test('creates a draft with publishStatus=draft', async () => {
        let capturedBody: { publishStatus?: string } = {};
        const fetchFn: CmsFetchFn = async (_url, init) => {
            capturedBody = JSON.parse(init.body ?? '{}') as { publishStatus?: string };
            return { ok: true, status: 201, json: async () => ({ data: { id: 'med-1', url: 'https://medium.com/p/med-1' } }) };
        };
        const result = await publishToCms(baseInput, medTarget, fetchFn);
        assert.equal(result.ok, true);
        assert.equal(result.draftId, 'med-1');
        assert.equal(capturedBody?.publishStatus, 'draft');
    });

    test('routes request to correct Medium endpoint', async () => {
        let capturedUrl = '';
        const fetchFn: CmsFetchFn = async (url) => {
            capturedUrl = url;
            return { ok: true, status: 201, json: async () => ({ data: { id: 'm2' } }) };
        };
        await publishToCms(baseInput, medTarget, fetchFn);
        assert.ok(capturedUrl.includes('/users/user123/posts'));
    });

    test('returns ok=false on API error', async () => {
        const fetchFn: CmsFetchFn = async () => ({ ok: false, status: 401, json: async () => ({}) });
        const result = await publishToCms(baseInput, medTarget, fetchFn);
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('401'));
    });
});

describe('promoteToCms — Medium (API limitation)', () => {
    test('returns ok=false explaining API limitation', async () => {
        const fetchFn: CmsFetchFn = async () => ({ ok: true, status: 200, json: async () => ({}) });
        const result = await promoteToCms('med-1', medTarget, fetchFn);
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.toLowerCase().includes('medium'));
    });
});

// ---------------------------------------------------------------------------
// Ghost tests
// ---------------------------------------------------------------------------

// Use a syntactically-valid but non-real key for tests
const ghostTarget: GhostTarget = {
    platform: 'ghost',
    baseUrl: 'https://myblog.ghost.io',
    adminApiKey: 'abc123:' + '00'.repeat(32),
};

describe('publishToCms — Ghost', () => {
    test('creates a draft with status=draft', async () => {
        let capturedBody: { posts?: Array<{ status?: string }> } = {};
        const fetchFn: CmsFetchFn = async (_url, init) => {
            capturedBody = JSON.parse(init.body ?? '{}') as { posts?: Array<{ status?: string }> };
            return { ok: true, status: 201, json: async () => ({ posts: [{ id: 'ghost-1', url: 'https://myblog.ghost.io/p/ghost-1' }] }) };
        };
        const result = await publishToCms(baseInput, ghostTarget, fetchFn);
        assert.equal(result.ok, true);
        assert.equal(result.draftId, 'ghost-1');
        assert.equal(capturedBody?.posts?.[0]?.status, 'draft');
    });

    test('Authorization header starts with "Ghost "', async () => {
        let capturedAuth = '';
        const fetchFn: CmsFetchFn = async (_url, init) => {
            capturedAuth = (init.headers as Record<string, string>)['Authorization'] ?? '';
            return { ok: true, status: 201, json: async () => ({ posts: [{ id: 'g2' }] }) };
        };
        await publishToCms(baseInput, ghostTarget, fetchFn);
        assert.ok(capturedAuth.startsWith('Ghost '), `unexpected auth: ${capturedAuth}`);
    });

    test('returns ok=false on API error', async () => {
        const fetchFn: CmsFetchFn = async () => ({ ok: false, status: 403, json: async () => ({}) });
        const result = await publishToCms(baseInput, ghostTarget, fetchFn);
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('403'));
    });
});

describe('promoteToCms — Ghost', () => {
    test('GETs post first then PUTs status=published', async () => {
        const calls: Array<{ method: string; url: string }> = [];
        const fetchFn: CmsFetchFn = async (url, init) => {
            calls.push({ method: init.method, url });
            if (init.method === 'GET')
                return { ok: true, status: 200, json: async () => ({ posts: [{ updated_at: '2026-07-01T00:00:00.000Z' }] }) };
            return { ok: true, status: 200, json: async () => ({ posts: [{ url: 'https://myblog.ghost.io/my-post/' }] }) };
        };
        const result = await promoteToCms('ghost-1', ghostTarget, fetchFn);
        assert.equal(result.ok, true);
        assert.equal(calls.length, 2);
        assert.equal(calls[0]!.method, 'GET');
        assert.equal(calls[1]!.method, 'PUT');
    });

    test('PUT body contains status=published and updated_at', async () => {
        let putBody: { posts?: Array<{ status?: string; updated_at?: string }> } | undefined;
        const fetchFn: CmsFetchFn = async (_url, init) => {
            if (init.method === 'PUT') putBody = JSON.parse(init.body ?? '{}') as typeof putBody;
            return {
                ok: true, status: 200,
                json: async () => init.method === 'GET'
                    ? { posts: [{ updated_at: '2026-07-01T00:00:00.000Z' }] }
                    : { posts: [{ url: 'https://myblog.ghost.io/post' }] },
            };
        };
        await promoteToCms('ghost-1', ghostTarget, fetchFn);
        assert.equal(putBody?.posts?.[0]?.status, 'published');
        assert.ok(putBody?.posts?.[0]?.updated_at !== undefined);
    });

    test('returns ok=false when GET fails', async () => {
        const fetchFn: CmsFetchFn = async () => ({ ok: false, status: 404, json: async () => ({}) });
        const result = await promoteToCms('ghost-1', ghostTarget, fetchFn);
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('404'));
    });

    test('returns ok=false when PUT fails', async () => {
        const fetchFn: CmsFetchFn = async (_url, init) => {
            if (init.method === 'GET')
                return { ok: true, status: 200, json: async () => ({ posts: [{ updated_at: '2026-07-01T00:00:00.000Z' }] }) };
            return { ok: false, status: 500, json: async () => ({}) };
        };
        const result = await promoteToCms('ghost-1', ghostTarget, fetchFn);
        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('500'));
    });
});
