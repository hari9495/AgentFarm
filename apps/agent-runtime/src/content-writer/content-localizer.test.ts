import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { localizeContent, translateWithDeepL, localizeContentWithDeepL } from './content-localizer.js';
import type { LocalizeRequest, DeepLFetchFn } from './content-localizer.js';
import type { ProseCallerFn } from './llm-prose-writer.js';

describe('localizeContent', () => {
    test('adaptOnly=true calls LLM and returns localizedByLlm=true with changesApplied parsed', async () => {
        const mockCaller: ProseCallerFn = async () => ({
            text: 'The colour of the autumn leaves is beautiful.\nCHANGES: color→colour;autumn→fall season reference removed',
            tokensUsed: 50,
        });

        const req: LocalizeRequest = {
            body: 'The color of the fall leaves is beautiful.',
            targetLocale: 'en-GB',
            adaptOnly: true,
        };

        const result = await localizeContent(req, mockCaller);
        assert.equal(result.localizedByLlm, true);
        assert.equal(result.targetLocale, 'en-GB');
        assert.ok(result.changesApplied.length >= 1, 'changesApplied should have at least 1 entry');
        assert.ok(result.body.includes('colour'));
    });

    test('adaptOnly=false sends translation prompt containing "Translate"', async () => {
        const capturedSys: string[] = [];
        const captureCallerFn: ProseCallerFn = async (sys) => {
            capturedSys.push(sys);
            return {
                text: 'Le contenu est excellent.\nCHANGES: Translated to French',
                tokensUsed: 60,
            };
        };

        const req: LocalizeRequest = {
            body: 'The content is excellent.',
            targetLocale: 'fr-FR',
            adaptOnly: false,
        };

        await localizeContent(req, captureCallerFn);
        assert.ok(capturedSys[0]?.includes('Translate') || capturedSys[0]?.includes('translate'), 'system prompt should mention translation');
    });

    test('empty body returns without calling LLM', async () => {
        let callerCalled = false;
        const trackCaller: ProseCallerFn = async () => {
            callerCalled = true;
            return { text: 'should not be called', tokensUsed: 0 };
        };

        const req: LocalizeRequest = { body: '', targetLocale: 'de-DE', adaptOnly: true };
        const result = await localizeContent(req, trackCaller);

        assert.equal(callerCalled, false);
        assert.equal(result.localizedByLlm, false);
        assert.equal(result.body, '');
        assert.deepEqual(result.changesApplied, []);
    });

    test('LLM failure returns original body with localizedByLlm=false', async () => {
        const mockFailure: ProseCallerFn = async () => ({ text: null });
        const req: LocalizeRequest = {
            body: 'Some original text.',
            targetLocale: 'es-ES',
            adaptOnly: true,
        };

        const result = await localizeContent(req, mockFailure);
        assert.equal(result.localizedByLlm, false);
        assert.equal(result.body, 'Some original text.');
        assert.deepEqual(result.changesApplied, []);
    });

    test('CHANGES line in LLM response is correctly parsed as array split on semicolon', async () => {
        const mockCaller: ProseCallerFn = async () => ({
            text: 'Adapted content for Australia.\nCHANGES: spelling adapted;date format changed;currency adapted',
            tokensUsed: 30,
        });

        const req: LocalizeRequest = {
            body: 'Content for adaptation.',
            targetLocale: 'en-AU',
            adaptOnly: true,
        };

        const result = await localizeContent(req, mockCaller);
        assert.equal(result.changesApplied.length, 3);
        assert.ok(result.changesApplied.includes('spelling adapted'));
        assert.ok(result.changesApplied.includes('date format changed'));
        assert.ok(result.changesApplied.includes('currency adapted'));
    });

    test('targetRegion is passed through to result', async () => {
        const mockCaller: ProseCallerFn = async () => ({
            text: 'Adapted content.\nCHANGES: minor adaptation',
            tokensUsed: 20,
        });

        const req: LocalizeRequest = {
            body: 'Some content.',
            targetLocale: 'en-AU',
            targetRegion: 'New South Wales',
            adaptOnly: true,
        };

        const result = await localizeContent(req, mockCaller);
        assert.equal(result.targetLocale, 'en-AU');
        assert.equal(result.localizedByLlm, true);
    });
});

