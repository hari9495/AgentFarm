import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import questionsRoutes from './questions.js';

test('POST /questions creates and GET /questions lists pending questions', async () => {
    const app = Fastify({ logger: false });
    await app.register(questionsRoutes);

    try {
        const create = await app.inject({
            method: 'POST',
            url: '/questions',
            payload: {
                tenantId: 'tenant_1',
                workspaceId: 'ws_1',
                taskId: 'task_1',
                questionText: 'Should we update auth middleware first?',
            },
        });

        assert.equal(create.statusCode, 201);
        const created = create.json() as { id: string; status: string };
        assert.equal(created.status, 'pending');
        assert.ok(created.id);

        const list = await app.inject({
            method: 'GET',
            url: '/questions?tenantId=tenant_1&workspaceId=ws_1&status=pending',
        });

        assert.equal(list.statusCode, 200);
        const body = list.json() as { total: number; items: Array<{ id: string; status: string }> };
        assert.equal(body.total >= 1, true);
        assert.equal(body.items.some((q) => q.id === created.id && q.status === 'pending'), true);
    } finally {
        await app.close();
    }
});

test('POST /questions/:id/answer resolves a pending question', async () => {
    const app = Fastify({ logger: false });
    await app.register(questionsRoutes);

    try {
        const create = await app.inject({
            method: 'POST',
            url: '/questions',
            payload: {
                tenantId: 'tenant_2',
                workspaceId: 'ws_2',
                taskId: 'task_2',
                questionText: 'Proceed with package upgrade?',
            },
        });

        const created = create.json() as { id: string };

        const answer = await app.inject({
            method: 'POST',
            url: `/questions/${created.id}/answer`,
            payload: {
                tenantId: 'tenant_2',
                workspaceId: 'ws_2',
                answeredBy: 'user_1',
                answer: 'Yes, proceed with tests first.',
            },
        });

        assert.equal(answer.statusCode, 200);
        const answered = answer.json() as { status: string; answer: string; answeredBy: string };
        assert.equal(answered.status, 'answered');
        assert.equal(answered.answer, 'Yes, proceed with tests first.');
        assert.equal(answered.answeredBy, 'user_1');
    } finally {
        await app.close();
    }
});
