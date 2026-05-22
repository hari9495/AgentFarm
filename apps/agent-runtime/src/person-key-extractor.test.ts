import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractPersonKeyFromPayload } from './person-key-extractor.js';

describe('extractPersonKeyFromPayload', () => {
    it('returns null for empty or non-person payload', () => {
        assert.equal(extractPersonKeyFromPayload({}), null);
        assert.equal(extractPersonKeyFromPayload({ task: 'refactor', branch: 'main' }), null);
    });

    it('extracts and lowercases an email recipient', () => {
        const result = extractPersonKeyFromPayload({ recipient_email: 'Jane.Doe@ACME.com' });
        assert.equal(result?.personKey, 'jane.doe@acme.com');
        assert.equal(result?.sourceField, 'recipient_email');
        assert.equal(result?.personLabel, 'Jane.Doe@ACME.com');
    });

    it('prefers explicit recipient_email over generic to', () => {
        const result = extractPersonKeyFromPayload({
            to: 'fallback@x.com',
            recipient_email: 'primary@x.com',
        });
        assert.equal(result?.sourceField, 'recipient_email');
        assert.equal(result?.personKey, 'primary@x.com');
    });

    it('extracts a Slack user id', () => {
        const result = extractPersonKeyFromPayload({ slack_user_id: 'U07ABCDEF' });
        assert.equal(result?.personKey, 'u07abcdef');
        assert.equal(result?.sourceField, 'slack_user_id');
    });

    it('extracts a candidate id', () => {
        const result = extractPersonKeyFromPayload({ candidate_id: 'CAND-42' });
        assert.equal(result?.personKey, 'cand-42');
        assert.equal(result?.sourceField, 'candidate_id');
    });

    it('normalizes a phone number to digits with leading +', () => {
        const result = extractPersonKeyFromPayload({ phone_number: '+1 (415) 555-0100' });
        assert.equal(result?.personKey, '+14155550100');
    });

    it('builds a labelled person string when name is provided', () => {
        const result = extractPersonKeyFromPayload({
            recipient_email: 'jane@acme.com',
            recipient_name: 'Jane Doe',
        });
        assert.equal(result?.personLabel, 'Jane Doe <jane@acme.com>');
    });

    it('ignores empty / whitespace-only fields', () => {
        assert.equal(extractPersonKeyFromPayload({ recipient_email: '   ' }), null);
    });

    it('returns null for non-object payloads', () => {
        // @ts-expect-error - testing runtime guard
        assert.equal(extractPersonKeyFromPayload(null), null);
    });
});
