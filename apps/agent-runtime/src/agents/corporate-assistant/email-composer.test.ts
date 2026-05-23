import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    composeDraftEmail,
    sendComposedEmail,
    classifyEmailIntent,
} from './email-composer.js';
import type { IEmailProvider, SendEmailParams as ProviderSendParams, EmailProviderConfig } from '../sales-agent/email-provider.js';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const TEST_PERSONA = {
    displayName: 'Test Assistant',
    emailAddress: 'assistant-abc12345@agentfarm.io',
    disclosureStatement:
        'Note: This message was sent by an AI Corporate Assistant operated by AgentFarm.',
};

// ---------------------------------------------------------------------------
// composeDraftEmail
// ---------------------------------------------------------------------------

describe('composeDraftEmail', () => {
    it('builds subject and body from task fields and appends disclosure', () => {
        const draft = composeDraftEmail({
            task: {
                subject: 'Q3 Planning Update',
                body: 'Please review the attached agenda.',
            },
            persona: TEST_PERSONA,
        });

        assert.equal(draft.subject, 'Q3 Planning Update');
        assert.ok(
            draft.body.includes('Please review the attached agenda.'),
            'body should contain task body',
        );
        assert.ok(
            draft.body.includes(TEST_PERSONA.disclosureStatement),
            'body should include disclosure statement',
        );
    });

    it('falls back to task.title when subject is absent', () => {
        const draft = composeDraftEmail({
            task: { title: 'Weekly Sync Notes' },
            persona: TEST_PERSONA,
        });

        assert.equal(draft.subject, 'Weekly Sync Notes');
    });

    it('uses (No subject) when no title, subject, or objective is provided', () => {
        const draft = composeDraftEmail({
            task: {},
            persona: { ...TEST_PERSONA, disclosureStatement: '' },
        });

        assert.equal(draft.subject, '(No subject)');
    });
});

// ---------------------------------------------------------------------------
// sendComposedEmail
// ---------------------------------------------------------------------------

function makeProviderMock(opts: { throws?: boolean }): IEmailProvider {
    return {
        providerName: 'smtp',
        sendEmail: async (_params: ProviderSendParams, _config: EmailProviderConfig) => {
            if (opts.throws) throw new Error('SMTP connection refused');
            return { success: true, provider: 'smtp' as const };
        },
    };
}

describe('sendComposedEmail', () => {
    it('returns {sent:true} when provider.sendEmail resolves', async () => {
        const result = await sendComposedEmail({
            to: 'alice@example.com',
            subject: 'Meeting notes',
            body: 'Here are the meeting notes.',
            persona: TEST_PERSONA,
            providerName: 'smtp',
            providerOverride: makeProviderMock({ throws: false }),
        });

        assert.equal(result.sent, true);
        assert.equal(result.error, undefined);
    });

    it('returns {sent:false, error} when provider.sendEmail rejects', async () => {
        const result = await sendComposedEmail({
            to: 'alice@example.com',
            subject: 'Meeting notes',
            body: 'Here are the meeting notes.',
            persona: TEST_PERSONA,
            providerName: 'smtp',
            providerOverride: makeProviderMock({ throws: true }),
        });

        assert.equal(result.sent, false);
        assert.ok(result.error?.includes('SMTP connection refused'));
    });
});

// ---------------------------------------------------------------------------
// classifyEmailIntent
// ---------------------------------------------------------------------------

describe('classifyEmailIntent', () => {
    it('classifies "Re: ..." as reply', () => {
        assert.equal(classifyEmailIntent('Re: Weekly standup', ''), 'reply');
    });

    it('classifies "Fwd: ..." as forward', () => {
        assert.equal(classifyEmailIntent('Fwd: Policy update', ''), 'forward');
    });

    it('classifies a fresh subject as new_thread', () => {
        assert.equal(classifyEmailIntent('Project kickoff', 'Hello team'), 'new_thread');
    });
});
