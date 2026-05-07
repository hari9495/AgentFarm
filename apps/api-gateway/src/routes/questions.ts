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
import type { IQuestionStore } from '@agentfarm/agent-question-service';
import { createDefaultSecretStore } from '../lib/secret-store.js';
import { createRealProviderExecutor } from '../lib/provider-clients.js';

type QuestionNotificationTarget = {
    channelId?: string;
    teamId?: string;
    webhookUrl?: string;
};

type QuestionNotificationResult = {
    attempted: boolean;
    delivered: boolean;
    channel: 'slack' | 'teams' | 'dashboard';
    message: string;
};

type TimeoutResolutionSummary = {
    questionId: string;
    taskId: string;
    policy: 'proceed_with_best_guess' | 'escalate' | 'abandon_task';
    action: 'continue' | 'escalated' | 'abandon_task';
    notification?: QuestionNotificationResult;
};

const secretStore = createDefaultSecretStore();
const providerExecutor = createRealProviderExecutor(secretStore);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const normalizeQuestionContext = (value: unknown): string | null => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed.length > 0 ? trimmed : null;
    }

    if (value === null || value === undefined) {
        return null;
    }

    try {
        return JSON.stringify(value);
    } catch {
        return null;
    }
};

const normalizeQuestionOptions = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) {
        return undefined;
    }

    const normalized = value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

    return normalized;
};

const parseNotificationTarget = (value: unknown): QuestionNotificationTarget | null => {
    if (!isRecord(value)) {
        return null;
    }

    const channelId = typeof value.channelId === 'string' ? value.channelId.trim() : '';
    const teamId = typeof value.teamId === 'string' ? value.teamId.trim() : '';
    const webhookUrl = typeof value.webhookUrl === 'string' ? value.webhookUrl.trim() : '';

    if (!channelId && !teamId && !webhookUrl) {
        return null;
    }

    return {
        channelId: channelId || undefined,
        teamId: teamId || undefined,
        webhookUrl: webhookUrl || undefined,
    };
};

const buildQuestionMessage = (record: {
    id: string;
    taskId: string;
    botId: string;
    question: string;
    expiresAt: string;
    context: string;
    options?: string[];
}): string => {
    const options = Array.isArray(record.options) && record.options.length > 0
        ? `\nOptions: ${record.options.join(' | ')}`
        : '';
    const context = record.context ? `\nContext: ${record.context}` : '';
    return [
        `Agent question from ${record.botId}`,
        `Task: ${record.taskId}`,
        `Question: ${record.question}`,
        `Question ID: ${record.id}`,
        `Expires: ${new Date(record.expiresAt).toLocaleString('en-US')}`,
        context,
        options,
        '\nReply through the dashboard or the question webhook with question_id and answer.',
    ].join('\n');
};

const sendSlackNotification = async (
    record: {
        id: string;
        taskId: string;
        botId: string;
        question: string;
        expiresAt: string;
        context: string;
        options?: string[];
    },
    target: QuestionNotificationTarget | null,
): Promise<QuestionNotificationResult> => {
    const webhookUrl = target?.webhookUrl ?? process.env.AGENT_QUESTION_SLACK_WEBHOOK_URL?.trim();
    if (!webhookUrl) {
        return {
            attempted: false,
            delivered: false,
            channel: 'slack',
            message: 'Slack webhook URL is not configured.',
        };
    }

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: buildQuestionMessage(record) }),
    }).catch(() => null);

    if (!response?.ok) {
        return {
            attempted: true,
            delivered: false,
            channel: 'slack',
            message: `Slack notification failed${response ? ` with ${response.status}` : '.'}`,
        };
    }

    return {
        attempted: true,
        delivered: true,
        channel: 'slack',
        message: 'Slack notification delivered.',
    };
};

const sendTeamsNotification = async (
    prisma: PrismaClient,
    record: {
        tenantId: string;
        workspaceId: string;
        botId: string;
        id: string;
        taskId: string;
        question: string;
        expiresAt: string;
        context: string;
        options?: string[];
    },
    target: QuestionNotificationTarget | null,
): Promise<QuestionNotificationResult> => {
    if (!target?.teamId || !target.channelId) {
        return {
            attempted: false,
            delivered: false,
            channel: 'teams',
            message: 'Teams notification requires teamId and channelId.',
        };
    }

    const connectorId = `teams:${record.tenantId}:${record.workspaceId}`;
    const metadata = await prisma.connectorAuthMetadata.findUnique({
        where: { connectorId },
        select: { secretRefId: true },
    });

    if (!metadata?.secretRefId) {
        return {
            attempted: false,
            delivered: false,
            channel: 'teams',
            message: 'Teams connector is not configured for this workspace.',
        };
    }

    const result = await providerExecutor({
        connectorType: 'teams',
        actionType: 'send_message',
        attempt: 1,
        secretRefId: metadata.secretRefId,
        payload: {
            team_id: target.teamId,
            channel_id: target.channelId,
            message: buildQuestionMessage(record),
        },
    });

    return {
        attempted: true,
        delivered: result.ok,
        channel: 'teams',
        message: result.ok
            ? result.resultSummary ?? 'Teams notification delivered.'
            : result.errorMessage ?? 'Teams notification failed.',
    };
};

