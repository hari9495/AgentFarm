import test from 'node:test';
import assert from 'node:assert/strict';
import { personaliseEmail } from './email-personaliser.js';

const mockProspect = {
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@acme.com',
    company: 'Acme Corp',
    title: 'VP of Engineering',
    industry: 'SaaS',
};

const baseParams = {
    prospect: mockProspect,
    productDescription: 'AgentFarm is an AI-powered developer automation platform.',
    icp: 'VP-level engineering leaders at B2B SaaS companies with 50-500 employees.',
    emailTone: 'professional and concise',
    sequenceStep: 1,
};

const makeOkFetch = (subject: string, body: string) =>
    (async () => ({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({ subject, body, reasoning: 'This is a test reasoning.' }),
                },
            ],
        }),
    })) as unknown as typeof fetch;

const savedFetch = globalThis.fetch;

test('personaliseEmail — step 1 returns valid PersonalisedEmail shape', async () => {
    globalThis.fetch = makeOkFetch('Automate your dev workflows', '<p>Hello Jane, ...</p>');
    try {
        const result = await personaliseEmail(baseParams);
        assert.equal(typeof result.subject, 'string');
        assert.ok(result.subject.length > 0, 'subject should be non-empty');
        assert.equal(typeof result.body, 'string');
        assert.ok(result.body.length > 0, 'body should be non-empty');
        assert.equal(typeof result.reasoning, 'string');
    } finally {
        globalThis.fetch = savedFetch;
    }
});

test('personaliseEmail — step 2+ includes follow-up context in prompt', async () => {
    let capturedBody = '';
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
        capturedBody = init?.body as string ?? '';
        return {
            ok: true,
            status: 200,
            text: async () => '',
            json: async () => ({
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            subject: 'Following up',
                            body: '<p>Just checking in...</p>',
                            reasoning: 'Follow-up',
                        }),
                    },
                ],
            }),
        };
    }) as unknown as typeof fetch;

    try {
        await personaliseEmail({ ...baseParams, sequenceStep: 2, previousSubject: 'Automate your dev workflows' });
        const parsed = JSON.parse(capturedBody) as { messages: Array<{ content: string }> };
        assert.ok(
            parsed.messages[0].content.includes('follow-up'),
            'prompt should mention follow-up context',
        );
    } finally {
        globalThis.fetch = savedFetch;
    }
});

test('personaliseEmail — throws on non-ok LLM response', async () => {
    globalThis.fetch = (async () => ({
        ok: false,
        status: 429,
        text: async () => 'rate limit exceeded',
        json: async () => ({}),
    })) as unknown as typeof fetch;

    try {
        await assert.rejects(
            () => personaliseEmail(baseParams),
            /Anthropic API error 429/,
        );
    } finally {
        globalThis.fetch = savedFetch;
    }
});

test('personaliseEmail — throws on malformed JSON in LLM content', async () => {
    globalThis.fetch = (async () => ({
        ok: true,
        status: 200,
        text: async () => '',
        json: async () => ({
            content: [{ type: 'text', text: 'not valid json at all }{' }],
        }),
    })) as unknown as typeof fetch;

    try {
        await assert.rejects(() => personaliseEmail(baseParams));
    } finally {
        globalThis.fetch = savedFetch;
    }
});
