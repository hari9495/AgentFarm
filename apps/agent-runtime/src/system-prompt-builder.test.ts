import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, getLanguageNameFromCode } from './system-prompt-builder.js';

const BASE = 'You are a helpful agent. Follow all instructions carefully.';

// 1. English returns basePrompt unchanged
test('buildSystemPrompt with language "en" returns basePrompt unchanged', () => {
    const result = buildSystemPrompt({ basePrompt: BASE, language: 'en' });
    assert.equal(result, BASE);
});

// 2. Japanese appends instruction block
test('buildSystemPrompt with language "ja" appends Japanese instruction block', () => {
    const result = buildSystemPrompt({ basePrompt: BASE, language: 'ja' });
    assert.notEqual(result, BASE);
    assert.ok(result.includes('Japanese'), 'should mention Japanese');
    assert.ok(result.includes('ja'), 'should include BCP-47 code');
    assert.ok(result.includes('LANGUAGE INSTRUCTION'), 'should include keyword');
});

// 3. Korean appends instruction block
test('buildSystemPrompt with language "ko" appends Korean instruction block', () => {
    const result = buildSystemPrompt({ basePrompt: BASE, language: 'ko' });
    assert.ok(result.includes('Korean'), 'should mention Korean');
    assert.ok(result.includes('ko'), 'should include BCP-47 code');
});

// 4. Arabic appends instruction block
test('buildSystemPrompt with language "ar" appends Arabic instruction block', () => {
    const result = buildSystemPrompt({ basePrompt: BASE, language: 'ar' });
    assert.ok(result.includes('Arabic'), 'should mention Arabic');
    assert.ok(result.includes('ar'), 'should include BCP-47 code');
});

// 5. Undefined language returns basePrompt unchanged
test('buildSystemPrompt with undefined language returns basePrompt unchanged', () => {
    const result = buildSystemPrompt({ basePrompt: BASE });
    assert.equal(result, BASE);
});

// 6. Unknown BCP-47 code uses the code itself as language name
test('buildSystemPrompt with unknown code "xx" uses "xx" as language name', () => {
    const result = buildSystemPrompt({ basePrompt: BASE, language: 'xx' });
    assert.ok(result.includes('xx'), 'should embed the unknown code as name');
    assert.ok(result.includes('LANGUAGE INSTRUCTION'), 'should still append the block');
});

// 7. getLanguageNameFromCode("ja") returns "Japanese"
test('getLanguageNameFromCode("ja") returns "Japanese"', () => {
    assert.equal(getLanguageNameFromCode('ja'), 'Japanese');
});

// 8. getLanguageNameFromCode("unknown") returns "unknown"
test('getLanguageNameFromCode("unknown") returns "unknown"', () => {
    assert.equal(getLanguageNameFromCode('unknown'), 'unknown');
});

// 9. Language instruction block always appears at END of prompt
test('language instruction block always appears at END of prompt', () => {
    const result = buildSystemPrompt({ basePrompt: BASE, language: 'ko' });
    const baseIdx = result.indexOf(BASE);
    const langIdx = result.indexOf('LANGUAGE INSTRUCTION');
    assert.ok(baseIdx !== -1, 'base prompt must be present');
    assert.ok(langIdx !== -1, 'language instruction must be present');
    assert.ok(langIdx > baseIdx, 'language instruction must appear after the base prompt');
    // The prompt must END with the language instruction, not in the middle
    const afterLang = result.slice(langIdx + 'LANGUAGE INSTRUCTION'.length).trimEnd();
    assert.ok(!afterLang.includes(BASE), 'base prompt must not repeat after language instruction');
});

// 10. Multiple calls with same options produce identical output (deterministic)
test('Multiple calls with same options produce identical output (deterministic)', () => {
    const opts = { basePrompt: BASE, language: 'hi' };
    const first = buildSystemPrompt(opts);
    const second = buildSystemPrompt(opts);
    const third = buildSystemPrompt(opts);
    assert.equal(first, second);
    assert.equal(second, third);
});