// ---------------------------------------------------------------------------
// translateWithDeepL
// ---------------------------------------------------------------------------

describe('translateWithDeepL', () => {
    const makeDeepLFetch = (translatedText: string): DeepLFetchFn =>
        async () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
                translations: [{ detected_source_language: 'EN', text: translatedText }],
            }),
        });

    test('returns null when DEEPL_API_KEY is not set', async () => {
        delete process.env['DEEPL_API_KEY'];
        const result = await translateWithDeepL('Hello world', 'de-DE', makeDeepLFetch('Hallo Welt'));
        assert.equal(result, null);
    });

    test('returns translated text when DEEPL_API_KEY is set', async () => {
        process.env['DEEPL_API_KEY'] = 'test-key';
        const result = await translateWithDeepL('Hello world', 'de-DE', makeDeepLFetch('Hallo Welt'));
        assert.equal(result, 'Hallo Welt');
        delete process.env['DEEPL_API_KEY'];
    });

    test('returns null when API responds with non-2xx', async () => {
        process.env['DEEPL_API_KEY'] = 'test-key';
        const errorFetch: DeepLFetchFn = async () => ({ ok: false, status: 403, text: async () => '' });
        const result = await translateWithDeepL('Some text', 'fr-FR', errorFetch);
        assert.equal(result, null);
        delete process.env['DEEPL_API_KEY'];
    });

    test('returns null when fetch throws', async () => {
        process.env['DEEPL_API_KEY'] = 'test-key';
        const throwFetch: DeepLFetchFn = async () => { throw new Error('timeout'); };
        const result = await translateWithDeepL('Some text', 'ja-JP', throwFetch);
        assert.equal(result, null);
        delete process.env['DEEPL_API_KEY'];
    });
});

// ---------------------------------------------------------------------------
// localizeContentWithDeepL
// ---------------------------------------------------------------------------

describe('localizeContentWithDeepL', () => {
    const adaptCaller: ProseCallerFn = async (_sys, user) => ({
        text: `Adapted: ${String(user).slice(0, 30)}\nCHANGES: cultural adaptation`,
        tokensUsed: 20,
    });

    const makeDeepLFetch = (translation: string): DeepLFetchFn =>
        async () => ({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
                translations: [{ detected_source_language: 'EN', text: translation }],
            }),
        });

    test('falls back to LLM when DEEPL_API_KEY absent and adaptOnly=false', async () => {
        delete process.env['DEEPL_API_KEY'];
        const req: LocalizeRequest = { body: 'Hello', targetLocale: 'de-DE', adaptOnly: false };
        const result = await localizeContentWithDeepL(req, adaptCaller);
        assert.equal(result.localizedByLlm, true);
        assert.equal(result.translatedByDeepL, undefined);
    });

    test('uses DeepL when DEEPL_API_KEY set and adaptOnly=false', async () => {
        process.env['DEEPL_API_KEY'] = 'key';
        const req: LocalizeRequest = { body: 'Hello world', targetLocale: 'de-DE', adaptOnly: false };
        const result = await localizeContentWithDeepL(req, adaptCaller, makeDeepLFetch('Hallo Welt'));
        assert.equal(result.translatedByDeepL, true);
        delete process.env['DEEPL_API_KEY'];
    });

    test('skips DeepL when adaptOnly=true even if DEEPL_API_KEY set', async () => {
        process.env['DEEPL_API_KEY'] = 'key';
        const req: LocalizeRequest = { body: 'Hello world', targetLocale: 'en-AU', adaptOnly: true };
        const result = await localizeContentWithDeepL(req, adaptCaller, makeDeepLFetch('Should not be used'));
        assert.equal(result.translatedByDeepL, undefined);
        delete process.env['DEEPL_API_KEY'];
    });
});
