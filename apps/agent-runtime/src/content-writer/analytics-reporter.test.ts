import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { fetchAnalyticsReport, fetchMixpanelReport } from './analytics-reporter.js';
import type { AnalyticsQuery, AnalyticsFetchFn, MixpanelQuery } from './analytics-reporter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeQuery(overrides: Partial<AnalyticsQuery> = {}): AnalyticsQuery {
    return {
        propertyId: 'properties/123456789',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        accessToken: 'test-bearer-token',
        ...overrides,
    };
}

function makeGa4Response(rows: { pagePath: string; sessions: string; views: string; engagement: string; bounce: string }[]): unknown {
    return {
        rowCount: rows.length,
        rows: rows.map((r) => ({
            dimensionValues: [{ value: r.pagePath }],
            metricValues: [
                { value: r.sessions },
                { value: r.views },
                { value: r.engagement },
                { value: r.bounce },
            ],
        })),
    };
}

function stubFetch(response: unknown, httpStatus = 200): AnalyticsFetchFn {
    return async () => ({
        ok: httpStatus >= 200 && httpStatus < 300,
        status: httpStatus,
        json: async () => response,
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fetchAnalyticsReport', () => {

    test('returns structured report with correct page metrics when GA4 responds ok', async () => {
        const ga4Response = makeGa4Response([
            { pagePath: '/blog/post-a', sessions: '120', views: '200', engagement: '95.5', bounce: '0.35' },
            { pagePath: '/blog/post-b', sessions: '80', views: '130', engagement: '60.0', bounce: '0.50' },
        ]);

        const report = await fetchAnalyticsReport(makeQuery(), stubFetch(ga4Response));

        assert.equal(report.ok, true);
        assert.equal(report.errorMessage, null);
        assert.equal(report.propertyId, 'properties/123456789');
        assert.equal(report.pages.length, 2);

        const postA = report.pages.find((p) => p.pagePath === '/blog/post-a');
        assert.ok(postA, 'post-a should be in pages');
        assert.equal(postA!.sessions, 120);
        assert.equal(postA!.pageViews, 200);
        assert.ok(Math.abs(postA!.avgEngagementTimeSec - 95.5) < 0.01);
        assert.ok(Math.abs(postA!.bounceRate - 0.35) < 0.001);
    });

    test('totals aggregate correctly across all pages', async () => {
        const ga4Response = makeGa4Response([
            { pagePath: '/a', sessions: '100', views: '150', engagement: '60', bounce: '0.40' },
            { pagePath: '/b', sessions: '200', views: '300', engagement: '90', bounce: '0.20' },
        ]);

        const report = await fetchAnalyticsReport(makeQuery(), stubFetch(ga4Response));

        assert.equal(report.totals.sessions, 300);
        assert.equal(report.totals.pageViews, 450);
        assert.ok(Math.abs(report.totals.avgEngagementTimeSec - 75) < 0.01, 'average engagement should be (60+90)/2=75');
        assert.ok(Math.abs(report.totals.avgBounceRate - 0.30) < 0.001, 'average bounce rate should be (0.40+0.20)/2=0.30');
    });

    test('summary string contains period, sessions, and top page', async () => {
        const ga4Response = makeGa4Response([
            { pagePath: '/top-article', sessions: '500', views: '800', engagement: '120', bounce: '0.25' },
            { pagePath: '/other', sessions: '50', views: '60', engagement: '30', bounce: '0.60' },
        ]);

        const report = await fetchAnalyticsReport(makeQuery(), stubFetch(ga4Response));

        assert.ok(report.summary.includes('2025-01-01'), 'summary should include startDate');
        assert.ok(report.summary.includes('2025-01-31'), 'summary should include endDate');
        assert.ok(report.summary.includes('/top-article'), 'summary should name the top page');
        assert.ok(report.summary.includes('sessions'), 'summary should mention sessions');
    });

    test('returns ok=false with errorMessage when GA4 returns HTTP error', async () => {
        const report = await fetchAnalyticsReport(makeQuery(), stubFetch({}, 403));

        assert.equal(report.ok, false);
        assert.ok(report.errorMessage?.includes('403'), 'errorMessage should include the HTTP status');
        assert.equal(report.pages.length, 0);
        assert.equal(report.totals.sessions, 0);
    });

    test('returns ok=false with errorMessage when fetch throws a network error', async () => {
        const throwingFetch: AnalyticsFetchFn = async () => {
            throw new Error('ECONNREFUSED');
        };

        const report = await fetchAnalyticsReport(makeQuery(), throwingFetch);

        assert.equal(report.ok, false);
        assert.ok(report.errorMessage?.includes('ECONNREFUSED'), 'errorMessage should capture network error');
        assert.equal(report.pages.length, 0);
    });

    test('handles GA4 response with no rows gracefully', async () => {
        const emptyResponse = { rowCount: 0 };

        const report = await fetchAnalyticsReport(makeQuery(), stubFetch(emptyResponse));

        assert.equal(report.ok, true);
        assert.equal(report.pages.length, 0);
        assert.equal(report.totals.sessions, 0);
        assert.ok(report.summary.includes('No page data'), 'summary should mention no data');
    });

    test('passes pagePath filter in request body when query includes pagePath', async () => {
        let capturedBody = '';
        const captureFetch: AnalyticsFetchFn = async (_url, init) => {
            capturedBody = init.body;
            return { ok: true, status: 200, json: async () => ({ rowCount: 0 }) };
        };

        await fetchAnalyticsReport(makeQuery({ pagePath: '/blog/' }), captureFetch);

        const parsed = JSON.parse(capturedBody) as { dimensionFilter?: { filter?: { fieldName: string; stringFilter?: { value: string } } } };
        assert.ok(parsed.dimensionFilter, 'request body should contain dimensionFilter');
        assert.equal(parsed.dimensionFilter?.filter?.fieldName, 'pagePath');
        assert.equal(parsed.dimensionFilter?.filter?.stringFilter?.value, '/blog/');
    });

    test('omits dimensionFilter from request body when no pagePath given', async () => {
        let capturedBody = '';
        const captureFetch: AnalyticsFetchFn = async (_url, init) => {
            capturedBody = init.body;
            return { ok: true, status: 200, json: async () => ({ rowCount: 0 }) };
        };

        await fetchAnalyticsReport(makeQuery(), captureFetch);

        const parsed = JSON.parse(capturedBody) as { dimensionFilter?: unknown };
        assert.ok(!parsed.dimensionFilter, 'request body should NOT contain dimensionFilter when no pagePath');
    });

    test('sends Authorization header with Bearer token (does not log token)', async () => {
        let capturedHeaders: Record<string, string> = {};
        const captureFetch: AnalyticsFetchFn = async (_url, init) => {
            capturedHeaders = init.headers;
            return { ok: true, status: 200, json: async () => ({ rowCount: 0 }) };
        };

        await fetchAnalyticsReport(makeQuery({ accessToken: 'super-secret-token' }), captureFetch);

        assert.equal(capturedHeaders['Authorization'], 'Bearer super-secret-token');
        // Verify the token is not echoed anywhere in the report summary
        const report = await fetchAnalyticsReport(makeQuery({ accessToken: 'super-secret-token' }), stubFetch({ rowCount: 0 }));
        assert.ok(!report.summary.includes('super-secret-token'), 'summary must not contain the access token');
    });

    test('page views and sessions are integers (rounded from GA4 float strings)', async () => {
        const ga4Response = makeGa4Response([
            { pagePath: '/p', sessions: '99.9', views: '150.1', engagement: '45.0', bounce: '0.3' },
        ]);

        const report = await fetchAnalyticsReport(makeQuery(), stubFetch(ga4Response));
        assert.equal(report.pages[0]!.sessions, 100);
        assert.equal(report.pages[0]!.pageViews, 150);
    });

    test('report includes fetchedAt ISO timestamp', async () => {
        const report = await fetchAnalyticsReport(makeQuery(), stubFetch({ rowCount: 0 }));
        assert.ok(typeof report.fetchedAt === 'string');
        assert.ok(!isNaN(Date.parse(report.fetchedAt)), 'fetchedAt must be a valid ISO date string');
    });
});

// ---------------------------------------------------------------------------
// fetchMixpanelReport
// ---------------------------------------------------------------------------

function makeMixpanelQuery(overrides: Partial<MixpanelQuery> = {}): MixpanelQuery {
    return {
        projectId: 'proj-123',
        fromDate: '2025-01-01',
        toDate: '2025-01-31',
        serviceAccountUsername: 'svc@example.com',
        serviceAccountSecret: 'secret-abc',
        ...overrides,
    };
}

function makeMixpanelResponse(values: Record<string, Record<string, number>>): unknown {
    return { data: { series: Object.keys(values[Object.keys(values)[0] ?? ''] ?? {}), values } };
}

function stubMixpanelFetch(response: unknown, httpStatus = 200): AnalyticsFetchFn {
    return async () => ({
        ok: httpStatus >= 200 && httpStatus < 300,
        status: httpStatus,
        json: async () => response,
    });
}

describe('fetchMixpanelReport', () => {

    test('returns structured report with correct event metrics', async () => {
        const mixResponse = makeMixpanelResponse({
            'Page View': { '2025-01-01': 200, '2025-01-15': 150 },
            'Sign Up': { '2025-01-01': 30, '2025-01-15': 20 },
        });

        const report = await fetchMixpanelReport(makeMixpanelQuery(), stubMixpanelFetch(mixResponse));

        assert.equal(report.ok, true);
        assert.equal(report.errorMessage, null);
        assert.equal(report.projectId, 'proj-123');
        assert.equal(report.events.length, 2);

        const pageView = report.events.find((e) => e.event === 'Page View');
        assert.ok(pageView, 'Page View event should be present');
        assert.equal(pageView!.count, 350);

        const signUp = report.events.find((e) => e.event === 'Sign Up');
        assert.ok(signUp, 'Sign Up event should be present');
        assert.equal(signUp!.count, 50);
    });

    test('totals aggregate correctly', async () => {
        const mixResponse = makeMixpanelResponse({
            'Click': { '2025-01-01': 100, '2025-01-02': 200 },
            'View': { '2025-01-01': 50, '2025-01-02': 50 },
        });

        const report = await fetchMixpanelReport(makeMixpanelQuery(), stubMixpanelFetch(mixResponse));

        assert.equal(report.totals.totalEvents, 400);
        assert.equal(report.totals.uniqueEventTypes, 2);
    });

    test('summary string contains date range and top event name', async () => {
        const mixResponse = makeMixpanelResponse({
            'Purchase': { '2025-01-01': 500 },
            'Browse': { '2025-01-01': 100 },
        });

        const report = await fetchMixpanelReport(makeMixpanelQuery(), stubMixpanelFetch(mixResponse));

        assert.ok(report.summary.includes('2025-01-01'), 'summary should include fromDate');
        assert.ok(report.summary.includes('2025-01-31'), 'summary should include toDate');
        assert.ok(report.summary.includes('Purchase'), 'summary should name the top event');
    });

    test('returns ok=false with errorMessage when Mixpanel returns HTTP error', async () => {
        const report = await fetchMixpanelReport(makeMixpanelQuery(), stubMixpanelFetch({}, 401));

        assert.equal(report.ok, false);
        assert.ok(report.errorMessage?.includes('401'), 'errorMessage should include status code');
        assert.equal(report.events.length, 0);
    });

    test('returns ok=false when fetch throws a network error', async () => {
        const throwingFetch: AnalyticsFetchFn = async () => {
            throw new Error('ECONNREFUSED');
        };

        const report = await fetchMixpanelReport(makeMixpanelQuery(), throwingFetch);

        assert.equal(report.ok, false);
        assert.ok(report.errorMessage?.includes('ECONNREFUSED'));
        assert.equal(report.events.length, 0);
    });

    test('returns ok=false when Mixpanel response has error field', async () => {
        const errorResponse = { error: 'Invalid project ID' };
        const report = await fetchMixpanelReport(makeMixpanelQuery(), stubMixpanelFetch(errorResponse));

        assert.equal(report.ok, false);
        assert.ok(report.errorMessage?.includes('Invalid project ID'));
    });

    test('handles empty events gracefully (no values in response)', async () => {
        const emptyResponse = { data: { series: [], values: {} } };
        const report = await fetchMixpanelReport(makeMixpanelQuery(), stubMixpanelFetch(emptyResponse));

        assert.equal(report.ok, true);
        assert.equal(report.events.length, 0);
        assert.equal(report.totals.totalEvents, 0);
        assert.ok(report.summary.includes('No event data'));
    });

    test('sends Basic auth header using serviceAccountUsername:serviceAccountSecret', async () => {
        let capturedHeaders: Record<string, string> = {};
        const captureFetch: AnalyticsFetchFn = async (_url, init) => {
            capturedHeaders = init.headers;
            return { ok: true, status: 200, json: async () => ({ data: { values: {} } }) };
        };

        await fetchMixpanelReport(
            makeMixpanelQuery({ serviceAccountUsername: 'user@example.com', serviceAccountSecret: 'my-secret' }),
            captureFetch,
        );

        const expected = Buffer.from('user@example.com:my-secret').toString('base64');
        assert.equal(capturedHeaders['Authorization'], `Basic ${expected}`);
    });

    test('serviceAccountSecret does not appear in the report summary', async () => {
        const mixResponse = makeMixpanelResponse({ 'Event': { '2025-01-01': 1 } });
        const report = await fetchMixpanelReport(
            makeMixpanelQuery({ serviceAccountSecret: 'super-secret-password' }),
            stubMixpanelFetch(mixResponse),
        );

        assert.ok(!report.summary.includes('super-secret-password'), 'summary must not contain the service account secret');
    });

    test('includes events filter in URL query string when eventNames provided', async () => {
        let capturedUrl = '';
        const captureFetch: AnalyticsFetchFn = async (url) => {
            capturedUrl = url;
            return { ok: true, status: 200, json: async () => ({ data: { values: {} } }) };
        };

        await fetchMixpanelReport(
            makeMixpanelQuery({ events: ['Page View', 'Click'] }),
            captureFetch,
        );

        assert.ok(capturedUrl.includes('event='), 'URL should include event filter parameter');
        assert.ok(capturedUrl.includes('Page%20View') || capturedUrl.includes('Page+View') || capturedUrl.includes(encodeURIComponent('["Page View","Click"]')), 'URL should encode event names');
    });

    test('report includes fetchedAt ISO timestamp', async () => {
        const report = await fetchMixpanelReport(makeMixpanelQuery(), stubMixpanelFetch({ data: { values: {} } }));
        assert.ok(typeof report.fetchedAt === 'string');
        assert.ok(!isNaN(Date.parse(report.fetchedAt)), 'fetchedAt must be a valid ISO date string');
    });
});
