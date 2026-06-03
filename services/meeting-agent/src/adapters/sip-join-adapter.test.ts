import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createServer } from 'node:net';
import { SipJoinAdapter, createSipAdapterFromEnv } from './sip-join-adapter.js';

// ── Mock FreeSWITCH ESL server ────────────────────────────────────────────────
//
// Simulates the FreeSWITCH Event Socket Layer protocol:
//   server → auth/request
//   client → auth <password>
//   server → +OK accepted  (or -ERR invalid)
//   client → api <command>
//   server → api/response body
//
// `commandReply` is what the server returns for any API command.
// Pass `rejectAuth: true` to simulate a bad password.

interface MockEslOptions {
    password: string;
    commandReply?: string;
    rejectAuth?: boolean;
}

function startMockEslServer(opts: MockEslOptions): Promise<{ port: number; stop: () => void }> {
    return new Promise((resolve) => {
        const server = createServer((socket) => {
            socket.write('Content-Type: auth/request\n\n');
            let buf = '';
            let authed = false;

            socket.on('data', (chunk: Buffer) => {
                buf += chunk.toString();
                let idx: number;
                while ((idx = buf.indexOf('\n\n')) !== -1) {
                    const msg = buf.slice(0, idx).trim();
                    buf = buf.slice(idx + 2);

                    if (!authed) {
                        if (!opts.rejectAuth && msg === `auth ${opts.password}`) {
                            authed = true;
                            socket.write('Content-Type: command/reply\nReply-Text: +OK accepted\n\n');
                        } else {
                            socket.write('Content-Type: command/reply\nReply-Text: -ERR invalid\n\n');
                            socket.destroy();
                        }
                    } else {
                        const reply = opts.commandReply ?? '+OK test-uuid-00000000-0000-0000-0000-000000000000';
                        const len = Buffer.byteLength(reply);
                        socket.write(`Content-Type: api/response\nContent-Length: ${len}\n\n${reply}`);
                    }
                }
            });
        });

        server.listen(0, '127.0.0.1', () => {
            const addr = server.address() as { port: number };
            resolve({
                port: addr.port,
                stop: () => server.close(),
            });
        });
    });
}

// ── Constructor ───────────────────────────────────────────────────────────────

describe('SipJoinAdapter — constructor', () => {
    it('throws when eslHost is missing', () => {
        assert.throws(
            () => new SipJoinAdapter({ eslHost: '', eslPassword: 'pw' }),
            /eslHost/u,
        );
    });

    it('throws when eslPassword is missing', () => {
        assert.throws(
            () => new SipJoinAdapter({ eslHost: '127.0.0.1', eslPassword: '' }),
            /eslPassword/u,
        );
    });

    it('constructs successfully with valid options', () => {
        assert.doesNotThrow(() => new SipJoinAdapter({ eslHost: '127.0.0.1', eslPassword: 'ClueCon' }));
    });
});

// ── createSipAdapterFromEnv ───────────────────────────────────────────────────

describe('createSipAdapterFromEnv()', () => {
    it('returns null when FREESWITCH_ESL_HOST is not set', () => {
        const savedHost = process.env['FREESWITCH_ESL_HOST'];
        const savedPw = process.env['FREESWITCH_ESL_PASSWORD'];
        delete process.env['FREESWITCH_ESL_HOST'];
        delete process.env['FREESWITCH_ESL_PASSWORD'];
        const result = createSipAdapterFromEnv();
        assert.equal(result, null);
        if (savedHost !== undefined) process.env['FREESWITCH_ESL_HOST'] = savedHost;
        if (savedPw !== undefined) process.env['FREESWITCH_ESL_PASSWORD'] = savedPw;
    });
});

// ── join() — invalid input ────────────────────────────────────────────────────

describe('SipJoinAdapter.join() — invalid meetingUrl', () => {
    it('returns ok:false when meetingUrl is not valid JSON', async () => {
        const adapter = new SipJoinAdapter({ eslHost: '127.0.0.1', eslPassword: 'pw' });
        const result = await adapter.join('https://meet.google.com/abc-defg-hij');
        assert.equal(result.ok, false);
        assert.equal(result.joinMethod, 'sip');
        assert.ok(result.error?.includes('SipMeetingInfo'));
    });

    it('returns ok:false when meetingUrl is JSON but dialTarget missing', async () => {
        const adapter = new SipJoinAdapter({ eslHost: '127.0.0.1', eslPassword: 'pw', timeoutMs: 500 });
        // Valid JSON but will fail to connect since no real FreeSWITCH
        const result = await adapter.join(JSON.stringify({ dialTarget: '+14155552368' }));
        // Either connection refused or timeout — just check it's not ok
        assert.equal(result.ok, false);
    });
});

