/**
 * Tests for mobile-action-handler.ts
 *
 * Pattern: node:test with describe/it.
 *
 * Dependency injection:
 *   - executeAction  — required; use a no-op mock (workspace file writes are fire-and-forget)
 *   - callLlm        — optional; omit to test fallback paths; inject a stub for LLM paths
 *   - runCommand     — optional; not needed for the pure paths tested here
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isMobileActionType, MOBILE_ACTION_TYPES } from './mobile-action-handler.js';

const BASE = {
    tenantId: 'tenant-1',
    botId: 'bot-1',
    taskId: 'task-1',
    workspaceDir: '/tmp/test-workspace',
    workspaceId: 'ws-1',
    gatewayBaseUrl: '',
    serviceToken: '',
};

/** No-op mock for workspace file writes. Always succeeds. */
const noopExecuteAction = async (_at: string, _payload: Record<string, unknown>) =>
    ({ ok: true as const, output: '' });

// ── Type guard ────────────────────────────────────────────────────────────────

describe('isMobileActionType', () => {
    it('returns true for every type in MOBILE_ACTION_TYPES', () => {
        for (const t of MOBILE_ACTION_TYPES) {
            assert.ok(isMobileActionType(t), `expected true for ${t}`);
        }
    });

    it('returns false for non-mobile types', () => {
        assert.equal(isMobileActionType('workspace_pm_sprint_plan'), false);
        assert.equal(isMobileActionType('workspace_ba_draft_brd'), false);
        assert.equal(isMobileActionType(''), false);
        assert.equal(isMobileActionType('workspace_mob_'), false); // partial prefix — not valid
    });
});

describe('MOBILE_ACTION_TYPES set', () => {
    it('contains iOS action types', () => {
        assert.ok(MOBILE_ACTION_TYPES.has('workspace_mob_ios_component'));
        assert.ok(MOBILE_ACTION_TYPES.has('workspace_mob_ios_build'));
        assert.ok(MOBILE_ACTION_TYPES.has('workspace_mob_ios_test'));
    });

    it('contains Android action types', () => {
        assert.ok(MOBILE_ACTION_TYPES.has('workspace_mob_android_component'));
        assert.ok(MOBILE_ACTION_TYPES.has('workspace_mob_android_build'));
        assert.ok(MOBILE_ACTION_TYPES.has('workspace_mob_android_test'));
    });

    it('contains cross-platform action types', () => {
        assert.ok(MOBILE_ACTION_TYPES.has('workspace_mob_push_notify'));
        assert.ok(MOBILE_ACTION_TYPES.has('workspace_mob_deep_link'));
        assert.ok(MOBILE_ACTION_TYPES.has('workspace_mob_standup_report'));
        assert.ok(MOBILE_ACTION_TYPES.has('workspace_mob_scaffold_project'));
    });
});

// ── workspace_mob_push_notify ─────────────────────────────────────────────────

