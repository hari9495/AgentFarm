import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { detectPlagiarism, copyscapeCheck, detectPlagiarismWithCopyscape } from './plagiarism-detector.js';
import type { PlagiarismFetchFn } from './plagiarism-detector.js';
import type { ProseCallerFn } from './llm-prose-writer.js';

describe('detectPlagiarism', () => {
    test('clean JSON response returns clean report with no flags', async () => {
        const mockCaller: ProseCallerFn = async () => ({
            text: JSON.stringify({ clean: true, flags: [], summary: 'No plagiarism detected.' }),
            tokensUsed: 30,
        });

        const result = await detectPlagiarism('This is original content.', mockCaller);
        assert.equal(result.clean, true);
        assert.deepEqual(result.flags, []);
        assert.equal(result.reviewRecommended, false);
    });

    test('flags with high severity set reviewRecommended=true', async () => {
        const mockCaller: ProseCallerFn = async () => ({
            text: JSON.stringify({
                clean: false,
                flags: [
                    { excerpt: 'example text', suspicion: 'Matches known source', severity: 'high' },
                ],
                summary: 'Possible plagiarism found.',
            }),
            tokensUsed: 40,
        });

        const result = await detectPlagiarism('Some content here.', mockCaller);
        assert.equal(result.clean, false);
        assert.equal(result.flags.length, 1);
        assert.equal(result.reviewRecommended, true);
    });

    test('flags with medium severity set reviewRecommended=true', async () => {
        const mockCaller: ProseCallerFn = async () => ({
            text: JSON.stringify({
                clean: false,
                flags: [
                    { excerpt: 'another excerpt', suspicion: 'Possibly derived', severity: 'medium' },
                ],
                summary: 'Some concern.',
            }),
            tokensUsed: 30,
        });

        const result = await detectPlagiarism('Some content.', mockCaller);
        assert.equal(result.reviewRecommended, true);
    });

    test('flags with only low severity do NOT set reviewRecommended', async () => {
        const mockCaller: ProseCallerFn = async () => ({
            text: JSON.stringify({
                clean: false,
                flags: [
                    { excerpt: 'minor match', suspicion: 'Very similar phrasing', severity: 'low' },
                ],
                summary: 'Minor concern.',
            }),
            tokensUsed: 20,
        });

        const result = await detectPlagiarism('Some content.', mockCaller);
        assert.equal(result.reviewRecommended, false);
    });

    test('LLM failure returns safe fallback clean report', async () => {
        const mockFailure: ProseCallerFn = async () => ({ text: null });
        const result = await detectPlagiarism('Some content.', mockFailure);

        assert.equal(result.clean, true);
        assert.deepEqual(result.flags, []);
        assert.equal(result.reviewRecommended, false);
    });

    test('invalid JSON from LLM returns safe fallback clean report', async () => {
        const mockBadJson: ProseCallerFn = async () => ({
            text: 'This is not valid JSON at all',
            tokensUsed: 10,
        });

        const result = await detectPlagiarism('Some content.', mockBadJson);
        assert.equal(result.clean, true);
        assert.deepEqual(result.flags, []);
    });

    test('empty body returns immediately without calling LLM', async () => {
        let callerCalled = false;
        const trackCaller: ProseCallerFn = async () => {
            callerCalled = true;
            return { text: '{}', tokensUsed: 0 };
        };

        const result = await detectPlagiarism('', trackCaller);
        assert.equal(callerCalled, false);
        assert.equal(result.clean, true);
        assert.deepEqual(result.flags, []);
    });
});

// ---------------------------------------------------------------------------
// copyscapeCheck
// ---------------------------------------------------------------------------