const notifyQuestionCreated = async (
    prisma: PrismaClient,
    record: {
        tenantId: string;
        workspaceId: string;
        botId: string;
        id: string;
        taskId: string;
        question: string;
        expiresAt: string;
        context: string;
        options?: string[];
        askedVia: 'slack' | 'teams' | 'dashboard';
    },
    target: QuestionNotificationTarget | null,
): Promise<QuestionNotificationResult> => {
    if (record.askedVia === 'dashboard') {
        return {
            attempted: false,
            delivered: true,
            channel: 'dashboard',
            message: 'Question is available in the dashboard queue.',
        };
    }

    if (record.askedVia === 'slack') {
        return sendSlackNotification(record, target);
    }

    return sendTeamsNotification(prisma, record, target);
};

const writeTimeoutAudit = async (
    prisma: PrismaClient,
    input: {
        tenantId: string;
        workspaceId: string;
        botId: string;
        correlationId: string;
        summary: string;
        severity: 'info' | 'warn' | 'error';
    },
): Promise<void> => {
    await prisma.auditEvent.create({
        data: {
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            botId: input.botId,
            eventType: 'audit_event',
            severity: input.severity,
            summary: input.summary,
            sourceSystem: 'agent-question-service',
            correlationId: input.correlationId,
        },
    });
};

const processTimeoutPolicy = async (
    prisma: PrismaClient,
    expired: { policy: 'proceed_with_best_guess' | 'escalate' | 'abandon_task'; record: any },
): Promise<TimeoutResolutionSummary> => {
    const { policy, record } = expired;

    if (policy === 'proceed_with_best_guess') {
        await writeTimeoutAudit(prisma, {
            tenantId: record.tenantId,
            workspaceId: record.workspaceId,
            botId: record.botId,
            correlationId: record.correlationId,
            severity: 'info',
            summary: `Question ${record.id} timed out. Proceed with best guess for task ${record.taskId}.`,
        });
        return {
            questionId: record.id,
            taskId: record.taskId,
            policy,
            action: 'continue',
        };
    }

    if (policy === 'abandon_task') {
        await writeTimeoutAudit(prisma, {
            tenantId: record.tenantId,
            workspaceId: record.workspaceId,
            botId: record.botId,
            correlationId: record.correlationId,
            severity: 'error',
            summary: `Question ${record.id} timed out. Abandon task ${record.taskId} and request manual intervention.`,
        });
        return {
            questionId: record.id,
            taskId: record.taskId,
            policy,
            action: 'abandon_task',
        };
    }

    await writeTimeoutAudit(prisma, {
        tenantId: record.tenantId,
        workspaceId: record.workspaceId,
        botId: record.botId,
        correlationId: record.correlationId,
        severity: 'warn',
        summary: `Question ${record.id} timed out. Escalation required for task ${record.taskId}.`,
    });

    const notification = await notifyQuestionCreated(prisma, record, null);
    return {
        questionId: record.id,
        taskId: record.taskId,
        policy,
        action: 'escalated',
        notification,
    };
};

export async function registerQuestionRoutes(
    app: FastifyInstance,
    prisma: PrismaClient,
    options?: { questionStore?: IQuestionStore },
) {
    const questionStore = options?.questionStore ?? new PrismaQuestionStore(prisma);

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
                notificationTarget,
            } = body;

            const normalizedContext = normalizeQuestionContext(context);
            const normalizedOptions = normalizeQuestionOptions(options);

            if (!tenantId || !workspaceId || !taskId || !botId || !question || !normalizedContext) {
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
                    context: normalizedContext,
                    options: normalizedOptions,
                    askedVia,
                    timeoutMs,
                    onTimeout,
                    correlationId: (req as any).id || 'unknown',
                },
                questionStore
            );

            const notification = await notifyQuestionCreated(
                prisma,
                record,
                parseNotificationTarget(notificationTarget),
            );

            return res.status(201).send({ question: record, notification });
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
            const resolutions = await Promise.all(expired.map((entry) => processTimeoutPolicy(prisma, entry)));

            return res.send({
                workspaceId,
                expiredCount: expired.length,
                policies: expired.map((e: any) => e.policy),
                resolutions,
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
