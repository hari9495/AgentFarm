/**
 * CMS Publisher
 *
 * HTTP adapters for creating DRAFT posts on supported CMS platforms.
 * Always creates as draft — never publishes directly. A human or approval
 * workflow must promote the draft to live.
 *
 * Supported platforms: wordpress, contentful, hubspot, medium, ghost
 *
 * Security notes:
 *   - Credentials are passed via target config — never hardcoded.
 *   - The `status` field is forced to 'draft' regardless of caller input.
 *   - Request bodies are JSON-serialised — no string interpolation in SQL/shell.
 *   - fetchFn is injectable so tests never make real HTTP calls.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import { createHmac } from 'node:crypto';

export type CmsPlatform = 'wordpress' | 'contentful' | 'hubspot' | 'medium' | 'ghost';

export interface WordPressTarget {
    platform: 'wordpress';
    /** Base URL of the WordPress site, e.g. https://example.com */
    baseUrl: string;
    /** WordPress Application Password encoded as base64("user:password") */
    applicationPassword: string;
    authorId?: number;
}

export interface ContentfulTarget {
    platform: 'contentful';
    spaceId: string;
    /** Usually 'master' */
    environmentId: string;
    /** Content type ID, e.g. 'blogPost' */
    contentTypeId: string;
    /** CMA (Content Management API) token */
    accessToken: string;
    /** Field name for the title, e.g. 'title' */
    titleField: string;
    /** Field name for the body, e.g. 'body' */
    bodyField: string;
    /** Locale, e.g. 'en-US' */
    locale: string;
}

export interface HubSpotTarget {
    platform: 'hubspot';
    /** HubSpot private app token */
    accessToken: string;
    /** Numeric HubSpot blog ID */
    blogId: string;
}

export interface MediumTarget {
    platform: 'medium';
    /** Medium Integration Token (from medium.com/me/settings > Integration Tokens) */
    accessToken: string;
    /** Medium user ID — retrieved once via GET https://api.medium.com/v1/me */
    authorId: string;
    /** Content format for the post body. Defaults to 'html'. */
    contentFormat?: 'html' | 'markdown';
}

export interface GhostTarget {
    platform: 'ghost';
    /** Ghost site base URL, e.g. https://myblog.ghost.io */
    baseUrl: string;
    /** Ghost Admin API key in '{id}:{secret}' format */
    adminApiKey: string;
}

export type CmsTarget = WordPressTarget | ContentfulTarget | HubSpotTarget | MediumTarget | GhostTarget;

export interface PublishDraftInput {
    title: string;
    /** HTML or Markdown depending on the platform */
    body: string;
    metaDescription?: string;
    focusKeyword?: string;
    tags?: string[];
}

export interface PublishResult {
    ok: boolean;
    platform: CmsPlatform;
    draftUrl: string | null;
    draftId: string | null;
    errorMessage: string | null;
}

export interface CmsVerifyResult {
    ok: boolean;
    httpStatus: number | null;
    renderedTitleFound: boolean;
    errorMessage: string | null;
}

