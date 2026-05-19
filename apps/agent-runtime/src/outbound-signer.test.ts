import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signOutbound } from './outbound-signer.js';
import type { AgentPersonaRecord } from '@agentfarm/shared-types';

const PERSONA: AgentPersonaRecord = {
    id: 'persona_01',
    botId: 'bot_01',
    tenantId: 'tenant_01',
    displayName: 'Alex',
    emailAddress: 'alex@agentfarm.ai',
    communicationStyle: 'professional',
    disclosureStatement: 'This message was sent by an AI agent.',
    language: 'en',
    timezone: 'UTC',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
};

describe('signOutbound', () => {
    it('appends disclosure when not present', () => {
        const result = signOutbound('Hello, here is your report.', PERSONA);
        assert.ok(result.includes('This message was sent by an AI agent.'));
        assert.ok(result.startsWith('Hello'));
        assert.ok(result.includes('\n\n'));
    });

    it('is idempotent when disclosure already present', () => {
        const alreadySigned = 'Hello.\n\nThis message was sent by an AI agent.';
        const result = signOutbound(alreadySigned, PERSONA);
        assert.equal(result, alreadySigned);
    });

    it('returns content unchanged when persona is null', () => {
        const result = signOutbound('Hello.', null);
        assert.equal(result, 'Hello.');
    });

    it('returns content unchanged when persona is undefined', () => {
        const result = signOutbound('Hello.', undefined);
        assert.equal(result, 'Hello.');
    });

    it('returns content unchanged when disclosureStatement is empty', () => {
        const personaNoDisclosure: AgentPersonaRecord = { ...PERSONA, disclosureStatement: '' };
        const result = signOutbound('Hello.', personaNoDisclosure);
        assert.equal(result, 'Hello.');
    });

    it('returns content unchanged when disclosureStatement is whitespace only', () => {
        const personaWhitespace: AgentPersonaRecord = { ...PERSONA, disclosureStatement: '   ' };
        const result = signOutbound('Hello.', personaWhitespace);
        assert.equal(result, 'Hello.');
    });
});
