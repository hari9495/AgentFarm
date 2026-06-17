import test from 'node:test';
import assert from 'node:assert/strict';
import { microcompact, isMicrocompactEnabled } from './microcompact.js';

type Msg = { role: string; content: string | Array<{ type: string; [key: string]: unknown }>; tool_call_id?: string; name?: string };

test('isMicrocompactEnabled returns false when env var not set', () => {
    delete process.env['AF_MICROCOMPACT_ENABLED'];
    assert.equal(isMicrocompactEnabled(), false);
});

test('microcompact returns messages unchanged when disabled', () => {
    delete process.env['AF_MICROCOMPACT_ENABLED'];
    const messages: Msg[] = [
        { role: 'user', content: 'hello' },
        { role: 'tool', content: 'a'.repeat(5000), tool_call_id: 'call_1', name: 'workspace_read_file' },
    ];
    const { messages: out, stats } = microcompact(messages);
    assert.equal(out, messages); // same reference
    assert.equal(stats.toolResultsCompacted, 0);
});

test('microcompact compacts regeneratable tool results when enabled', () => {
    process.env['AF_MICROCOMPACT_ENABLED'] = 'true';
    process.env['AF_MICROCOMPACT_MIN_SAVINGS'] = '10';

    const bigContent = 'x'.repeat(8000); // ~2000 tokens
    const messages: Msg[] = [
        {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'call_1', name: 'workspace_read_file', input: {} }],
        },
        { role: 'tool', content: bigContent, tool_call_id: 'call_1', name: 'workspace_read_file' },
    ];

    const { messages: out, stats } = microcompact(messages);

    assert.equal(stats.toolResultsCompacted, 1);
    assert.ok(stats.estimatedTokensSaved > 100);
    const toolMsg = out.find((m) => m.role === 'tool');
    assert.ok(typeof toolMsg?.content === 'string');
    assert.ok((toolMsg!.content as string).includes('Compacted'));
    assert.ok((toolMsg!.content as string).includes('workspace_read_file'));

    delete process.env['AF_MICROCOMPACT_ENABLED'];
    delete process.env['AF_MICROCOMPACT_MIN_SAVINGS'];
});

test('microcompact does not compact state-bearing tool results', () => {
    process.env['AF_MICROCOMPACT_ENABLED'] = 'true';
    process.env['AF_MICROCOMPACT_MIN_SAVINGS'] = '10';

    const stateBearingContent = 'approval granted for task xyz — ' + 'x'.repeat(4000);
    const messages: Msg[] = [
        {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'call_2', name: 'workspace_read_file', input: {} }],
        },
        { role: 'tool', content: stateBearingContent, tool_call_id: 'call_2', name: 'workspace_read_file' },
    ];

    const { messages: out, stats } = microcompact(messages);
    assert.equal(stats.toolResultsCompacted, 0);
    const toolMsg = out.find((m) => m.role === 'tool');
    assert.equal(toolMsg?.content, stateBearingContent);

    delete process.env['AF_MICROCOMPACT_ENABLED'];
    delete process.env['AF_MICROCOMPACT_MIN_SAVINGS'];
});

test('microcompact does not compact non-compactable tool types', () => {
    process.env['AF_MICROCOMPACT_ENABLED'] = 'true';
    process.env['AF_MICROCOMPACT_MIN_SAVINGS'] = '10';

    const messages: Msg[] = [
        {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'call_3', name: 'connector_execute', input: {} }],
        },
        { role: 'tool', content: 'connector result: ' + 'x'.repeat(4000), tool_call_id: 'call_3', name: 'connector_execute' },
    ];

    const { messages: out, stats } = microcompact(messages);
    assert.equal(stats.toolResultsCompacted, 0);
    const toolMsg = out.find((m) => m.role === 'tool');
    assert.ok(typeof toolMsg?.content === 'string');
    assert.ok(!(toolMsg!.content as string).includes('Compacted'));

    delete process.env['AF_MICROCOMPACT_ENABLED'];
    delete process.env['AF_MICROCOMPACT_MIN_SAVINGS'];
});

test('microcompact returns original messages when savings below MIN_SAVINGS', () => {
    process.env['AF_MICROCOMPACT_ENABLED'] = 'true';
    process.env['AF_MICROCOMPACT_MIN_SAVINGS'] = '100000'; // very high threshold

    const messages: Msg[] = [
        {
            role: 'assistant',
            content: [{ type: 'tool_use', id: 'call_4', name: 'workspace_grep', input: {} }],
        },
        { role: 'tool', content: 'tiny result', tool_call_id: 'call_4', name: 'workspace_grep' },
    ];

    const { messages: out, stats } = microcompact(messages);
    assert.equal(stats.toolResultsCompacted, 0);
    assert.equal(out[1]?.content, 'tiny result');

    delete process.env['AF_MICROCOMPACT_ENABLED'];
    delete process.env['AF_MICROCOMPACT_MIN_SAVINGS'];
});

test('microcompact skips non-tool messages', () => {
    process.env['AF_MICROCOMPACT_ENABLED'] = 'true';
    process.env['AF_MICROCOMPACT_MIN_SAVINGS'] = '10';

    const userContent = 'user message ' + 'x'.repeat(4000);
    const messages: Msg[] = [
        { role: 'user', content: userContent },
        { role: 'assistant', content: 'assistant response' },
    ];

    const { messages: out, stats } = microcompact(messages);
    assert.equal(stats.toolResultsFound, 0);
    assert.equal(out[0]?.content, userContent); // unchanged

    delete process.env['AF_MICROCOMPACT_ENABLED'];
    delete process.env['AF_MICROCOMPACT_MIN_SAVINGS'];
});

test('microcompact stats count all tool results even uncompacted ones', () => {
    process.env['AF_MICROCOMPACT_ENABLED'] = 'true';
    process.env['AF_MICROCOMPACT_MIN_SAVINGS'] = '10';

    const messages: Msg[] = [
        {
            role: 'assistant',
            content: [
                { type: 'tool_use', id: 'c1', name: 'workspace_grep', input: {} },
                { type: 'tool_use', id: 'c2', name: 'connector_execute', input: {} },
            ],
        },
        { role: 'tool', content: 'grep result ' + 'x'.repeat(3000), tool_call_id: 'c1', name: 'workspace_grep' },
        { role: 'tool', content: 'connector result ' + 'x'.repeat(3000), tool_call_id: 'c2', name: 'connector_execute' },
    ];

    const { stats } = microcompact(messages);
    assert.equal(stats.toolResultsFound, 1);    // only compactable ones counted as found
    assert.equal(stats.toolResultsCompacted, 1); // grep compacted, connector not

    delete process.env['AF_MICROCOMPACT_ENABLED'];
    delete process.env['AF_MICROCOMPACT_MIN_SAVINGS'];
});
