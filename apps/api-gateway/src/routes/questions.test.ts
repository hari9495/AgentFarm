import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { registerQuestionRoutes } from './questions.js';
import { PrismaClient } from '@prisma/client';
import { InMemoryQuestionStore } from '@agentfarm/agent-question-service';

process.env.DATABASE_URL ??= 'postgresql://agentfarm:agentfarm@localhost:5432/agentfarm';

test('POST /questions creates and GET /questions lists pending questions', async () => {
    const app = Fastify({ logger: false });
    const prisma = new PrismaClient();
    const questionStore = new InMemoryQuestionStore();

    await registerQuestionRoutes(app, prisma, { questionStore });

    try {
        const create = await app.inject({
            method: 'POST',
            url: '/api/v1/questions',
            payload: {
                tenantId: 'tenant_1',
                workspaceId: 'ws_1',
                taskId: 'task_1',
                botId: 'bot_1',
                question: 'Should we update auth middleware first?',
                context: {},
                options: [],
                askedVia: 'dashboard',
            },
        });

        assert.equal(create.statusCode, 201);
        const created = create.json() as { question: { status: string; id: string } };
        assert.equal(created.question.status, 'pending');
        assert.ok(created.question.id);

        const list = await app.inject({
            method: 'GET',
            url: '/api/v1/workspaces/ws_1/questions/pending',
        });

        assert.equal(list.statusCode, 200);
        const body = list.json() as { pendingCount: number; questions: Array<{ id: string; status: string }> };
        assert.equal(body.pendingCount >= 1, true);
        assert.equal(body.questions.some((q) => q.id === created.question.id && q.status === 'pending'), true);
    } finally {
        await app.close();
        await prisma.$disconnect();
    }
});

test('POST /questions/:id/answer resolves a pending question', async () => {
    const app = Fastify({ logger: false });
    const prisma = new PrismaClient();
    const questionStore = new InMemoryQuestionStore();

    await registerQuestionRoutes(app, prisma, { questionStore });

    try {
        const create = await app.inject({
            method: 'POST',
            url: '/api/v1/questions',
            payload: {
                tenantId: 'tenant_2',
                workspaceId: 'ws_2',
                taskId: 'task_2',
                botId: 'bot_2',
                question: 'Proceed with package upgrade?',
                context: {},
                options: [],
                askedVia: 'dashboard',
            },
        });

        const created = create.json() as { question: { id: string } };
        assert.equal(create.statusCode, 201, `question create failed: ${create.body}`);
        assert.ok(created.question?.id);

        const answer = await app.inject({
            method: 'POST',
            url: `/api/v1/questions/${created.question.id}/answer`,
            payload: {
                answer: 'Yes, proceed with tests first.',
                answeredBy: 'user_1',
            },
        });

        assert.equal(answer.statusCode, 200);
        const answered = answer.json() as { question: { status: string; answer: string; answeredBy: string } };
        assert.equal(answered.question.status, 'answered');
        assert.equal(answered.question.answer, 'Yes, proceed with tests first.');
        assert.equal(answered.question.answeredBy, 'user_1');
    } finally {
        await app.close();
        await prisma.$disconnect();
    }
});