describe('copyscapeCheck', () => {
    const cleanXml =
        '<?xml version="1.0" encoding="UTF-8"?><response><count>0</count></response>';
    const matchXml = `<?xml version="1.0" encoding="UTF-8"?>
<response>
  <count>1</count>
  <result>
    <url>https://example.com/article</url>
    <title>Some Article Title</title>
    <percentmatched>42</percentmatched>
    <wordsmatched>200</wordsmatched>
  </result>
</response>`;

    const makeCleanFetch = (): PlagiarismFetchFn =>
        async () => ({ ok: true, status: 200, text: async () => cleanXml });

    const makeMatchFetch = (): PlagiarismFetchFn =>
        async () => ({ ok: true, status: 200, text: async () => matchXml });

    test('returns skipped when env vars are absent', async () => {
        const orig = { u: process.env['COPYSCAPE_API_USERNAME'], k: process.env['COPYSCAPE_API_KEY'] };
        delete process.env['COPYSCAPE_API_USERNAME'];
        delete process.env['COPYSCAPE_API_KEY'];

        const result = await copyscapeCheck('Some content.', makeCleanFetch());
        assert.equal(result.skipped, true);
        assert.equal(result.duplicatesFound, false);

        process.env['COPYSCAPE_API_USERNAME'] = orig.u;
        process.env['COPYSCAPE_API_KEY'] = orig.k;
    });

    test('returns no duplicates when API responds with 0 results', async () => {
        process.env['COPYSCAPE_API_USERNAME'] = 'testuser';
        process.env['COPYSCAPE_API_KEY'] = 'testkey123';

        const result = await copyscapeCheck('Original content.', makeCleanFetch());
        assert.equal(result.skipped, false);
        assert.equal(result.duplicatesFound, false);
        assert.deepEqual(result.matches, []);

        delete process.env['COPYSCAPE_API_USERNAME'];
        delete process.env['COPYSCAPE_API_KEY'];
    });

    test('parses match XML and returns duplicatesFound=true', async () => {
        process.env['COPYSCAPE_API_USERNAME'] = 'testuser';
        process.env['COPYSCAPE_API_KEY'] = 'testkey123';

        const result = await copyscapeCheck('Copied content here.', makeMatchFetch());
        assert.equal(result.skipped, false);
        assert.equal(result.duplicatesFound, true);
        assert.equal(result.matches.length, 1);
        assert.equal(result.matches[0]!.url, 'https://example.com/article');
        assert.equal(result.matches[0]!.percentMatched, 42);
        assert.equal(result.matches[0]!.wordsMatched, 200);

        delete process.env['COPYSCAPE_API_USERNAME'];
        delete process.env['COPYSCAPE_API_KEY'];
    });

    test('returns error summary when API returns non-2xx', async () => {
        process.env['COPYSCAPE_API_USERNAME'] = 'testuser';
        process.env['COPYSCAPE_API_KEY'] = 'testkey123';

        const errorFetch: PlagiarismFetchFn = async () => ({
            ok: false,
            status: 403,
            text: async () => '<error>Invalid API key</error>',
        });
        const result = await copyscapeCheck('Content.', errorFetch);
        assert.equal(result.skipped, false);
        assert.equal(result.duplicatesFound, false);
        assert.ok(result.summary.includes('403'));

        delete process.env['COPYSCAPE_API_USERNAME'];
        delete process.env['COPYSCAPE_API_KEY'];
    });

    test('returns error summary when fetch throws', async () => {
        process.env['COPYSCAPE_API_USERNAME'] = 'testuser';
        process.env['COPYSCAPE_API_KEY'] = 'testkey123';

        const throwingFetch: PlagiarismFetchFn = async () => {
            throw new Error('Network timeout');
        };
        const result = await copyscapeCheck('Content.', throwingFetch);
        assert.equal(result.skipped, false);
        assert.ok(result.summary.includes('Network timeout'));

        delete process.env['COPYSCAPE_API_USERNAME'];
        delete process.env['COPYSCAPE_API_KEY'];
    });
});

// ---------------------------------------------------------------------------
// detectPlagiarismWithCopyscape
// ---------------------------------------------------------------------------

describe('detectPlagiarismWithCopyscape', () => {
    const cleanCaller: ProseCallerFn = async () => ({
        text: JSON.stringify({ clean: true, flags: [], summary: 'Original.' }),
        tokensUsed: 10,
    });
    const cleanXml = '<?xml version="1.0"?><response><count>0</count></response>';
    const cleanFetch: PlagiarismFetchFn = async () => ({
        ok: true, status: 200, text: async () => cleanXml,
    });

    test('includes copyscape field in result', async () => {
        delete process.env['COPYSCAPE_API_USERNAME'];
        delete process.env['COPYSCAPE_API_KEY'];

        const result = await detectPlagiarismWithCopyscape('Clean text.', cleanCaller, cleanFetch);
        assert.ok('copyscape' in result);
        assert.equal(result.copyscape.skipped, true);
    });

    test('reviewRecommended=true when copyscape finds duplicate even if LLM clean', async () => {
        process.env['COPYSCAPE_API_USERNAME'] = 'u';
        process.env['COPYSCAPE_API_KEY'] = 'k';

        const matchFetch: PlagiarismFetchFn = async () => ({
            ok: true,
            status: 200,
            text: async () =>
                '<response><result><url>https://x.com</url><title>T</title>' +
                '<percentmatched>80</percentmatched><wordsmatched>400</wordsmatched></result></response>',
        });
        const result = await detectPlagiarismWithCopyscape('Some copied text.', cleanCaller, matchFetch);
        assert.equal(result.reviewRecommended, true);
        assert.equal(result.copyscape.duplicatesFound, true);

        delete process.env['COPYSCAPE_API_USERNAME'];
        delete process.env['COPYSCAPE_API_KEY'];
    });
});