export interface PromoteResult {
    ok: boolean;
    platform: CmsPlatform;
    /** Public URL of the live post, when available. */
    liveUrl: string | null;
    errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// Fetch abstraction (injectable for tests)
// ---------------------------------------------------------------------------

export type CmsFetchFn = (
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

// ---------------------------------------------------------------------------
// Ghost JWT helper
// ---------------------------------------------------------------------------

/**
 * Generate a short-lived Ghost Admin API JWT from an adminApiKey in
 * '{id}:{secret}' format, as documented at https://ghost.org/docs/admin-api/.
 */
function buildGhostAdminToken(adminApiKey: string): string {
    const separatorIdx = adminApiKey.indexOf(':');
    if (separatorIdx === -1)
        throw new Error('Invalid Ghost Admin API key format — expected "id:secret"');
    const id = adminApiKey.slice(0, separatorIdx);
    const secret = adminApiKey.slice(separatorIdx + 1);
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'HS256', kid: id, typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payloadB64 = Buffer.from(JSON.stringify({ iat: now, exp: now + 300, aud: '/admin/' })).toString('base64url');
    const sigInput = `${headerB64}.${payloadB64}`;
    const signature = createHmac('sha256', Buffer.from(secret, 'hex'))
        .update(sigInput)
        .digest('base64url');
    return `${headerB64}.${payloadB64}.${signature}`;
}

// ---------------------------------------------------------------------------
// WordPress adapter
// ---------------------------------------------------------------------------

async function publishWordPressDraft(
    input: PublishDraftInput,
    target: WordPressTarget,
    fetchFn: CmsFetchFn,
): Promise<PublishResult> {
    const endpoint = `${target.baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts`;

    const body = JSON.stringify({
        title: input.title,
        content: input.body,
        status: 'draft',
        excerpt: input.metaDescription ?? '',
        ...(target.authorId !== undefined ? { author: target.authorId } : {}),
    });

    try {
        const response = await fetchFn(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${target.applicationPassword}`,
            },
            body,
        });

        if (!response.ok) {
            return {
                ok: false,
                platform: 'wordpress',
                draftUrl: null,
                draftId: null,
                errorMessage: `WordPress API returned ${response.status}`,
            };
        }

        const json = (await response.json()) as { id?: number; link?: string };
        return {
            ok: true,
            platform: 'wordpress',
            draftUrl: json.link ?? null,
            draftId: json.id !== undefined ? String(json.id) : null,
            errorMessage: null,
        };
    } catch (err) {
        return {
            ok: false,
            platform: 'wordpress',
            draftUrl: null,
            draftId: null,
            errorMessage: String(err),
        };
    }
}

// ---------------------------------------------------------------------------
// Contentful adapter
// ---------------------------------------------------------------------------

async function publishContentfulDraft(
    input: PublishDraftInput,
    target: ContentfulTarget,
    fetchFn: CmsFetchFn,
): Promise<PublishResult> {
    const endpoint = `https://api.contentful.com/spaces/${target.spaceId}/environments/${target.environmentId}/entries`;

    const fields: Record<string, Record<string, string>> = {
        [target.titleField]: { [target.locale]: input.title },
        [target.bodyField]: { [target.locale]: input.body },
    };
    if (input.metaDescription) {
        fields['metaDescription'] = { [target.locale]: input.metaDescription };
    }

    const body = JSON.stringify({
        fields,
        metadata: {
            tags:
                input.tags?.map((t) => ({
                    sys: { type: 'Link', linkType: 'Tag', id: t },
                })) ?? [],
        },
    });

    try {
        const response = await fetchFn(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/vnd.contentful.management.v1+json',
                Authorization: `Bearer ${target.accessToken}`,
                'X-Contentful-Content-Type': target.contentTypeId,
            },
            body,
        });

        if (!response.ok) {
            return {
                ok: false,
                platform: 'contentful',
                draftUrl: null,
                draftId: null,
                errorMessage: `Contentful API returned ${response.status}`,
            };
        }

        const json = (await response.json()) as { sys?: { id?: string } };
        const entryId = json.sys?.id ?? null;
        const draftUrl = entryId
            ? `https://app.contentful.com/spaces/${target.spaceId}/entries/${entryId}`
            : null;
        return { ok: true, platform: 'contentful', draftUrl, draftId: entryId, errorMessage: null };
    } catch (err) {
        return {
            ok: false,
            platform: 'contentful',
            draftUrl: null,
            draftId: null,
            errorMessage: String(err),
        };
    }
}

// ---------------------------------------------------------------------------
// HubSpot adapter
// ---------------------------------------------------------------------------

async function publishHubSpotDraft(
    input: PublishDraftInput,
    target: HubSpotTarget,
    fetchFn: CmsFetchFn,
): Promise<PublishResult> {
    const endpoint = 'https://api.hubapi.com/cms/v3/blogs/posts';

    const body = JSON.stringify({
        name: input.title,
        postBody: input.body,
        metaDescription: input.metaDescription ?? '',
        contentGroupId: target.blogId,
        state: 'DRAFT',
        currentState: 'DRAFT',
    });

    try {
        const response = await fetchFn(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${target.accessToken}`,
            },
            body,
        });

        if (!response.ok) {
            return {
                ok: false,
                platform: 'hubspot',
                draftUrl: null,
                draftId: null,
                errorMessage: `HubSpot API returned ${response.status}`,
            };
        }

        const json = (await response.json()) as { id?: string; url?: string };
        return {
            ok: true,
            platform: 'hubspot',
            draftUrl: json.url ?? null,
            draftId: json.id ?? null,
            errorMessage: null,
        };
    } catch (err) {
        return {
            ok: false,
            platform: 'hubspot',
            draftUrl: null,
            draftId: null,
            errorMessage: String(err),
        };
    }
}

// ---------------------------------------------------------------------------
// Medium adapter
// ---------------------------------------------------------------------------

async function publishMediumDraft(
    input: PublishDraftInput,
    target: MediumTarget,
    fetchFn: CmsFetchFn,
): Promise<PublishResult> {
    const endpoint = `https://api.medium.com/v1/users/${target.authorId}/posts`;
    const body = JSON.stringify({
        title: input.title,
        contentFormat: target.contentFormat ?? 'html',
        content: input.body,
        tags: input.tags ?? [],
        publishStatus: 'draft',
    });
    try {
        const response = await fetchFn(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${target.accessToken}`,
                Accept: 'application/json',
            },
            body,
        });
        if (!response.ok) {
            return {
                ok: false, platform: 'medium', draftUrl: null, draftId: null,
                errorMessage: `Medium API returned ${response.status}`,
            };
        }
        const json = (await response.json()) as { data?: { id?: string; url?: string } };
        return {
            ok: true, platform: 'medium',
            draftUrl: json.data?.url ?? null,
            draftId: json.data?.id ?? null,
            errorMessage: null,
        };
    } catch (err) {
        return { ok: false, platform: 'medium', draftUrl: null, draftId: null, errorMessage: String(err) };
    }
}

// ---------------------------------------------------------------------------
// Ghost adapter
// ---------------------------------------------------------------------------

async function publishGhostDraft(
    input: PublishDraftInput,
    target: GhostTarget,
    fetchFn: CmsFetchFn,
): Promise<PublishResult> {
    const endpoint = `${target.baseUrl.replace(/\/$/, '')}/ghost/api/admin/posts/`;
    let token: string;
    try {
        token = buildGhostAdminToken(target.adminApiKey);
    } catch (err) {
        return { ok: false, platform: 'ghost', draftUrl: null, draftId: null, errorMessage: String(err) };
    }
    const body = JSON.stringify({
        posts: [{
            title: input.title,
            html: input.body,
            status: 'draft',
            meta_description: input.metaDescription ?? '',
            tags: input.tags?.map((t) => ({ name: t })) ?? [],
        }],
    });
    try {
        const response = await fetchFn(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Ghost ${token}`,
            },
            body,
        });
        if (!response.ok) {
            return {
                ok: false, platform: 'ghost', draftUrl: null, draftId: null,
                errorMessage: `Ghost API returned ${response.status}`,
            };
        }
        const json = (await response.json()) as { posts?: Array<{ id?: string; url?: string }> };
        const post = json.posts?.[0];
        return {
            ok: true, platform: 'ghost',
            draftUrl: post?.url ?? null,
            draftId: post?.id ?? null,
            errorMessage: null,
        };
    } catch (err) {
        return { ok: false, platform: 'ghost', draftUrl: null, draftId: null, errorMessage: String(err) };
    }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a draft post on the specified CMS platform.
 *
 * The draft is never published directly — status is always forced to 'draft'.
 */
export async function publishToCms(
    input: PublishDraftInput,
    target: CmsTarget,
    fetchFn: CmsFetchFn,
): Promise<PublishResult> {
    switch (target.platform) {
        case 'wordpress':
            return publishWordPressDraft(input, target, fetchFn);
        case 'contentful':
            return publishContentfulDraft(input, target, fetchFn);
        case 'hubspot':
            return publishHubSpotDraft(input, target, fetchFn);
        case 'medium':
            return publishMediumDraft(input, target, fetchFn);
        case 'ghost':
            return publishGhostDraft(input, target, fetchFn);
        default: {
            const exhaustive: never = target;
            return {
                ok: false,
                platform: (exhaustive as CmsTarget).platform,
                draftUrl: null,
                draftId: null,
                errorMessage: 'Unknown CMS platform',
            };
        }
    }
}

// ---------------------------------------------------------------------------
// Promote draft → live
// ---------------------------------------------------------------------------

/**
 * Promote an existing WordPress draft to live by patching its status to 'publish'.
 */
async function promoteWordPressToLive(
    draftId: string,
    target: WordPressTarget,
    fetchFn: CmsFetchFn,
): Promise<PromoteResult> {
    const endpoint = `${target.baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts/${draftId}`;
    const body = JSON.stringify({ status: 'publish' });
    try {
        const response = await fetchFn(endpoint, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${target.applicationPassword}`,
            },
            body,
        });
        if (!response.ok) {
            return { ok: false, platform: 'wordpress', liveUrl: null, errorMessage: `WordPress API returned ${response.status}` };
        }
        const json = (await response.json()) as { link?: string };
        return { ok: true, platform: 'wordpress', liveUrl: json.link ?? null, errorMessage: null };
    } catch (err) {
        return { ok: false, platform: 'wordpress', liveUrl: null, errorMessage: String(err) };
    }
}

/**
 * Promote a Contentful draft entry to published.
 * Requires a GET first to retrieve the current entry version for the
 * X-Contentful-Version header that Contentful mandates on publish.
 */
async function promoteContentfulToLive(
    draftId: string,
    target: ContentfulTarget,
    fetchFn: CmsFetchFn,
): Promise<PromoteResult> {
    const base = `https://api.contentful.com/spaces/${target.spaceId}/environments/${target.environmentId}/entries/${draftId}`;
    const authHeader = `Bearer ${target.accessToken}`;

    let version: number;
    try {
        const getResponse = await fetchFn(base, { method: 'GET', headers: { Authorization: authHeader } });
        if (!getResponse.ok) {
            return { ok: false, platform: 'contentful', liveUrl: null, errorMessage: `Contentful GET entry returned ${getResponse.status}` };
        }
        const getJson = (await getResponse.json()) as { sys?: { version?: number } };
        version = getJson.sys?.version ?? 0;
    } catch (err) {
        return { ok: false, platform: 'contentful', liveUrl: null, errorMessage: String(err) };
    }

    try {
        const response = await fetchFn(`${base}/published`, {
            method: 'PUT',
            headers: { Authorization: authHeader, 'X-Contentful-Version': String(version) },
        });
        if (!response.ok) {
            return { ok: false, platform: 'contentful', liveUrl: null, errorMessage: `Contentful publish returned ${response.status}` };
        }
        const json = (await response.json()) as { sys?: { id?: string } };
        const id = json.sys?.id ?? draftId;
        return { ok: true, platform: 'contentful', liveUrl: `https://app.contentful.com/spaces/${target.spaceId}/entries/${id}`, errorMessage: null };
    } catch (err) {
        return { ok: false, platform: 'contentful', liveUrl: null, errorMessage: String(err) };
    }
}

/**
 * Promote an existing HubSpot draft blog post to PUBLISHED state.
 */
async function promoteHubSpotToLive(
    draftId: string,
    target: HubSpotTarget,
    fetchFn: CmsFetchFn,
): Promise<PromoteResult> {
    const endpoint = `https://api.hubapi.com/cms/v3/blogs/posts/${draftId}`;
    const body = JSON.stringify({ state: 'PUBLISHED' });
    try {
        const response = await fetchFn(endpoint, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${target.accessToken}`,
            },
            body,
        });
        if (!response.ok) {
            return { ok: false, platform: 'hubspot', liveUrl: null, errorMessage: `HubSpot API returned ${response.status}` };
        }
        const json = (await response.json()) as { url?: string };
        return { ok: true, platform: 'hubspot', liveUrl: json.url ?? null, errorMessage: null };
    } catch (err) {
        return { ok: false, platform: 'hubspot', liveUrl: null, errorMessage: String(err) };
    }
}

/**
 * Medium API v1 does not support promoting a draft to published via API.
 * Callers should instruct the user to publish manually on medium.com.
 */
async function promoteMediumToLive(
    _draftId: string,
    _target: MediumTarget,
    _fetchFn: CmsFetchFn,
): Promise<PromoteResult> {
    return {
        ok: false,
        platform: 'medium',
        liveUrl: null,
        errorMessage:
            'Medium API v1 does not support promoting drafts to published via API. ' +
            'Log in to medium.com and publish the draft manually.',
    };
}

/**
 * Promote a Ghost draft post to published.
 * Requires a GET first to retrieve updated_at for optimistic concurrency.
 */
async function promoteGhostToLive(
    draftId: string,
    target: GhostTarget,
    fetchFn: CmsFetchFn,
): Promise<PromoteResult> {
    const base = `${target.baseUrl.replace(/\/$/, '')}/ghost/api/admin/posts/${draftId}/`;
    let token: string;
    try {
        token = buildGhostAdminToken(target.adminApiKey);
    } catch (err) {
        return { ok: false, platform: 'ghost', liveUrl: null, errorMessage: String(err) };
    }
    const authHeader = `Ghost ${token}`;

    // GET post first to retrieve updated_at (required by Ghost for PUT)
    let updatedAt: string;
    try {
        const getResponse = await fetchFn(base, { method: 'GET', headers: { Authorization: authHeader } });
        if (!getResponse.ok)
            return { ok: false, platform: 'ghost', liveUrl: null, errorMessage: `Ghost GET post returned ${getResponse.status}` };
        const getJson = (await getResponse.json()) as { posts?: Array<{ updated_at?: string }> };
        updatedAt = getJson.posts?.[0]?.updated_at ?? new Date().toISOString();
    } catch (err) {
        return { ok: false, platform: 'ghost', liveUrl: null, errorMessage: String(err) };
    }

    const body = JSON.stringify({ posts: [{ status: 'published', updated_at: updatedAt }] });
    try {
        const response = await fetchFn(base, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader },
            body,
        });
        if (!response.ok)
            return { ok: false, platform: 'ghost', liveUrl: null, errorMessage: `Ghost API returned ${response.status}` };
        const json = (await response.json()) as { posts?: Array<{ url?: string }> };
        return { ok: true, platform: 'ghost', liveUrl: json.posts?.[0]?.url ?? null, errorMessage: null };
    } catch (err) {
        return { ok: false, platform: 'ghost', liveUrl: null, errorMessage: String(err) };
    }
}

/**
 * Promote an existing CMS draft to live.
 *
 * This is a HIGH-RISK operation. The runtime must ensure this action is
 * routed through the approval gate (riskLevel: 'high') before dispatch.
 */
export async function promoteToCms(
    draftId: string,
    target: CmsTarget,
    fetchFn: CmsFetchFn,
): Promise<PromoteResult> {
    switch (target.platform) {
        case 'wordpress':
            return promoteWordPressToLive(draftId, target, fetchFn);
        case 'contentful':
            return promoteContentfulToLive(draftId, target, fetchFn);
        case 'hubspot':
            return promoteHubSpotToLive(draftId, target, fetchFn);
        case 'medium':
            return promoteMediumToLive(draftId, target, fetchFn);
        case 'ghost':
            return promoteGhostToLive(draftId, target, fetchFn);
        default: {
            const exhaustive: never = target;
            return {
                ok: false,
                platform: (exhaustive as CmsTarget).platform,
                liveUrl: null,
                errorMessage: 'Unknown CMS platform',
            };
        }
    }
}

// ---------------------------------------------------------------------------
// Post-publish draft verification
// ---------------------------------------------------------------------------

/**
 * Verify that a published CMS draft is accessible and contains the expected
 * title. Performs a GET request against the draft URL or platform API and
 * checks the response.
 *
 * Returns `ok: true` only when the server responds with HTTP 200 and the
 * expected title text is found in the response JSON.
 */
export async function verifyCmsDraft(
    publishResult: PublishResult,
    expectedTitle: string,
    target: CmsTarget,
    fetchFn: CmsFetchFn,
): Promise<CmsVerifyResult> {
    if (!publishResult.ok || !publishResult.draftId) {
        return {
            ok: false,
            httpStatus: null,
            renderedTitleFound: false,
            errorMessage: 'Publish result was not successful or missing draftId — cannot verify.',
        };
    }

    try {
        let verifyUrl: string;
        let authHeader: string;

        switch (target.platform) {
            case 'wordpress': {
                verifyUrl = `${target.baseUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts/${publishResult.draftId}`;
                authHeader = `Basic ${target.applicationPassword}`;
                break;
            }
            case 'contentful': {
                verifyUrl = `https://api.contentful.com/spaces/${target.spaceId}/environments/${target.environmentId}/entries/${publishResult.draftId}`;
                authHeader = `Bearer ${target.accessToken}`;
                break;
            }
            case 'hubspot': {
                verifyUrl = `https://api.hubapi.com/cms/v3/blogs/posts/${publishResult.draftId}`;
                authHeader = `Bearer ${target.accessToken}`;
                break;
            }
            case 'medium': {
                verifyUrl = `https://api.medium.com/v1/users/${target.authorId}/posts/${publishResult.draftId}`;
                authHeader = `Bearer ${target.accessToken}`;
                break;
            }
            case 'ghost': {
                verifyUrl = `${target.baseUrl.replace(/\/$/, '')}/ghost/api/admin/posts/${publishResult.draftId}/`;
                let ghostToken: string;
                try {
                    ghostToken = buildGhostAdminToken(target.adminApiKey);
                } catch (err) {
                    return { ok: false, httpStatus: null, renderedTitleFound: false, errorMessage: String(err) };
                }
                authHeader = `Ghost ${ghostToken}`;
                break;
            }
            default: {
                const _: never = target;
                void _;
                return { ok: false, httpStatus: null, renderedTitleFound: false, errorMessage: 'Unknown CMS platform for verification.' };
            }
        }

        const response = await fetchFn(verifyUrl, {
            method: 'GET',
            headers: { Authorization: authHeader, Accept: 'application/json' },
        });

        if (!response.ok) {
            return {
                ok: false,
                httpStatus: response.status,
                renderedTitleFound: false,
                errorMessage: `Verification GET returned HTTP ${response.status}.`,
            };
        }

        const json = (await response.json()) as Record<string, unknown>;
        // Check if the expected title appears anywhere in the serialised response
        const responseText = JSON.stringify(json).toLowerCase();
        const renderedTitleFound = responseText.includes(expectedTitle.toLowerCase().slice(0, 40));

        return {
            ok: renderedTitleFound,
            httpStatus: response.status,
            renderedTitleFound,
            errorMessage: renderedTitleFound ? null : 'Title not found in CMS response — draft may not have saved correctly.',
        };
    } catch (err) {
        return { ok: false, httpStatus: null, renderedTitleFound: false, errorMessage: String(err) };
    }
}
