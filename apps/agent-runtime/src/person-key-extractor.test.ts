import { describe, expect, it } from 'vitest';

import { extractPersonKeyFromPayload } from './person-key-extractor.js';

describe('extractPersonKeyFromPayload', () => {
    it('returns null for empty or non-person payload', () => {
        expect(extractPersonKeyFromPayload({})).toBeNull();
        expect(extractPersonKeyFromPayload({ task: 'refactor', branch: 'main' })).toBeNull();
    });

    it('extracts and lowercases an email recipient', () => {
        const result = extractPersonKeyFromPayload({ recipient_email: 'Jane.Doe@ACME.com' });
        expect(result?.personKey).toBe('jane.doe@acme.com');
        expect(result?.sourceField).toBe('recipient_email');
        expect(result?.personLabel).toBe('Jane.Doe@ACME.com');
    });

    it('prefers explicit recipient_email over generic to', () => {
        const result = extractPersonKeyFromPayload({
            to: 'fallback@x.com',
            recipient_email: 'primary@x.com',
        });
        expect(result?.sourceField).toBe('recipient_email');
        expect(result?.personKey).toBe('primary@x.com');
    });

    it('extracts a Slack user id', () => {
        const result = extractPersonKeyFromPayload({ slack_user_id: 'U07ABCDEF' });
        expect(result?.personKey).toBe('u07abcdef');
        expect(result?.sourceField).toBe('slack_user_id');
    });

    it('extracts a candidate id', () => {
        const result = extractPersonKeyFromPayload({ candidate_id: 'CAND-42' });
        expect(result?.personKey).toBe('cand-42');
        expect(result?.sourceField).toBe('candidate_id');
    });

    it('normalizes a phone number to digits with leading +', () => {
        const result = extractPersonKeyFromPayload({ phone_number: '+1 (415) 555-0100' });
        expect(result?.personKey).toBe('+14155550100');
    });

    it('builds a labelled person string when name is provided', () => {
        const result = extractPersonKeyFromPayload({
            recipient_email: 'jane@acme.com',
            recipient_name: 'Jane Doe',
        });
        expect(result?.personLabel).toBe('Jane Doe <jane@acme.com>');
    });

    it('ignores empty / whitespace-only fields', () => {
        expect(extractPersonKeyFromPayload({ recipient_email: '   ' })).toBeNull();
    });

    it('returns null for non-object payloads', () => {
        // @ts-expect-error - testing runtime guard
        expect(extractPersonKeyFromPayload(null)).toBeNull();
    });
});
