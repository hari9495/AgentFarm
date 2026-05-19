import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildGdprEmailFooter, appendGdprFooter, resolveOptOutUrl } from './gdpr-email-footer.js';

const OPT_OUT = 'https://agentfarm.dev/optout';

describe('buildGdprEmailFooter', () => {
    test('includes opt-out URL', () => {
        const footer = buildGdprEmailFooter({ optOutUrl: OPT_OUT });
        assert.ok(footer.includes(OPT_OUT), 'footer should contain opt-out URL');
    });

    test('includes AI disclosure phrase', () => {
        const footer = buildGdprEmailFooter({ optOutUrl: OPT_OUT });
        assert.ok(footer.includes('AI agent'), 'footer should disclose AI agent');
    });

    test('includes agent display name when provided', () => {
        const footer = buildGdprEmailFooter({ optOutUrl: OPT_OUT, agentDisplayName: 'Alex' });
        assert.ok(footer.includes('Alex'), 'footer should include agent name');
    });

    test('omits agent name clause when not provided', () => {
        const footer = buildGdprEmailFooter({ optOutUrl: OPT_OUT });
        assert.ok(!footer.includes('undefined'), 'footer must not contain undefined');
    });
});

describe('appendGdprFooter', () => {
    test('result starts with original body', () => {
        const result = appendGdprFooter('Hello world', { optOutUrl: OPT_OUT });
        assert.ok(result.startsWith('Hello world'));
    });

    test('result contains AI disclosure', () => {
        const result = appendGdprFooter('Hello world', { optOutUrl: OPT_OUT });
        assert.ok(result.includes('AI agent'));
    });

    test('opt-out URL appears after body content', () => {
        const result = appendGdprFooter('Body text', { optOutUrl: OPT_OUT });
        assert.ok(result.indexOf(OPT_OUT) > result.indexOf('Body text'));
    });
});

describe('resolveOptOutUrl', () => {
    test('returns URL containing tenantId when provided', () => {
        const url = resolveOptOutUrl('tenant_acme_001');
        assert.ok(url.includes('tenant'), 'URL should include tenant param');
    });

    test('returns URL without query param when tenantId omitted', () => {
        const url = resolveOptOutUrl();
        assert.ok(typeof url === 'string' && url.startsWith('http'));
    });
});
