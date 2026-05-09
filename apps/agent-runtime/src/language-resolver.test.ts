import test from 'node:test';
import assert from 'node:assert/strict';
import {
    detectTextLanguage,
    getOutputLanguage,
    learnUserLanguage,
    resolveLanguage,
    type ResolvedLanguage,
    type LanguageContext,
} from './language-resolver.js';

// ---------------------------------------------------------------------------
// GROUP 1: detectTextLanguage (pure, no fetch — no mocks needed)
// ---------------------------------------------------------------------------

test('detectTextLanguage detects Japanese from hiragana text', () => {
    const result = detectTextLanguage('このタスクの進捗を教えてください');
    assert.strictEqual(result.language, 'ja');
    assert.ok(result.confidence >= 0.90, `expected confidence >= 0.90, got ${result.confidence}`);
});

test('detectTextLanguage detects Japanese from katakana text', () => {
    const result = detectTextLanguage('アジェントファームのテスト');
    assert.strictEqual(result.language, 'ja');
    assert.ok(result.confidence >= 0.90, `expected confidence >= 0.90, got ${result.confidence}`);
});

test('detectTextLanguage detects Korean from Hangul text', () => {
    const result = detectTextLanguage('안녕하세요 에이전트팜입니다');
    assert.strictEqual(result.language, 'ko');
    assert.ok(result.confidence >= 0.90, `expected confidence >= 0.90, got ${result.confidence}`);
});

test('detectTextLanguage detects Arabic text', () => {
    const result = detectTextLanguage('مرحبا بك في نظام الوكيل');
    assert.strictEqual(result.language, 'ar');
    assert.ok(result.confidence >= 0.88, `expected confidence >= 0.88, got ${result.confidence}`);
});

test('detectTextLanguage detects Hindi from Devanagari text', () => {
    const result = detectTextLanguage('नमस्ते यह एजेंट सिस्टम है');
    assert.strictEqual(result.language, 'hi');
    assert.ok(result.confidence >= 0.88, `expected confidence >= 0.88, got ${result.confidence}`);
});

test('detectTextLanguage defaults to English for ASCII text', () => {
    const result = detectTextLanguage('Hello this is a task update');
    assert.strictEqual(result.language, 'en');
});

test('detectTextLanguage defaults to English for short text under threshold', () => {
    const result = detectTextLanguage('OK');
    assert.strictEqual(result.language, 'en');
});

test('detectTextLanguage handles empty string without throwing', () => {
    let result: ReturnType<typeof detectTextLanguage> | undefined;
    assert.doesNotThrow(() => {
        result = detectTextLanguage('');
    });
    assert.strictEqual(result?.language, 'en');
});

// ---------------------------------------------------------------------------
// GROUP 2: getOutputLanguage (pure, no fetch — no mocks needed)
// ---------------------------------------------------------------------------

const jaResolved: ResolvedLanguage = { language: 'ja', source: 'audio', confidence: 0.95 };
const enResolved: ResolvedLanguage = { language: 'en', source: 'default', confidence: 0.50 };

test('getOutputLanguage always returns en for pr regardless of detected language', () => {
    assert.strictEqual(getOutputLanguage(jaResolved, 'pr'), 'en');
});

test('getOutputLanguage always returns en for ticket regardless of detected language', () => {
    assert.strictEqual(getOutputLanguage(jaResolved, 'ticket'), 'en');
});

test('getOutputLanguage returns detected language for meeting', () => {
    assert.strictEqual(getOutputLanguage(jaResolved, 'meeting'), 'ja');
});

test('getOutputLanguage returns detected language for chat', () => {
    assert.strictEqual(getOutputLanguage(jaResolved, 'chat'), 'ja');
});

test('getOutputLanguage returns en for meeting when language is already en', () => {
    assert.strictEqual(getOutputLanguage(enResolved, 'meeting'), 'en');
});

// ---------------------------------------------------------------------------
// GROUP 3: learnUserLanguage (fetch mock needed)
// ---------------------------------------------------------------------------

test('learnUserLanguage calls POST /v1/language/user with correct headers and body', async (t) => {
    process.env['API_GATEWAY_URL'] = 'http://localhost:3001';
    const calls: Array<{ url: string; options: RequestInit }> = [];

    t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
        calls.push({ url, options });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    await learnUserLanguage('t1', 'u1', 'ja', 0.92);

    assert.strictEqual(calls.length, 1);
    assert.ok(
        calls[0]!.url.includes('/v1/language/user'),
        `expected URL to include /v1/language/user, got: ${calls[0]?.url}`,
    );
    const options = calls[0]!.options;
    assert.strictEqual(options.method, 'POST');
    const headers = options.headers as Record<string, string>;
    assert.strictEqual(headers['x-tenant-id'], 't1');
    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    assert.strictEqual(body['userId'], 'u1');
    assert.strictEqual(body['language'], 'ja');
    assert.strictEqual(body['confidence'], 0.92);
});

