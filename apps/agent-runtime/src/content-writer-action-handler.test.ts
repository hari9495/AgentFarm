import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    handleContentWriterAction,
    isContentWriterActionType,
    type ContentWriterActionInput,
} from './content-writer-action-handler.js';
import type { ProseCallerFn } from './content-writer/llm-prose-writer.js';
import type { CalendarClientFn } from './content-writer/content-scheduler.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockCaller: ProseCallerFn = async () => ({
    text: 'Generated prose content.',
    tokensUsed: 40,
});

const mockCalendarClient: CalendarClientFn = async () => ({ confirmationId: 'cal-123' });

function baseInput(
    actionType: ContentWriterActionInput['actionType'],
    payload: Record<string, unknown> = {},
): ContentWriterActionInput {
    return {
        actionType,
        tenantId: 'tenant-1',
        botId: 'bot-1',
        taskId: 'task-1',
        payload,
        workspaceDir: '/tmp/test-workspace',
    };
}

// ---------------------------------------------------------------------------
// isContentWriterActionType
// ---------------------------------------------------------------------------

describe('isContentWriterActionType', () => {
    test('returns true for all CW action types', () => {
        const types = [
            'workspace_cw_research_topic',
            'workspace_cw_write_prose',
            'workspace_cw_seo_optimize',
            'workspace_cw_publish_cms',
            'workspace_cw_adapt_tone',
            'workspace_cw_source_images',
            'workspace_cw_schedule_content',
            'workspace_cw_fact_check',
            'workspace_cw_revision_apply',
            'workspace_cw_brand_voice_learn',
        ];
        for (const t of types) {
            assert.equal(isContentWriterActionType(t), true, `Expected true for ${t}`);
        }
    });

    test('returns false for unrelated type', () => {
        assert.equal(isContentWriterActionType('workspace_tw_doc_diff'), false);
        assert.equal(isContentWriterActionType('unknown_action'), false);
    });
});

// ---------------------------------------------------------------------------
// workspace_cw_research_topic
// ---------------------------------------------------------------------------

describe('workspace_cw_research_topic', () => {
    test('fails when topic is missing', async () => {
        const result = await handleContentWriterAction(baseInput('workspace_cw_research_topic', {}));
        assert.equal(result.ok, false);
        assert.ok(result.output.includes('topic'));
    });

    // Note: actual research makes network calls — only test the missing-topic guard here.
});

// ---------------------------------------------------------------------------
// workspace_cw_write_prose
// ---------------------------------------------------------------------------

describe('workspace_cw_write_prose', () => {
    test('fails when callerFn is not provided', async () => {
        const result = await handleContentWriterAction(
            baseInput('workspace_cw_write_prose', { title: 'Test', format: 'blog_post' }),
        );
        assert.equal(result.ok, false);
        assert.ok(result.output.includes('LLM caller'));
    });

    test('returns prose result with callerFn', async () => {
        const input: ContentWriterActionInput = {
            ...baseInput('workspace_cw_write_prose', {
                spec: {
                    audience: 'developers',
                    tone: 'professional',
                    format: 'blog_post',
                    wordCount: 300,
                    keyMessages: ['Use types', 'Avoid any'],
                    callToAction: null,
                    deadline: null,
                },
            }),
            callerFn: mockCaller,
        };
        const result = await handleContentWriterAction(input);
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.ok('body' in parsed);
    });
});

// ---------------------------------------------------------------------------
// workspace_cw_seo_optimize
// ---------------------------------------------------------------------------

describe('workspace_cw_seo_optimize', () => {
    test('fails when draftBody is missing', async () => {
        const result = await handleContentWriterAction(baseInput('workspace_cw_seo_optimize', {}));
        assert.equal(result.ok, false);
    });

    test('returns seo spec for valid body', async () => {
        const result = await handleContentWriterAction(
            baseInput('workspace_cw_seo_optimize', {
                draftBody: 'TypeScript is great for teams. TypeScript improves productivity.',
                keyMessages: ['TypeScript'],
                audience: 'developers',
                format: 'blog_post',
            }),
        );
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.ok('metaTitle' in parsed);
        assert.ok('metaDescription' in parsed);
    });
});

// ---------------------------------------------------------------------------
// workspace_cw_adapt_tone
// ---------------------------------------------------------------------------

describe('workspace_cw_adapt_tone', () => {
    test('fails when callerFn is not provided', async () => {
        const result = await handleContentWriterAction(
            baseInput('workspace_cw_adapt_tone', { body: 'Hello.', targetTone: 'casual' }),
        );
        assert.equal(result.ok, false);
    });

    test('returns tone result with callerFn', async () => {
        const input: ContentWriterActionInput = {
            ...baseInput('workspace_cw_adapt_tone', {
                body: 'Our system facilitates leveraged synergies.',
                targetTone: 'friendly',
            }),
            callerFn: mockCaller,
        };
        const result = await handleContentWriterAction(input);
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.ok('toneApplied' in parsed);
    });
});

// ---------------------------------------------------------------------------
// workspace_cw_source_images
// ---------------------------------------------------------------------------