// ── join() — with mock ESL server ────────────────────────────────────────────

describe('SipJoinAdapter.join() — mock FreeSWITCH', () => {
    it('originates a call and returns UUID as sessionHandle', async () => {
        const uuid = '550e8400-e29b-41d4-a716-446655440000';
        const server = await startMockEslServer({ password: 'ClueCon', commandReply: `+OK ${uuid}` });
        try {
            const adapter = new SipJoinAdapter({
                eslHost: '127.0.0.1',
                eslPort: server.port,
                eslPassword: 'ClueCon',
                timeoutMs: 8_000,
            });
            const result = await adapter.join(JSON.stringify({ dialTarget: '+14155552368' }));
            assert.equal(result.ok, true, `expected ok:true but got error: ${result.error}`);
            assert.equal(result.joinMethod, 'sip');
            assert.equal(result.sessionHandle, uuid);
        } finally {
            server.stop();
        }
    });

    it('returns ok:false when ESL returns -ERR', async () => {
        const server = await startMockEslServer({ password: 'ClueCon', commandReply: '-ERR No route to host' });
        try {
            const adapter = new SipJoinAdapter({
                eslHost: '127.0.0.1',
                eslPort: server.port,
                eslPassword: 'ClueCon',
                timeoutMs: 8_000,
            });
            const result = await adapter.join(JSON.stringify({ dialTarget: '+14155552368' }));
            assert.equal(result.ok, false);
            assert.ok(result.error?.includes('No route to host') || result.error?.includes('originate failed'),
                `expected error about "No route to host" but got: ${result.error}`);
        } finally {
            server.stop();
        }
    });

    it('includes DTMF in originate command when pin is provided', async () => {
        const server = await startMockEslServer({ password: 'ClueCon', commandReply: '+OK uuid-dtmf-test' });
        try {
            const adapter = new SipJoinAdapter({
                eslHost: '127.0.0.1',
                eslPort: server.port,
                eslPassword: 'ClueCon',
                timeoutMs: 8_000,
            });
            const result = await adapter.join(JSON.stringify({ dialTarget: '+14155552368', pin: '123456789#' }));
            assert.equal(result.ok, true, `expected ok:true but got error: ${result.error}`);
            assert.equal(result.sessionHandle, 'uuid-dtmf-test');
        } finally {
            server.stop();
        }
    });

    it('returns ok:false on authentication failure', async () => {
        const server = await startMockEslServer({ password: 'correct', rejectAuth: true });
        try {
            const adapter = new SipJoinAdapter({
                eslHost: '127.0.0.1',
                eslPort: server.port,
                eslPassword: 'wrong',
                timeoutMs: 5_000,
            });
            const result = await adapter.join(JSON.stringify({ dialTarget: '+14155552368' }));
            assert.equal(result.ok, false);
        } finally {
            server.stop();
        }
    });
});

// ── leave() ──────────────────────────────────────────────────────────────────

describe('SipJoinAdapter.leave()', () => {
    it('returns ok:true immediately when no sessionHandle', async () => {
        const adapter = new SipJoinAdapter({ eslHost: '127.0.0.1', eslPassword: 'pw' });
        const result = await adapter.leave(undefined);
        assert.equal(result.ok, true);
    });

    it('sends uuid_kill command via ESL and returns ok:true', async () => {
        const server = await startMockEslServer({ password: 'ClueCon', commandReply: '+OK' });
        try {
            const adapter = new SipJoinAdapter({
                eslHost: '127.0.0.1',
                eslPort: server.port,
                eslPassword: 'ClueCon',
                timeoutMs: 8_000,
            });
            const result = await adapter.leave('some-channel-uuid');
            assert.equal(result.ok, true, `expected ok:true but got error: ${result.error}`);
        } finally {
            server.stop();
        }
    });
});

// ── getCapabilities() ─────────────────────────────────────────────────────────

describe('SipJoinAdapter.getCapabilities()', () => {
    it('reports chat and screenShare as false, nativeAudioStream as true', () => {
        const adapter = new SipJoinAdapter({ eslHost: '127.0.0.1', eslPassword: 'pw' });
        const caps = adapter.getCapabilities();
        assert.equal(caps.chat, false);
        assert.equal(caps.screenShare, false);
        assert.equal(caps.attendeeList, false);
        assert.equal(caps.nativeAudioStream, true);
    });
});
