import test from 'node:test';
import assert from 'node:assert/strict';
import { invokeMcpSequence } from './mcp-registry-client.js';
import { MEDIUM_RISK_ACTIONS } from './domain/risk-policy.js';

// A fake McpProtocolClient that records calls and shares one "session" — proving
// the sequence runs over a single connect()/close() lifecycle.
class FakeClient {
    public connected = 0;
    public closed = 0;
    public calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    constructor(
        private readonly behavior: (name: string, args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text?: string }> }>,
    ) {}
    async connect() { this.connected += 1; return { protocolVersion: '2024-11-05', serverInfo: { name: 'fake', version: '1' } }; }
    async callTool(name: string, args: Record<string, unknown>) { this.calls.push({ name, args }); return this.behavior(name, args) as never; }
    async close() { this.closed += 1; }
}

const ok = (text: string) => async () => ({ content: [{ type: 'text', text }] });

test('runs all steps over one persistent session and assembles a transcript', async () => {
    let fake!: FakeClient;
    const result = await invokeMcpSequence(
        'http://server',
        {},
        [
            { toolName: 'navigate_page', toolArgs: { url: 'example.com' } },
            { toolName: 'evaluate_script', toolArgs: { function: '() => document.title' } },
        ],
        () => {
            fake = new FakeClient(async (name) => ({ content: [{ type: 'text', text: name === 'evaluate_script' ? 'Example Domain' : 'navigated' }] }));
            return fake as never;
        },
    );

    assert.equal(result.ok, true);
    assert.equal(result.steps.length, 2);
    assert.equal(result.steps[1]?.output, 'Example Domain');
    assert.equal(fake.connected, 1, 'connect once');
    assert.equal(fake.closed, 1, 'close once');
    assert.equal(fake.calls.length, 2, 'both steps used the SAME client (shared session)');
});

test('stops at the first failing step and reports which step failed', async () => {
    let fake!: FakeClient;
    const result = await invokeMcpSequence(
        'http://server',
        {},
        [
            { toolName: 'step_a' },
            { toolName: 'step_b' },
            { toolName: 'step_c' },
        ],
        () => {
            fake = new FakeClient(async (name) => {
                if (name === 'step_b') throw new Error('boom');
                return { content: [{ type: 'text', text: 'ok' }] };
            });
            return fake as never;
        },
    );

    assert.equal(result.ok, false);
    assert.equal(result.failedStep, 2);
    assert.equal(result.steps.length, 2, 'step_c never ran');
    assert.equal(result.steps[1]?.ok, false);
    assert.match(result.steps[1]?.error ?? '', /boom/);
    assert.equal(fake.closed, 1, 'session still closed after failure');
});

test('closes the session even when connect() fails', async () => {
    let fake!: FakeClient;
    const result = await invokeMcpSequence(
        'http://server',
        {},
        [{ toolName: 'x' }],
        () => {
            fake = new FakeClient(ok('unused'));
            fake.connect = async () => { throw new Error('server down'); };
            return fake as never;
        },
    );
    assert.equal(result.ok, false);
    assert.equal(fake.closed, 1);
    assert.match(result.steps[0]?.error ?? '', /server down/);
});

test('mcp_tool_sequence is classified MEDIUM risk (one approval for the whole sequence)', () => {
    assert.equal(MEDIUM_RISK_ACTIONS.has('mcp_tool_sequence'), true);
});