describe('workspace_mob_push_notify', () => {
    it('generates push config for both platforms by default', async () => {
        const { handleMobileAction } = await import('./mobile-action-handler.js');

        const result = await handleMobileAction({
            ...BASE,
            actionType: 'workspace_mob_push_notify',
            payload: { app_id: 'com.acme.app', environment: 'sandbox' },
            executeAction: noopExecuteAction,
        });

        assert.equal(result.ok, true, `unexpected error: ${result.errorOutput}`);
        const parsed = JSON.parse(result.output) as { files_written: string[]; platform: string; app_id: string };
        assert.equal(parsed.platform, 'both');
        assert.equal(parsed.app_id, 'com.acme.app');
        // both platforms → at least 4 files (2 iOS + 2 Android)
        assert.ok(parsed.files_written.length >= 4, `expected ≥4 files, got ${parsed.files_written.length}`);
        assert.ok(parsed.files_written.some((f) => f.includes('ios/')), 'missing iOS file');
        assert.ok(parsed.files_written.some((f) => f.includes('android/')), 'missing Android file');
    });

    it('generates iOS-only push config when platform is ios', async () => {
        const { handleMobileAction } = await import('./mobile-action-handler.js');

        const result = await handleMobileAction({
            ...BASE,
            actionType: 'workspace_mob_push_notify',
            payload: { platform: 'ios', app_id: 'com.acme.ios' },
            executeAction: noopExecuteAction,
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { files_written: string[]; platform: string };
        assert.equal(parsed.platform, 'ios');
        assert.ok(parsed.files_written.every((f) => f.includes('ios/')), 'unexpected Android file in ios-only mode');
    });

    it('generates Android-only push config when platform is android', async () => {
        const { handleMobileAction } = await import('./mobile-action-handler.js');

        const result = await handleMobileAction({
            ...BASE,
            actionType: 'workspace_mob_push_notify',
            payload: { platform: 'android', app_id: 'com.acme.android' },
            executeAction: noopExecuteAction,
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { files_written: string[]; platform: string };
        assert.equal(parsed.platform, 'android');
        assert.ok(parsed.files_written.every((f) => f.includes('android/')), 'unexpected iOS file in android-only mode');
    });
});

// ── workspace_mob_deep_link ───────────────────────────────────────────────────

describe('workspace_mob_deep_link', () => {
    it('generates Android deep link config without callLlm', async () => {
        const { handleMobileAction } = await import('./mobile-action-handler.js');

        const result = await handleMobileAction({
            ...BASE,
            actionType: 'workspace_mob_deep_link',
            payload: {
                platform: 'android',
                scheme: 'myapp',
                host: 'open',
                paths: ['/product', '/checkout'],
            },
            executeAction: noopExecuteAction,
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as {
            scheme: string; host: string; files_written: string[];
        };
        assert.equal(parsed.scheme, 'myapp');
        assert.equal(parsed.host, 'open');
        assert.ok(parsed.files_written.some((f) => f.includes('deep_link')), 'expected deep link file');
    });

    it('uses default scheme/host when not provided', async () => {
        const { handleMobileAction } = await import('./mobile-action-handler.js');

        const result = await handleMobileAction({
            ...BASE,
            actionType: 'workspace_mob_deep_link',
            payload: { platform: 'android' }, // omit scheme/host
            executeAction: noopExecuteAction,
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { scheme: string; host: string };
        assert.ok(parsed.scheme.length > 0, 'default scheme should be applied');
        assert.ok(parsed.host.length > 0, 'default host should be applied');
    });
});

// ── workspace_mob_standup_report ──────────────────────────────────────────────

describe('workspace_mob_standup_report', () => {
    it('returns ok:true with default spoken_text when callLlm is not provided', async () => {
        const { handleMobileAction } = await import('./mobile-action-handler.js');

        const result = await handleMobileAction({
            ...BASE,
            actionType: 'workspace_mob_standup_report',
            payload: {
                bot_name: 'MobileBot',
                team_name: 'App Team',
                platform: 'iOS',
                completed: ['Fixed crash on launch'],
                in_progress: ['App Store submission'],
                blockers: [],
            },
            executeAction: noopExecuteAction,
            // callLlm intentionally omitted
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as {
            bot_name: string; team_name: string; spoken_text: string;
        };
        assert.equal(parsed.bot_name, 'MobileBot');
        assert.equal(parsed.team_name, 'App Team');
        assert.ok(parsed.spoken_text.length > 0, 'spoken_text should have fallback content');
        assert.ok(
            parsed.spoken_text.includes('MobileBot') || parsed.spoken_text.includes('completed'),
            'fallback should mention bot or items',
        );
    });

    it('uses LLM-generated spoken text when callLlm is provided', async () => {
        const { handleMobileAction } = await import('./mobile-action-handler.js');

        const result = await handleMobileAction({
            ...BASE,
            actionType: 'workspace_mob_standup_report',
            payload: {
                completed: ['Released v2.1.0'],
                crash_rate: 99.7,
            },
            executeAction: noopExecuteAction,
            callLlm: async () => 'Yesterday: released v2.1.0. Today: hotfix testing. No blockers. Crash-free: 99.7%.',
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { spoken_text: string; crash_rate: number };
        assert.ok(parsed.spoken_text.includes('hotfix') || parsed.spoken_text.includes('99.7'), 'LLM text should be used');
        assert.equal(parsed.crash_rate, 99.7);
    });

    it('handles empty payload gracefully with default values', async () => {
        const { handleMobileAction } = await import('./mobile-action-handler.js');

        const result = await handleMobileAction({
            ...BASE,
            actionType: 'workspace_mob_standup_report',
            payload: {},
            executeAction: noopExecuteAction,
        });

        assert.equal(result.ok, true);
        const parsed = JSON.parse(result.output) as { bot_name: string; platform: string };
        assert.ok(parsed.bot_name.length > 0, 'default bot_name should be applied');
        assert.ok(parsed.platform.length > 0, 'default platform should be applied');
    });
});

// ── workspace_mob_ios_component ───────────────────────────────────────────────

describe('workspace_mob_ios_component', () => {
    it('returns ok:true with Swift code when callLlm is not provided (scaffold fallback)', async () => {
        const { handleMobileAction } = await import('./mobile-action-handler.js');

        const result = await handleMobileAction({
            ...BASE,
            actionType: 'workspace_mob_ios_component',
            payload: {
                component_name: 'LoginButton',
                description: 'A styled login button with loading state',
                platform: 'ios',
            },
            executeAction: noopExecuteAction,
        });

        assert.equal(result.ok, true, `unexpected error: ${result.errorOutput}`);
        assert.ok(typeof result.output === 'string');
        assert.ok(result.output.length > 0);
    });
});

// ── workspace_mob_android_component ──────────────────────────────────────────

describe('workspace_mob_android_component', () => {
    it('returns ok:true with Kotlin code when callLlm is not provided (scaffold fallback)', async () => {
        const { handleMobileAction } = await import('./mobile-action-handler.js');

        const result = await handleMobileAction({
            ...BASE,
            actionType: 'workspace_mob_android_component',
            payload: {
                component_name: 'ProfileCard',
                description: 'A Material 3 profile card with avatar and name',
            },
            executeAction: noopExecuteAction,
        });

        assert.equal(result.ok, true, `unexpected error: ${result.errorOutput}`);
        assert.ok(typeof result.output === 'string');
        assert.ok(result.output.length > 0);
    });
});
