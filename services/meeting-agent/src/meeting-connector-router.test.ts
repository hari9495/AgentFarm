import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectPlatform, MeetingConnectorRouter } from './meeting-connector-router.js';
import { BrowserJoinAdapter } from './adapters/browser-join-adapter.js';
import { TeamsJoinAdapter } from './adapters/teams-join-adapter.js';
import { ZoomJoinAdapter } from './adapters/zoom-join-adapter.js';
import { SipJoinAdapter } from './adapters/sip-join-adapter.js';

// ── detectPlatform ────────────────────────────────────────────────────────────

describe('detectPlatform', () => {
    it('detects teams.microsoft.com', () => {
        assert.equal(detectPlatform('https://teams.microsoft.com/l/meetup-join/abc'), 'teams');
    });

    it('detects teams.live.com', () => {
        assert.equal(detectPlatform('https://teams.live.com/meet/abc'), 'teams');
    });

    it('detects zoom.us', () => {
        assert.equal(detectPlatform('https://zoom.us/j/123456789'), 'zoom');
    });

    it('detects custom zoom subdomain', () => {
        assert.equal(detectPlatform('https://mycompany.zoom.us/j/987654321'), 'zoom');
    });

    it('detects meet.google.com', () => {
        assert.equal(detectPlatform('https://meet.google.com/abc-defg-hij'), 'meet');
    });

    it('detects webex.com', () => {
        assert.equal(detectPlatform('https://myorg.webex.com/meet/user'), 'webex');
    });

    it('returns null for an unknown URL', () => {
        assert.equal(detectPlatform('https://whereby.com/my-room'), null);
    });

    it('returns null for a non-meeting URL', () => {
        assert.equal(detectPlatform('https://example.com/page'), null);
    });

    it('returns null for an empty-ish URL', () => {
        assert.equal(detectPlatform('https://google.com'), null);
    });
});

// ── Shared adapter factories (no real network) ────────────────────────────────

const noopFetch = async () => ({
    ok: true, status: 200,
    json: async () => ({}),
    text: async () => '',
});

function makeTeams(): TeamsJoinAdapter {
    return new TeamsJoinAdapter({
        tenantId: 't1', clientId: 'c1', clientSecret: 's1', fetchImpl: noopFetch,
    });
}
function makeZoom(): ZoomJoinAdapter {
    return new ZoomJoinAdapter({
        accountId: 'a1', clientId: 'c1', clientSecret: 's1', fetchImpl: noopFetch,
    });
}
function makeSip(): SipJoinAdapter {
    return new SipJoinAdapter({ eslHost: '127.0.0.1', eslPassword: 'pw' });
}
function makeBrowser(): BrowserJoinAdapter {
    return new BrowserJoinAdapter({ desktopAgentUrl: 'http://desktop-agent:5003', fetchImpl: noopFetch });
}

// ── MeetingConnectorRouter — adapter selection ────────────────────────────────

describe('MeetingConnectorRouter — Teams URL', () => {
    const teamsUrl = 'https://teams.microsoft.com/l/meetup-join/abc';

    it('selects TeamsJoinAdapter when Teams adapter configured', () => {
        const router = new MeetingConnectorRouter({ teamsAdapter: makeTeams() });
        const result = router.resolve(teamsUrl);
        assert.ok(result);
        assert.equal(result.platform, 'teams');
        assert.ok(result.adapter instanceof TeamsJoinAdapter);
    });

    it('falls back to BrowserJoinAdapter when no Teams adapter', () => {
        const router = new MeetingConnectorRouter({ teamsAdapter: null, browserAdapter: makeBrowser() });
        const result = router.resolve(teamsUrl);
        assert.ok(result);
        assert.ok(result.adapter instanceof BrowserJoinAdapter);
    });
});

describe('MeetingConnectorRouter — Zoom URL', () => {
    const zoomUrl = 'https://zoom.us/j/123456789';

    it('selects ZoomJoinAdapter when Zoom configured', () => {
        const router = new MeetingConnectorRouter({ zoomAdapter: makeZoom() });
        const result = router.resolve(zoomUrl);
        assert.ok(result);
        assert.equal(result.platform, 'zoom');
        assert.ok(result.adapter instanceof ZoomJoinAdapter);
    });

    it('falls back to SipJoinAdapter when no Zoom but SIP configured', () => {
        const router = new MeetingConnectorRouter({ zoomAdapter: null, sipAdapter: makeSip() });
        const result = router.resolve(zoomUrl);
        assert.ok(result);
        assert.ok(result.adapter instanceof SipJoinAdapter);
    });

    it('falls back to BrowserJoinAdapter when neither Zoom nor SIP configured', () => {
        const router = new MeetingConnectorRouter({ zoomAdapter: null, sipAdapter: null, browserAdapter: makeBrowser() });
        const result = router.resolve(zoomUrl);
        assert.ok(result);
        assert.ok(result.adapter instanceof BrowserJoinAdapter);
    });
});

describe('MeetingConnectorRouter — Meet / Webex URL', () => {
    it('selects SipJoinAdapter for Meet when SIP configured', () => {
        const router = new MeetingConnectorRouter({ sipAdapter: makeSip() });
        const result = router.resolve('https://meet.google.com/abc-defg-hij');
        assert.ok(result);
        assert.ok(result.adapter instanceof SipJoinAdapter);
    });

    it('selects SipJoinAdapter for Webex when SIP configured', () => {
        const router = new MeetingConnectorRouter({ sipAdapter: makeSip() });
        const result = router.resolve('https://myorg.webex.com/meet/user');
        assert.ok(result);
        assert.ok(result.adapter instanceof SipJoinAdapter);
    });

    it('falls back to BrowserJoinAdapter for Meet when no SIP', () => {
        const router = new MeetingConnectorRouter({ sipAdapter: null, browserAdapter: makeBrowser() });
        const result = router.resolve('https://meet.google.com/abc-defg-hij');
        assert.ok(result);
        assert.ok(result.adapter instanceof BrowserJoinAdapter);
    });
});

describe('MeetingConnectorRouter — unknown URL', () => {
    it('selects BrowserJoinAdapter for unrecognised URL', () => {
        const router = new MeetingConnectorRouter({ browserAdapter: makeBrowser() });
        const result = router.resolve('https://whereby.com/my-room');
        assert.ok(result);
        assert.ok(result.adapter instanceof BrowserJoinAdapter);
    });

    it('returns null when no adapters configured at all', () => {
        const router = new MeetingConnectorRouter({
            teamsAdapter: null, zoomAdapter: null, sipAdapter: null, browserAdapter: null,
        });
        const result = router.resolve('https://zoom.us/j/123');
        assert.equal(result, null);
    });
});

describe('MeetingConnectorRouter.explain()', () => {
    it('returns a non-empty descriptive string', () => {
        const router = new MeetingConnectorRouter({ teamsAdapter: makeTeams() });
        const explanation = router.explain('https://teams.microsoft.com/l/meetup-join/abc');
        assert.ok(explanation.includes('teams'));
        assert.ok(explanation.includes('TeamsJoinAdapter'));
    });

    it('reports "no adapters configured" when nothing is set', () => {
        const router = new MeetingConnectorRouter({
            teamsAdapter: null, zoomAdapter: null, sipAdapter: null, browserAdapter: null,
        });
        assert.equal(router.explain('https://zoom.us/j/1'), 'no adapters configured');
    });
});