describe('workspace_cw_source_images', () => {
    test('returns suggestions array', async () => {
        delete process.env['UNSPLASH_ACCESS_KEY'];
        const result = await handleContentWriterAction(
            baseInput('workspace_cw_source_images', {
                body: '# TypeScript\nTypeScript improves teams.\n## Benefits\nBetter code.',
                keyMessages: [],
            }),
        );
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as unknown[];
        assert.ok(Array.isArray(parsed));
    });

    test('embed=true without AGENT_IMAGE_EMBED returns embedSkipped=true', async () => {
        delete process.env['AGENT_IMAGE_EMBED'];
        const result = await handleContentWriterAction(
            baseInput('workspace_cw_source_images', {
                body: '# Cloud Computing\nCloud is growing.\n## Benefits\nScalability.',
                keyMessages: [],
                embed: true,
            }),
        );
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.equal(parsed['embedSkipped'], true);
        assert.equal(parsed['embeddedBody'], null);
        assert.ok(typeof parsed['embedSkipReason'] === 'string');
    });

    test('embed=true with AGENT_IMAGE_EMBED=true returns embeddedBody', async () => {
        process.env['AGENT_IMAGE_EMBED'] = 'true';
        delete process.env['UNSPLASH_ACCESS_KEY']; // no API key → no photoUrls → body unchanged
        const body = '# Cloud Computing\nCloud is growing.\n## Benefits\nScalability.';
        const result = await handleContentWriterAction(
            baseInput('workspace_cw_source_images', {
                body,
                keyMessages: [],
                embed: true,
            }),
        );
        delete process.env['AGENT_IMAGE_EMBED'];
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        // embeddedBody is present (may equal body when no photoUrls resolved)
        assert.ok('embeddedBody' in parsed);
        assert.equal(parsed['embedSkipped'], undefined);
    });
});

// ---------------------------------------------------------------------------
// workspace_cw_fact_check
// ---------------------------------------------------------------------------

describe('workspace_cw_fact_check', () => {
    test('fails when body is missing', async () => {
        const result = await handleContentWriterAction(baseInput('workspace_cw_fact_check', {}));
        assert.equal(result.ok, false);
    });

    test('returns report + summary for body with claims', async () => {
        const result = await handleContentWriterAction(
            baseInput('workspace_cw_fact_check', {
                body: 'Revenue grew by 120% year-over-year. Goldman Sachs reported strong earnings.',
            }),
        );
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.ok('report' in parsed);
        assert.ok('summary' in parsed);
    });
});

// ---------------------------------------------------------------------------
// workspace_cw_schedule_content
// ---------------------------------------------------------------------------

describe('workspace_cw_schedule_content', () => {
    test('fails when calendarClient not provided', async () => {
        const result = await handleContentWriterAction(
            baseInput('workspace_cw_schedule_content', {
                title: 'My Post',
                dates: { draftDeadline: '2026-07-01', reviewDeadline: '2026-07-08', publishDate: '2026-07-15' },
            }),
        );
        assert.equal(result.ok, false);
        assert.ok(result.output.includes('calendarClient'));
    });

    test('returns schedule with calendarClient', async () => {
        const input: ContentWriterActionInput = {
            ...baseInput('workspace_cw_schedule_content', {
                title: 'My Post',
                dates: { draftDeadline: '2026-07-01', reviewDeadline: '2026-07-08', publishDate: '2026-07-15' },
                connector: 'google_calendar',
            }),
            calendarClient: mockCalendarClient,
        };
        const result = await handleContentWriterAction(input);
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.ok('schedule' in parsed || 'events' in parsed, 'result should contain schedule or events');
    });
});

// ---------------------------------------------------------------------------
// workspace_cw_revision_apply
// ---------------------------------------------------------------------------

describe('workspace_cw_revision_apply', () => {
    test('fails when callerFn not provided', async () => {
        const result = await handleContentWriterAction(
            baseInput('workspace_cw_revision_apply', {
                body: 'Draft content.',
                comments: [{ body: 'Improve intro', section: null, author: 'Alice' }],
            }),
        );
        assert.equal(result.ok, false);
    });

    test('returns revisions with callerFn', async () => {
        const input: ContentWriterActionInput = {
            ...baseInput('workspace_cw_revision_apply', {
                body: 'TypeScript is great. Use it everywhere.',
                comments: [{ body: 'Make more specific', section: null, author: 'Bob' }],
            }),
            callerFn: mockCaller,
        };
        const result = await handleContentWriterAction(input);
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.ok('revisions' in parsed);
    });
});

// ---------------------------------------------------------------------------
// workspace_cw_brand_voice_learn
// ---------------------------------------------------------------------------

describe('workspace_cw_brand_voice_learn', () => {
    test('returns learned brand voice from samples', async () => {
        const result = await handleContentWriterAction(
            baseInput('workspace_cw_brand_voice_learn', {
                samples: [
                    { text: 'We believe in simple tools. Our mission is clarity.' },
                    { text: 'We build for you. You deserve great software.' },
                ],
                baseBrandVoice: { style: 'friendly', doNotUse: [], signaturePhrase: null },
            }),
        );
        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as Record<string, unknown>;
        assert.ok('sampleCount' in parsed);
        assert.equal(parsed['sampleCount'], 2);
    });
});
