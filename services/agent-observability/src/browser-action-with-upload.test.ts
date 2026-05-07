import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserActionWithUpload } from './browser-action-with-upload.js';

test('BrowserActionWithUpload uploads before/after screenshots on successful actions', async () => {
    const calls: Array<{ actionId: string; beforeData: string; afterData: string }> = [];
    const uploader = {
        uploadActionScreenshots: async (
            beforeData: string,
            afterData: string,
            _tenantId: string,
            _agentId: string,
            _sessionId: string,
            actionId: string,
        ) => {
            calls.push({ actionId, beforeData, afterData });
            return {
                beforeId: `scr_${actionId}_before`,
                afterId: `scr_${actionId}_after`,
                beforeUrl: `https://blob.example/${actionId}-before.png`,
                afterUrl: `https://blob.example/${actionId}-after.png`,
            };
        },
    };

    const executor = {
        click: async (_selector: string) => ({ networkRequests: [{ method: 'GET', url: 'https://example.com' }], consoleErrors: [] }),
        fill: async (_selector: string, _value: string) => ({ networkRequests: [], consoleErrors: [] }),
        navigate: async (_url: string) => ({ networkRequests: [], consoleErrors: [] }),
        createCaptureAdapter: () => ({
            captureBefore: async () => ({ screenshot: 'data:image/png;base64,AAA', domSnapshot: '{}' }),
            captureAfter: async () => ({ screenshot: 'data:image/png;base64,BBB', domSnapshot: '{}' }),
        }),
    };

    const wrapper = new BrowserActionWithUpload({
        executor: executor as never,
        uploader: uploader as never,
        context: {
            agentId: 'agt_deadbeef_developer_abcd',
            workspaceId: 'ws_1',
            taskId: 'task_1',
            sessionId: 'ses_agt_abcd_20260508T120000_beef',
        },
        tenantId: 'ten_deadbeef',
    });

    const result = await wrapper.click('button.submit');

    assert.equal(result.success, true);
    assert.match(result.actionId, /^act_ses_beef_000$/);
    assert.equal(result.beforeUrl, `https://blob.example/${result.actionId}-before.png`);
    assert.equal(result.afterUrl, `https://blob.example/${result.actionId}-after.png`);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].beforeData, 'data:image/png;base64,AAA');
    assert.equal(calls[0].afterData, 'data:image/png;base64,BBB');
});

test('BrowserActionWithUpload returns failure payload when action execution throws', async () => {
    const uploader = {
        uploadActionScreenshots: async () => {
            throw new Error('should_not_upload_on_failure');
        },
    };

    const executor = {
        click: async (_selector: string) => {
            throw new Error('playwright_click_failed');
        },
        fill: async (_selector: string, _value: string) => ({ networkRequests: [], consoleErrors: [] }),
        navigate: async (_url: string) => ({ networkRequests: [], consoleErrors: [] }),
        createCaptureAdapter: () => ({
            captureBefore: async () => ({ screenshot: 'data:image/png;base64,AAA', domSnapshot: '{}' }),
            captureAfter: async () => ({ screenshot: 'data:image/png;base64,BBB', domSnapshot: '{}' }),
        }),
    };

    const wrapper = new BrowserActionWithUpload({
        executor: executor as never,
        uploader: uploader as never,
        context: {
            agentId: 'agt_deadbeef_developer_abcd',
            workspaceId: 'ws_1',
            taskId: 'task_1',
            sessionId: 'ses_agt_abcd_20260508T120000_beef',
        },
        tenantId: 'ten_deadbeef',
    });

    const result = await wrapper.click('button.submit');
    assert.equal(result.success, false);
    assert.match(result.actionId, /^act_ses_beef_000$/);
    assert.equal(result.errorMessage, 'playwright_click_failed');
});