import test from 'node:test';
import assert from 'node:assert/strict';
import { ScreenshotUploader } from './screenshot-uploader.js';

test('ScreenshotUploader.getSignedUrl returns signed URL for existing action screenshot path', async () => {
    const storage = {
        generateSignedUrl: (path: string) => `https://blob.example/container/${path}?sig=read`,
    };

    const uploader = new ScreenshotUploader(storage as never);

    const url = await uploader.getSignedUrl(
        'ten_deadbeef',
        'agt_deadbeef_developer_beef',
        'ses_agt_beef_20260508T120000_cafe',
        'act_ses_cafe_000',
        'before',
    );

    assert.ok(url);
    assert.match(
        url as string,
        /screenshots\/ten_deadbeef\/agt_deadbeef_developer_beef\/ses_agt_beef_20260508T120000_cafe\/scr_act_ses_cafe_000_before\.png\?sig=read$/,
    );
});