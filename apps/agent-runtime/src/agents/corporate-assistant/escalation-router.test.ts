import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    classifyEscalationDomain,
    buildEscalationNote,
} from './escalation-router.js';

// ---------------------------------------------------------------------------
// classifyEscalationDomain
// ---------------------------------------------------------------------------

describe('classifyEscalationDomain', () => {
    it('returns "legal" for legal keywords', () => {
        assert.equal(
            classifyEscalationDomain('Please review this contract before signing.'),
            'legal',
        );
    });

    it('returns "finance" for finance keywords', () => {
        assert.equal(
            classifyEscalationDomain('The invoice for June is overdue — please process.'),
            'finance',
        );
    });

    it('returns "hr" for hr keywords', () => {
        assert.equal(
            classifyEscalationDomain('Employee raised a grievance about their performance review.'),
            'hr',
        );
    });

    it('returns "it" for IT keywords', () => {
        assert.equal(
            classifyEscalationDomain('There was a security incident — possible phishing attack.'),
            'it',
        );
    });

    it('returns "none" for a benign task description', () => {
        assert.equal(
            classifyEscalationDomain('Please schedule a meeting with the design team for Thursday.'),
            'none',
        );
    });
});

// ---------------------------------------------------------------------------
// buildEscalationNote
// ---------------------------------------------------------------------------

describe('buildEscalationNote', () => {
    const persona = {
        displayName: 'Corporate Assistant',
        emailAddress: 'assistant-abc12345@agentfarm.io',
    };

    it('includes task summary, requester, agent identity, and domain label', () => {
        const note = buildEscalationNote(
            {
                taskId: 'task-999',
                description: 'Please review the NDA before the vendor meeting.',
                requestedBy: 'alice@example.com',
            },
            'legal',
            persona,
        );

        assert.ok(note.includes('[Escalation Notice — LEGAL]'), 'should include domain label');
        assert.ok(note.includes('Task ID: task-999'), 'should include task ID');
        assert.ok(note.includes('alice@example.com'), 'should include requester');
        assert.ok(note.includes(persona.displayName), 'should include agent display name');
        assert.ok(note.includes(persona.emailAddress), 'should include agent email');
        assert.ok(note.includes('NDA'), 'should include task description excerpt');
    });
});