test('learnUserLanguage does not throw when fetch rejects', async (t) => {
    process.env['API_GATEWAY_URL'] = 'http://localhost:3001';

    t.mock.method(globalThis, 'fetch', async () => {
        throw new Error('network error');
    });

    await assert.doesNotReject(
        () => learnUserLanguage('t1', 'u1', 'ja', 0.92),
        'learnUserLanguage should resolve even when fetch throws',
    );
});

test('learnUserLanguage does not throw when API returns non-200', async (t) => {
    process.env['API_GATEWAY_URL'] = 'http://localhost:3001';

    t.mock.method(globalThis, 'fetch', async () => {
        return new Response('Internal Server Error', { status: 500 });
    });

    await assert.doesNotReject(
        () => learnUserLanguage('t1', 'u1', 'ja', 0.92),
        'learnUserLanguage should resolve even when fetch returns 500',
    );
});

// ---------------------------------------------------------------------------
// GROUP 4: resolveLanguage (fetch mock needed)
// ---------------------------------------------------------------------------

test('resolveLanguage returns audio language immediately when confidence >= 0.85', async (t) => {
    process.env['API_GATEWAY_URL'] = 'http://localhost:3001';
    let fetchCalled = false;

    t.mock.method(globalThis, 'fetch', async () => {
        fetchCalled = true;
        return new Response('{}', { status: 200 });
    });

    // No userId so learnUserLanguage is not triggered, no fetch call expected
    const ctx: LanguageContext = { tenantId: 't1', audioLanguage: 'ja', confidence: 0.92 };
    const result = await resolveLanguage(ctx);

    assert.strictEqual(result.language, 'ja');
    assert.strictEqual(result.source, 'audio');
    assert.strictEqual(fetchCalled, false, 'fetch should not be called — audio source short-circuits the chain');
});

test('resolveLanguage returns text-detected language when confidence >= 0.90', async (t) => {
    process.env['API_GATEWAY_URL'] = 'http://localhost:3001';

    // Defensive mock in case fetch is called unexpectedly
    t.mock.method(globalThis, 'fetch', async () => {
        return new Response('{}', { status: 200 });
    });

    // No userId so learnUserLanguage is not triggered even after text detection
    const ctx: LanguageContext = { tenantId: 't1', inputText: 'このタスクの進捗を教えてください' };
    const result = await resolveLanguage(ctx);

    assert.strictEqual(result.language, 'ja');
    assert.strictEqual(result.source, 'text');
});

test('resolveLanguage falls through to user profile when text confidence is low', async (t) => {
    process.env['API_GATEWAY_URL'] = 'http://localhost:3001';

    t.mock.method(globalThis, 'fetch', async (url: string) => {
        if ((url as string).includes('/v1/language/user/')) {
            return new Response(JSON.stringify({ detectedLanguage: 'ko' }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
    });

    // 'OK' produces confidence 0.50 — below the 0.90 threshold for text detection
    const ctx: LanguageContext = { tenantId: 't1', userId: 'u1', inputText: 'OK' };
    const result = await resolveLanguage(ctx);

    assert.strictEqual(result.language, 'ko');
    assert.strictEqual(result.source, 'user_profile');
});

test('resolveLanguage falls through to default en when all fetches fail', async (t) => {
    process.env['API_GATEWAY_URL'] = 'http://localhost:3001';

    t.mock.method(globalThis, 'fetch', async () => {
        throw new Error('network error');
    });

    // Low-confidence text — triggers user profile, workspace, and tenant fetches (all fail)
    const ctx: LanguageContext = { tenantId: 't1', userId: 'u1', inputText: 'OK' };
    const result = await resolveLanguage(ctx);

    assert.strictEqual(result.language, 'en');
    assert.strictEqual(result.source, 'default');
});

test('resolveLanguage returns en default when tenantId is empty and API_GATEWAY_URL is unset', async () => {
    // Empty base URL — all fetch steps are guarded by `if (base)` and skipped
    process.env['API_GATEWAY_URL'] = '';

    const ctx: LanguageContext = { tenantId: '' };
    const result = await resolveLanguage(ctx);

    assert.strictEqual(result.language, 'en');
    assert.strictEqual(result.source, 'default');
});
