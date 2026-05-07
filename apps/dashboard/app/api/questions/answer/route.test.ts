import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from './route';

test('POST /api/questions/answer validates required fields', async () => {
    const response = await POST(new Request('http://dashboard.test/api/questions/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question_id: 'q1' }),
    }));

    const body = await response.json() as { error: string };
    assert.equal(response.status, 400);
    assert.equal(body.error, 'invalid_request');
});
