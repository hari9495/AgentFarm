import type { FastifyInstance, FastifyRequest } from 'fastify';

type SubmitFeedbackBody = {
    task_id: string;
    skill_id: string;
    rating: number;
    comment?: string;
    workspace_id?: string;
};

type TaskIdParams = {
    taskId: string;
};

type SkillIdParams = {
    skillId: string;
};

export function registerAgentFeedbackRoutes(app: FastifyInstance): void {
    // Submit feedback
    app.post('/feedback', async (req: FastifyRequest<{ Body: SubmitFeedbackBody }>, reply) => {
        const body = req.body ?? {};
        if (!body.task_id || !body.skill_id || body.rating == null) {
            return reply.status(400).send({ error: 'task_id, skill_id, and rating required' });
        }
        const { globalFeedback } = await import('@agentfarm/agent-runtime/agent-feedback.js').catch(
            () => import('../../agent-runtime-stubs.js'),
        );
        const record = globalFeedback.submitFeedback(body);
        return reply.status(201).send(record);
    });

    // Get feedback by task
    app.get(
        '/feedback/:taskId',
        async (req: FastifyRequest<{ Params: TaskIdParams }>, reply) => {
            const { globalFeedback } = await import('@agentfarm/agent-runtime/agent-feedback.js').catch(
                () => import('../../agent-runtime-stubs.js'),
            );
            return reply.send({ feedback: globalFeedback.getFeedback(req.params.taskId) });
        },
    );

    // Get skill rating summary
    app.get(
        '/feedback/skills/:skillId',
        async (req: FastifyRequest<{ Params: SkillIdParams }>, reply) => {
            const { globalFeedback } = await import('@agentfarm/agent-runtime/agent-feedback.js').catch(
                () => import('../../agent-runtime-stubs.js'),
            );
            return reply.send(globalFeedback.getSkillRating(req.params.skillId));
        },
    );

    // All skill ratings
    app.get('/feedback/skills', async (_req, reply) => {
        const { globalFeedback } = await import('@agentfarm/agent-runtime/agent-feedback.js').catch(
            () => import('../../agent-runtime-stubs.js'),
        );
        return reply.send({ skills: globalFeedback.getAllSkillRatings() });
    });

    // Recent feedback list
    app.get(
        '/feedback',
        async (req: FastifyRequest<{ Querystring: { limit?: string } }>, reply) => {
            const { globalFeedback } = await import('@agentfarm/agent-runtime/agent-feedback.js').catch(
                () => import('../../agent-runtime-stubs.js'),
            );
            return reply.send({ feedback: globalFeedback.listAll(Number(req.query.limit ?? 100)) });
        },
    );
}
