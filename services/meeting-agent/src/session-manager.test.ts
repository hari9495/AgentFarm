import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SessionManager } from './session-manager.js';

const BASE_INPUT = {
    tenantId: 't1',
    workspaceId: 'ws1',
    botId: 'bot-dev-1',
    platform: 'teams' as const,
    mode: 'standup' as const,
    meetingId: 'meet-123',
};

describe('SessionManager.create', () => {
    it('returns a session in scheduled state with disclosure not announced', () => {
        const mgr = new SessionManager();
        const record = mgr.create(BASE_INPUT);
        assert.equal(record.status, 'scheduled');
        assert.equal(record.disclosureAnnounced, false);
        assert.equal(record.tenantId, 't1');
        assert.equal(record.platform, 'teams');
        assert.equal(typeof record.id, 'string');
        assert.equal(typeof record.createdAt, 'string');
        assert.equal(mgr.size(), 1);
    });

    it('isolates sessions by id', () => {
        const mgr = new SessionManager();
        const a = mgr.create(BASE_INPUT);
        const b = mgr.create({ ...BASE_INPUT, meetingId: 'meet-2' });
        assert.notEqual(a.id, b.id);
        assert.equal(mgr.size(), 2);
    });
});

describe('SessionManager.appendTranscript', () => {
    it('appends entries and returns defensive copies', () => {
        const mgr = new SessionManager();
        const record = mgr.create(BASE_INPUT);
        mgr.appendTranscript(record.id, { source: 'participant', text: 'hello' });
        mgr.appendTranscript(record.id, { source: 'agent', text: 'response' });

        const copy = mgr.getTranscript(record.id);
        assert.equal(copy.length, 2);
        assert.equal(copy[0]!.source, 'participant');
        assert.equal(copy[1]!.text, 'response');

        // Mutating the copy must not mutate the manager's store.
        copy[0]!.text = 'changed';
        const fresh = mgr.getTranscript(record.id);
        assert.equal(fresh[0]!.text, 'hello');
    });

    it('throws on unknown session id', () => {
        const mgr = new SessionManager();
        assert.throws(
            () => mgr.appendTranscript('does-not-exist', { source: 'agent', text: 'x' }),
            /unknown session/u,
        );
    });
});

describe('SessionManager.delete', () => {
    it('removes the session and returns true when present', () => {
        const mgr = new SessionManager();
        const record = mgr.create(BASE_INPUT);
        assert.equal(mgr.delete(record.id), true);
        assert.equal(mgr.size(), 0);
        assert.equal(mgr.delete(record.id), false);
    });
});
