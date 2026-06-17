import test from 'node:test';
import assert from 'node:assert/strict';

test('headroom-compress: disabled by default — messages pass through unchanged', async () => {
    delete process.env['HEADROOM_ENABLED'];
    const mod = await import('./headroom-compress.js');

    const messages = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello world' },
    ];

    const result = await mod.compressOpenAiMessages(messages, 'gpt-4o');
    assert.deepStrictEqual(result.messages, messages);
    assert.strictEqual(result.stats, null);
});

test('headroom-compress: isHeadroomEnabled returns false when unset', async () => {
    delete process.env['HEADROOM_ENABLED'];
    const mod = await import('./headroom-compress.js');
    assert.strictEqual(mod.isHeadroomEnabled(), false);
});

test('headroom-compress: Anthropic passthrough when disabled', async () => {
    delete process.env['HEADROOM_ENABLED'];
    const mod = await import('./headroom-compress.js');

    const systemBlocks = [{ type: 'text', text: 'System prompt', cache_control: { type: 'ephemeral' } }];
    const messages = [{ role: 'user', content: 'Task prompt' }];

    const result = await mod.compressAnthropicPayload(systemBlocks, messages, 'claude-sonnet-4-5-20250929');
    assert.deepStrictEqual(result.systemBlocks, systemBlocks);
    assert.deepStrictEqual(result.messages, messages);
    assert.strictEqual(result.stats, null);
});

test('headroom-compress: Gemini passthrough when disabled', async () => {
    delete process.env['HEADROOM_ENABLED'];
    const mod = await import('./headroom-compress.js');

    const text = 'System prompt\n\nTask prompt with lots of context';
    const result = await mod.compressGeminiContent(text, 'gemini-2.0-flash');
    assert.strictEqual(result.text, text);
    assert.strictEqual(result.stats, null);
});
