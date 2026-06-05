import test from 'node:test';
import assert from 'node:assert/strict';
import { SarvamRealtimeSttClient, type WsLike, type WsFactory } from './sarvam-realtime-stt.js';

// ---------------------------------------------------------------------------
// Mock WebSocket factory
// ---------------------------------------------------------------------------

type MockWs = WsLike & {
    sentMessages: Array<string | ArrayBuffer | Buffer | Uint8Array>;
    _emitOpen(): void;
    _emitMessage(data: string): void;
    _emitError(): void;
    _emitClose(): void;
    closeCalled: boolean;
};

function makeMockWs(): MockWs {
    const ws: MockWs = {
        readyState: 1,
        onopen: null,
        onmessage: null,
        onclose: null,
        onerror: null,
        sentMessages: [],
        closeCalled: false,
        send(data) { this.sentMessages.push(data); },
        close() { this.closeCalled = true; },
        _emitOpen() { this.onopen?.({}); },
        _emitMessage(data) { this.onmessage?.({ data }); },
        _emitError() { this.onerror?.({}); },
        _emitClose() { this.onclose?.({}); },
    };
    return ws;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('SarvamRealtimeSttClient — constructor requires apiKey', () => {
    assert.throws(
        () => new SarvamRealtimeSttClient({ apiKey: '', callbacks: { onPartialTranscript: () => {}, onFinalTranscript: () => {} } }),
        /apiKey is required/,
    );
});

test('SarvamRealtimeSttClient — startSession opens WebSocket with correct URL', () => {
    let capturedUrl = '';
    const mockWs = makeMockWs();
    const factory: WsFactory = (url) => { capturedUrl = url; return mockWs; };

    const client = new SarvamRealtimeSttClient({
        apiKey: 'test-key',
        languageCode: 'hi-IN',
        model: 'saarika:v2',
        callbacks: { onPartialTranscript: () => {}, onFinalTranscript: () => {} },
        wsFactory: factory,
    });
    client.startSession();

    assert.ok(capturedUrl.includes('speech-to-text/transcribe/ws'), 'URL should include STT path');
    assert.ok(capturedUrl.includes('api-subscription-key=test-key'), 'URL should include API key');
    assert.ok(capturedUrl.includes('language_code=hi-IN'), 'URL should include language code');
    assert.ok(capturedUrl.includes('model=saarika%3Av2'), 'URL should include model');
});

test('SarvamRealtimeSttClient — emits partial transcript', () => {
    const partials: string[] = [];
    const mockWs = makeMockWs();
    const factory: WsFactory = () => mockWs;

    const client = new SarvamRealtimeSttClient({
        apiKey: 'key',
        callbacks: { onPartialTranscript: (t) => partials.push(t), onFinalTranscript: () => {} },
        wsFactory: factory,
    });
    client.startSession();
    mockWs._emitOpen();
    mockWs._emitMessage(JSON.stringify({ transcript: 'नमस्ते', is_final: false }));

    assert.deepEqual(partials, ['नमस्ते']);
});

test('SarvamRealtimeSttClient — emits final transcript with detected language', () => {
    const finals: Array<{ text: string; lang: string }> = [];
    const mockWs = makeMockWs();
    const factory: WsFactory = () => mockWs;

    const client = new SarvamRealtimeSttClient({
        apiKey: 'key',
        languageCode: 'hi-IN',
        callbacks: {
            onPartialTranscript: () => {},
            onFinalTranscript: (t, lang) => finals.push({ text: t, lang }),
        },
        wsFactory: factory,
    });
    client.startSession();
    mockWs._emitOpen();
    mockWs._emitMessage(JSON.stringify({ transcript: 'Hello', is_final: true, language_code: 'en-IN' }));

    assert.equal(finals.length, 1);
    assert.equal(finals[0]!.text, 'Hello');
    assert.equal(finals[0]!.lang, 'en-IN');
});

test('SarvamRealtimeSttClient — falls back to constructed language when response omits it', () => {
    let detectedLang = '';
    const mockWs = makeMockWs();
    const factory: WsFactory = () => mockWs;

    const client = new SarvamRealtimeSttClient({
        apiKey: 'key',
        languageCode: 'ta-IN',
        callbacks: {
            onPartialTranscript: () => {},
            onFinalTranscript: (_t, lang) => { detectedLang = lang; },
        },
        wsFactory: factory,
    });
    client.startSession();
    mockWs._emitOpen();
    mockWs._emitMessage(JSON.stringify({ transcript: 'வணக்கம்', is_final: true }));

    assert.equal(detectedLang, 'ta-IN');
});

test('SarvamRealtimeSttClient — sendAudioChunk sends binary via WebSocket', () => {
    const mockWs = makeMockWs();
    const factory: WsFactory = () => mockWs;

    const client = new SarvamRealtimeSttClient({
        apiKey: 'key',
        callbacks: { onPartialTranscript: () => {}, onFinalTranscript: () => {} },
        wsFactory: factory,
    });
    client.startSession();
    const chunk = new Uint8Array([0x00, 0xff, 0x01]).buffer;
    client.sendAudioChunk(chunk);

    assert.equal(mockWs.sentMessages.length, 1);
});

test('SarvamRealtimeSttClient — endSession closes WebSocket and stops reconnect', () => {
    const mockWs = makeMockWs();
    const factory: WsFactory = () => mockWs;

    const client = new SarvamRealtimeSttClient({
        apiKey: 'key',
        callbacks: { onPartialTranscript: () => {}, onFinalTranscript: () => {} },
        wsFactory: factory,
    });
    client.startSession();
    client.endSession();

    assert.equal(mockWs.closeCalled, true);
});

test('SarvamRealtimeSttClient — ignores malformed JSON messages', () => {
    let errorCalled = false;
    const mockWs = makeMockWs();
    const factory: WsFactory = () => mockWs;

    const client = new SarvamRealtimeSttClient({
        apiKey: 'key',
        callbacks: {
            onPartialTranscript: () => {},
            onFinalTranscript: () => {},
            onError: () => { errorCalled = true; },
        },
        wsFactory: factory,
    });
    client.startSession();
    mockWs._emitMessage('{not-json}');

    assert.equal(errorCalled, false, 'onError should NOT be called for malformed JSON');
});

test('SarvamRealtimeSttClient — calls onError on WebSocket error', () => {
    let errorMsg = '';
    const mockWs = makeMockWs();
    const factory: WsFactory = () => mockWs;

    const client = new SarvamRealtimeSttClient({
        apiKey: 'key',
        callbacks: {
            onPartialTranscript: () => {},
            onFinalTranscript: () => {},
            onError: (e) => { errorMsg = e.message; },
        },
        wsFactory: factory,
    });
    client.startSession();
    mockWs._emitError();

    assert.ok(errorMsg.length > 0, 'onError should be called');
});
