import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Fastify from 'fastify';
import { registerNpsWebhookRoutes } from './nps-webhook.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

type SurveyType = 'nps' | 'csat';

const makePrisma = (surveyType: SurveyType | null = null) => ({
    npsResponse: {
        findFirst: async (_args: unknown) => surveyType ? { surveyType } : null,
    },
} as never);

type RecordResult = { ok: boolean; error?: string };

const makeRecordFn = (result: RecordResult = { ok: true }) =>
    async (_params: unknown, _prisma: unknown): Promise<RecordResult> => result;

const buildApp = (opts: { surveyType?: SurveyType | null; recordResult?: RecordResult } = {}) => {
    const app = Fastify();
    registerNpsWebhookRoutes(app, {
        prisma: makePrisma(opts.surveyType ?? null),
        recordNpsResponse: makeRecordFn(opts.recordResult ?? { ok: true }),
    });
    return app;
};

// ---------------------------------------------------------------------------
// POST /v1/sales/nps/respond/:token — NPS (no survey row → default range 0-10)
// ---------------------------------------------------------------------------

describe('POST /v1/sales/nps/respond/:token — NPS range', () => {
    it('accepts score 0 (minimum NPS)', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/sales/nps/respond/tok1', payload: { score: 0 } });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().ok, true);
    });

    it('accepts score 10 (maximum NPS)', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/sales/nps/respond/tok1', payload: { score: 10 } });
        assert.equal(res.statusCode, 200);
    });

    it('accepts score 7 with optional feedback', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/sales/nps/respond/tok1', payload: { score: 7, feedback: 'Good product' } });
        assert.equal(res.statusCode, 200);
    });

    it('returns 400 for score -1', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/sales/nps/respond/tok1', payload: { score: -1 } });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().code, 'INVALID_SCORE');
    });

    it('returns 400 for score 11', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/sales/nps/respond/tok1', payload: { score: 11 } });
        assert.equal(res.statusCode, 400);
    });

    it('returns 400 for non-integer score', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/sales/nps/respond/tok1', payload: { score: 7.5 } });
        assert.equal(res.statusCode, 400);
        assert.ok(res.json().message.includes('integer'));
    });
});

// ---------------------------------------------------------------------------
// POST — CSAT range (surveyType=csat → 1-5)
// ---------------------------------------------------------------------------

describe('POST /v1/sales/nps/respond/:token — CSAT range', () => {
    it('accepts CSAT score 1 (minimum)', async () => {
        const app = buildApp({ surveyType: 'csat' });
        const res = await app.inject({ method: 'POST', url: '/v1/sales/nps/respond/tok1', payload: { score: 1 } });
        assert.equal(res.statusCode, 200);
    });

    it('accepts CSAT score 5 (maximum)', async () => {
        const app = buildApp({ surveyType: 'csat' });
        const res = await app.inject({ method: 'POST', url: '/v1/sales/nps/respond/tok1', payload: { score: 5 } });
        assert.equal(res.statusCode, 200);
    });

    it('returns 400 for CSAT score 0', async () => {
        const app = buildApp({ surveyType: 'csat' });
        const res = await app.inject({ method: 'POST', url: '/v1/sales/nps/respond/tok1', payload: { score: 0 } });
        assert.equal(res.statusCode, 400);
        assert.ok(res.json().message.includes('1-5'));
    });

    it('returns 400 for CSAT score 6', async () => {
        const app = buildApp({ surveyType: 'csat' });
        const res = await app.inject({ method: 'POST', url: '/v1/sales/nps/respond/tok1', payload: { score: 6 } });
        assert.equal(res.statusCode, 400);
    });
});

// ---------------------------------------------------------------------------
// POST — recordNpsResponse result
// ---------------------------------------------------------------------------

describe('POST /v1/sales/nps/respond/:token — record outcome', () => {
    it('returns 404 when recordNpsResponse returns ok:false', async () => {
        const app = buildApp({ recordResult: { ok: false, error: 'Token not found' } });
        const res = await app.inject({ method: 'POST', url: '/v1/sales/nps/respond/bad-token', payload: { score: 8 } });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().code, 'NOT_FOUND');
    });

    it('returns 200 with thank-you message when record succeeds', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'POST', url: '/v1/sales/nps/respond/tok1', payload: { score: 9 } });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().ok, true);
        assert.ok(typeof res.json().message === 'string');
    });
});

// ---------------------------------------------------------------------------
// GET /v1/sales/nps/respond/:token?score=<n>  (one-click link)
// ---------------------------------------------------------------------------

describe('GET /v1/sales/nps/respond/:token', () => {
    it('accepts valid NPS score via query param', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/sales/nps/respond/tok1?score=8' });
        assert.equal(res.statusCode, 200);
        assert.equal(res.json().ok, true);
    });

    it('returns 400 for invalid score via query param', async () => {
        const app = buildApp();
        const res = await app.inject({ method: 'GET', url: '/v1/sales/nps/respond/tok1?score=99' });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().code, 'INVALID_SCORE');
    });

    it('accepts valid CSAT score via query param', async () => {
        const app = buildApp({ surveyType: 'csat' });
        const res = await app.inject({ method: 'GET', url: '/v1/sales/nps/respond/tok1?score=4' });
        assert.equal(res.statusCode, 200);
    });
});
