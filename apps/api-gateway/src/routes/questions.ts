/**
 * Agent Question Service REST API (Fastify routes)
 * Frozen 2026-05-07 — Completed Feature #2 Implementation
 *
 * Handles:
 * - POST   /api/v1/questions                        — agent creates question
 * - POST   /api/v1/questions/:id/answer             — human answers question (webhook)
 * - GET    /api/v1/tasks/:taskId/questions          — get pending for task
 * - GET    /api/v1/workspaces/:id/questions/pending — orchestrator polls
 * - POST   /api/v1/workspaces/:id/questions/sweep-expired — sweep timeouts
 * - GET    /api/v1/questions/:id                    — get specific question
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { createQuestion, answerQuestion, sweepExpiredQuestions } from '@agentfarm/agent-question-service';
import { PrismaQuestionStore } from '@agentfarm/agent-question-service';

export async function registerQuestionRoutes(app: FastifyInstance, prisma: PrismaClient) {
    const questionStore = new PrismaQuestionStore(prisma);

    // ========== CREATE QUESTION (from agent) ==========
    app.post('/api/v1/questions', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const body = req.body as any;
            const {
                tenantId,
                workspaceId,
                taskId,
                botId,
                question,
                context,
                options,
                askedVia,
                timeoutMs,
                onTimeout,
            } = body;

            if (!tenantId || !workspaceId || !taskId || !botId || !question || !context) {
                return res.status(400).send({
                    error: 'Missing required: tenantId, workspaceId, taskId, botId, question, context',
                });
            }

            if (!['slack', 'teams', 'dashboard'].includes(askedVia)) {
                return res.status(400).send({ error: 'Invalid askedVia: must be slack, teams, or dashboard' });
            }

            const record = await createQuestion(
                {
                    tenantId,
                    workspaceId,
                    taskId,
                    botId,
                    question,
                    context,
                    options,
                    askedVia,
                    timeoutMs,
                    onTimeout,
                    correlationId: (req as any).id || 'unknown',
                },
                questionStore
            );

            // TODO: Send notification via Slack/Teams connector
            return res.status(201).send({ question: record });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to create question: ${msg}` });
        }
    });

    // ========== ANSWER QUESTION (webhook from Slack/Teams or dashboard) ==========
    app.post('/api/v1/questions/:questionId/answer', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const params = req.params as any;
            const body = req.body as any;
            const { questionId } = params;
            const { answer, answeredBy } = body;

            if (!answer || !answeredBy) {
                return res.status(400).send({ error: 'Missing required: answer, answeredBy' });
            }

            const record = await answerQuestion(questionId, answer, answeredBy, questionStore);
            if (!record) {
                return res.status(404).send({ error: 'Question not found or not pending' });
            }

            return res.send({ question: record, message: 'Question answered' });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to answer question: ${msg}` });
        }
    });

    // ========== GET PENDING QUESTIONS FOR TASK ==========
    app.get('/api/v1/tasks/:taskId/questions', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const params = req.params as any;
            const { taskId } = params;

            const questions = await questionStore.findPendingByTask(taskId);
            return res.send({ taskId, questionCount: questions.length, questions });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to fetch questions: ${msg}` });
        }
    });

    // ========== GET PENDING QUESTIONS FOR WORKSPACE (orchestrator sweep) ==========
    app.get('/api/v1/workspaces/:workspaceId/questions/pending', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const params = req.params as any;
            const { workspaceId } = params;

            const questions = await questionStore.findPendingByWorkspace(workspaceId);
            return res.send({ workspaceId, pendingCount: questions.length, questions });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to fetch questions: ${msg}` });
        }
    });

    // ========== SWEEP EXPIRED QUESTIONS (orchestrator wake cycle) ==========
    app.post('/api/v1/workspaces/:workspaceId/questions/sweep-expired', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const params = req.params as any;
            const { workspaceId } = params;

            const expired = await sweepExpiredQuestions(workspaceId, questionStore);

            // TODO: Process timeout policies per record.onTimeout

            return res.send({
                workspaceId,
                expiredCount: expired.length,
                policies: expired.map((e: any) => e.policy),
            });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to sweep: ${msg}` });
        }
    });

    // ========== GET SPECIFIC QUESTION ==========
    app.get('/api/v1/questions/:questionId', async (req: FastifyRequest, res: FastifyReply) => {
        try {
            const params = req.params as any;
            const { questionId } = params;

            const question = await questionStore.findById(questionId);
            if (!question) {
                return res.status(404).send({ error: 'Question not found' });
            }

            return res.send({ question });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            return res.status(500).send({ error: `Failed to fetch question: ${msg}` });
        }
    });
}
