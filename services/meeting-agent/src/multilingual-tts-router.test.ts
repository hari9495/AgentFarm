import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { routeTtsProvider, buildTtsOverride } from './multilingual-tts-router.js';

describe('routeTtsProvider — English', () => {
    it('returns kokoro for bare "en"', () => {
        const r = routeTtsProvider('en');
        assert.equal(r.provider, 'kokoro');
    });

    it('returns kokoro for en-US', () => {
        assert.equal(routeTtsProvider('en-US').provider, 'kokoro');
    });

    it('returns kokoro for en-GB', () => {
        assert.equal(routeTtsProvider('en-GB').provider, 'kokoro');
    });

    it('returns kokoro when no language given', () => {
        assert.equal(routeTtsProvider(undefined).provider, 'kokoro');
    });
});

describe('routeTtsProvider — Indian languages (sarvam_ai)', () => {
    const indian = ['hi', 'ta', 'te', 'kn', 'ml', 'mr', 'bn', 'gu', 'pa'];

    for (const lang of indian) {
        it(`returns sarvam_ai for "${lang}"`, () => {
            assert.equal(routeTtsProvider(lang).provider, 'sarvam_ai');
        });
    }

    it('returns sarvam_ai for hi-IN (BCP-47)', () => {
        assert.equal(routeTtsProvider('hi-IN').provider, 'sarvam_ai');
    });

    it('returns sarvam_ai for ta-IN (BCP-47)', () => {
        assert.equal(routeTtsProvider('ta-IN').provider, 'sarvam_ai');
    });

    // hi is in both XTTS and Indian — Indian must win
    it('Indian priority: hi → sarvam_ai, not xtts', () => {
        assert.equal(routeTtsProvider('hi').provider, 'sarvam_ai');
    });
});

describe('routeTtsProvider — XTTS languages', () => {
    const xtts = ['es', 'fr', 'de', 'it', 'pt', 'pl', 'tr', 'ru', 'nl', 'cs', 'ar', 'zh', 'ja', 'hu', 'ko'];

    for (const lang of xtts) {
        it(`returns xtts for "${lang}"`, () => {
            assert.equal(routeTtsProvider(lang).provider, 'xtts');
        });
    }

    it('returns xtts for es-ES (BCP-47)', () => {
        assert.equal(routeTtsProvider('es-ES').provider, 'xtts');
    });

    it('returns xtts for zh-Hant-TW (BCP-47, complex tag)', () => {
        assert.equal(routeTtsProvider('zh-Hant-TW').provider, 'xtts');
    });
});

describe('routeTtsProvider — MMS fallback (1100+ languages)', () => {
    it('returns mms_tts for an unknown language code', () => {
        assert.equal(routeTtsProvider('yo').provider, 'mms_tts'); // Yoruba
    });

    it('returns mms_tts for sw (Swahili)', () => {
        assert.equal(routeTtsProvider('sw').provider, 'mms_tts');
    });

    it('returns mms_tts for am (Amharic)', () => {
        assert.equal(routeTtsProvider('am').provider, 'mms_tts');
    });
});

describe('routeTtsProvider — reason field', () => {
    it('includes provider name in the reason string', () => {
        const r = routeTtsProvider('en');
        assert.ok(r.reason.length > 0, 'reason should not be empty');
    });
});

describe('buildTtsOverride', () => {
    it('returns correct provider and languageCode for English', () => {
        const override = buildTtsOverride('en-US');
        assert.equal(override.ttsProvider, 'kokoro');
        assert.equal(override.languageCode, 'en-US');
    });

    it('returns correct provider for Indian language', () => {
        const override = buildTtsOverride('ta-IN');
        assert.equal(override.ttsProvider, 'sarvam_ai');
        assert.equal(override.languageCode, 'ta-IN');
    });

    it('returns correct provider for XTTS language', () => {
        const override = buildTtsOverride('fr');
        assert.equal(override.ttsProvider, 'xtts');
    });

    it('passes undefined languageCode through', () => {
        const override = buildTtsOverride(undefined);
        assert.equal(override.ttsProvider, 'kokoro');
        assert.equal(override.languageCode, undefined);
    });
});
