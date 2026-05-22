import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { sendForReview } from './review-dispatcher.js';
import type { SendReviewRequest, ReviewFetchFn } from './review-dispatcher.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<SendReviewRequest> = {}): SendReviewRequest {
    return {
        title: 'Why TypeScript Is Worth It',
        draftBody: 'TypeScript catches bugs at compile time, reducing runtime errors significantly.',
        reviewerUrl: 'https://hooks.example.com/review',
        reviewerDisplayName: 'editor@example.com',
        channel: 'webhook',
        ...overrides,
    };
}

function stubFetch(httpStatus = 200): ReviewFetchFn {
    return async () => ({ ok: httpStatus >= 200 && httpStatus < 300, status: httpStatus });
}

function captureFetch(): { fetchFn: ReviewFetchFn; calls: { url: string; body: string; headers: Record<string, string> }[] } {
    const calls: { url: string; body: string; headers: Record<string, string> }[] = [];
    const fetchFn: ReviewFetchFn = async (url, init) => {
        calls.push({ url, body: init.body, headers: init.headers });
        return { ok: true, status: 200 };
    };
    return { fetchFn, calls };
}

// ---------------------------------------------------------------------------
// Tests — webhook channel
// ---------------------------------------------------------------------------

describe('sendForReview — webhook', () => {

    test('returns ok=true and a reviewId when delivery succeeds', async () => {
        const result = await sendForReview(makeRequest(), stubFetch(200));

        assert.equal(result.ok, true);
        assert.equal(result.errorMessage, null);
        assert.ok(typeof result.reviewId === 'string' && result.reviewId.startsWith('rev-'), 'reviewId should start with rev-');
        assert.ok(typeof result.sentAt === 'string' && !isNaN(Date.parse(result.sentAt)), 'sentAt should be ISO timestamp');
        assert.equal(result.channel, 'webhook');
        assert.equal(result.deliveredTo, 'editor@example.com');
    });

    test('posts JSON body to the reviewerUrl', async () => {
        const { fetchFn, calls } = captureFetch();
        await sendForReview(makeRequest(), fetchFn);

        assert.equal(calls.length, 1);
        assert.equal(calls[0]!.url, 'https://hooks.example.com/review');
        const payload = JSON.parse(calls[0]!.body) as Record<string, unknown>;
        assert.ok(typeof payload['reviewId'] === 'string');
        assert.equal(payload['title'], 'Why TypeScript Is Worth It');
        assert.ok(typeof payload['riskLevel'] === 'string');
    });

    test('returns ok=false with errorMessage when delivery returns HTTP 500', async () => {
        const result = await sendForReview(makeRequest(), stubFetch(500));

        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('500'));
    });

    test('returns ok=false with errorMessage when fetch throws', async () => {
        const throwingFetch: ReviewFetchFn = async () => { throw new Error('ECONNREFUSED'); };
        const result = await sendForReview(makeRequest(), throwingFetch);

        assert.equal(result.ok, false);
        assert.ok(result.errorMessage?.includes('ECONNREFUSED'));
    });

    test('infers riskLevel from draft body content', async () => {
        const lowRisk = await sendForReview(makeRequest({ draftBody: 'This is a simple blog post.' }), stubFetch());
        assert.equal(lowRisk.riskLevel, 'low');

        const highRisk = await sendForReview(makeRequest({ draftBody: 'GDPR compliance and liability indemnity clauses.' }), stubFetch());
        assert.equal(highRisk.riskLevel, 'high');
    });

    test('includes notes in webhook payload when provided', async () => {
        const { fetchFn, calls } = captureFetch();
        await sendForReview(makeRequest({ notes: 'Please check paragraph 3.' }), fetchFn);

        const payload = JSON.parse(calls[0]!.body) as Record<string, unknown>;
        assert.equal(payload['notes'], 'Please check paragraph 3.');
    });

    test('notes field is null in webhook payload when not provided', async () => {
        const { fetchFn, calls } = captureFetch();
        await sendForReview(makeRequest(), fetchFn);

        const payload = JSON.parse(calls[0]!.body) as Record<string, unknown>;
        assert.equal(payload['notes'], null);
    });
});

// ---------------------------------------------------------------------------
// Tests — slack channel
// ---------------------------------------------------------------------------

describe('sendForReview — slack', () => {

    test('posts Slack block kit JSON to the reviewerUrl', async () => {
        const { fetchFn, calls } = captureFetch();
        await sendForReview(makeRequest({ channel: 'slack' }), fetchFn);

        assert.equal(calls.length, 1);
        const payload = JSON.parse(calls[0]!.body) as { blocks?: unknown[] };
        assert.ok(Array.isArray(payload.blocks), 'Slack payload should have a blocks array');
        assert.ok(payload.blocks!.length > 0, 'blocks array should be non-empty');
    });

    test('Slack header block contains the draft title', async () => {
        const { fetchFn, calls } = captureFetch();
        await sendForReview(makeRequest({ title: 'My Review Title', channel: 'slack' }), fetchFn);

        const rawPayload = calls[0]!.body;
        assert.ok(rawPayload.includes('My Review Title'), 'Slack payload should contain draft title');
    });

    test('returns ok=true with reviewId on successful Slack delivery', async () => {
        const result = await sendForReview(makeRequest({ channel: 'slack' }), stubFetch(200));
        assert.equal(result.ok, true);
        assert.ok(result.reviewId.startsWith('rev-'));
    });
});

// ---------------------------------------------------------------------------
// Tests — email channel
// ---------------------------------------------------------------------------

describe('sendForReview — email', () => {

    test('posts email payload with subject and body', async () => {
        const { fetchFn, calls } = captureFetch();
        await sendForReview(makeRequest({ channel: 'email' }), fetchFn);

        const payload = JSON.parse(calls[0]!.body) as { subject?: string; body?: string; to?: string };
        assert.ok(typeof payload.subject === 'string', 'email payload should have subject');
        assert.ok(payload.subject!.includes('Why TypeScript Is Worth It'), 'subject should include draft title');
        assert.ok(typeof payload.body === 'string', 'email payload should have body');
        assert.equal(payload.to, 'editor@example.com');
    });

    test('email subject includes the review ID', async () => {
        let capturedSubject = '';
        const fetchFn: ReviewFetchFn = async (_url, init) => {
            capturedSubject = (JSON.parse(init.body) as { subject: string }).subject;
            return { ok: true, status: 200 };
        };

        const result = await sendForReview(makeRequest({ channel: 'email' }), fetchFn);
        assert.ok(capturedSubject.includes(result.reviewId), 'email subject should contain the review ID');
    });

    test('reviewerUrl is not exposed in the response payload', async () => {
        const result = await sendForReview(makeRequest({ reviewerUrl: 'https://secret-endpoint.internal/send' }), stubFetch());
        const resultStr = JSON.stringify(result);
        assert.ok(!resultStr.includes('secret-endpoint.internal'), 'reviewerUrl must not appear in SendReviewResult');
    });
});

// ---------------------------------------------------------------------------
// Tests — validation (via action handler)
// ---------------------------------------------------------------------------

describe('sendForReview — Content-Type header', () => {

    test('sends Content-Type: application/json for all channels', async () => {
        for (const channel of ['webhook', 'slack', 'email'] as const) {
            const { fetchFn, calls } = captureFetch();
            await sendForReview(makeRequest({ channel }), fetchFn);
            assert.equal(calls[0]!.headers['Content-Type'], 'application/json', `channel=${channel} must use JSON`);
        }
    });
});
