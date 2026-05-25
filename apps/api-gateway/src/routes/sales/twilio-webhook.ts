/**
 * twilio-webhook.ts
 *
 * Handles Twilio webhook callbacks for the AI cold-call conversation loop.
 *
 * Routes:
 *   POST /v1/sales/calls/answer/:tenantId/:botId/:prospectId
 *     — Called by Twilio when the prospect answers. Serves the opening TwiML script.
 *     — The call script is passed base64url-encoded in ?s= to avoid a DB lookup on answer.
 *
 *   POST /v1/sales/calls/turn/:tenantId/:botId/:prospectId/:turn
 *     — Called by Twilio after each <Gather> (prospect has spoken).
 *     — Classifies the SpeechResult, generates the agent's next utterance, returns TwiML.
 *
 *   POST /v1/sales/calls/status/:tenantId/:botId/:prospectId
 *     — Called by Twilio on call completion. Updates CallRecord status + logs final activity.
 *
 * NOTE: For production, validate Twilio request signatures using the X-Twilio-Signature header.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
    buildAnswerTwiml,
    buildTurnTwiml,
} from '@agentfarm/agent-runtime/sales/twilio-provider.js';
import {
    generateCallTurnResponse,
    classifyCallUtterance,
} from '@agentfarm/agent-runtime/sales/call-scripts.js';

type AnswerParams = { tenantId: string; botId: string; prospectId: string };
type TurnParams = { tenantId: string; botId: string; prospectId: string; turn: string };
type StatusParams = { tenantId: string; botId: string; prospectId: string };

type AnswerBody = { CallSid?: string; CallStatus?: string };
type TurnBody = { SpeechResult?: string; CallSid?: string; Confidence?: string };
type StatusBody = { CallSid?: string; CallStatus?: string; CallDuration?: string };

type PrismaWithCalls = {
    callRecord: {
        findFirst: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

interface ScriptPayload {
    script: { fullScript: string };
    prospectName: string;
    company: string;
    productDescription: string;
    icp: string;
}

function decodeScriptPayload(encoded: string): ScriptPayload | null {
    try {
        const json = Buffer.from(encoded, 'base64url').toString('utf8');
        return JSON.parse(json) as ScriptPayload;
    } catch {
        return null;
    }
}

const MAX_TURNS = 5;

export type RegisterTwilioWebhookOptions = {
    prisma?: PrismaClient;
};

export async function registerTwilioWebhookRoutes(
    app: FastifyInstance,
    options: RegisterTwilioWebhookOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : async () => {
            const { prisma } = await import('../../lib/db.js');
            return prisma;
        };

    // ── Answer: serve opening script TwiML ───────────────────────────────
    app.post<{ Params: AnswerParams; Body: AnswerBody; Querystring: { s?: string } }>(
        '/v1/sales/calls/answer/:tenantId/:botId/:prospectId',
        async (request, reply) => {
            const { tenantId, botId, prospectId } = request.params;
            const encodedScript = request.query?.['s'] ?? '';
            const payload = decodeScriptPayload(encodedScript);

            const openingText = payload?.script?.fullScript
                ?? 'Hi there, I hope I am not catching you at a bad time. I will follow up by email. Have a great day!';

            const turn1Url = `${request.protocol}://${request.hostname}/v1/sales/calls/turn/${tenantId}/${botId}/${prospectId}/1`;

            const twiml = buildAnswerTwiml(openingText, turn1Url);

            // Persist call record lookup context (best-effort)
            const callSid = request.body?.CallSid ?? '';
            if (callSid) {
                const prisma = await resolvePrisma();
                const db = prisma as unknown as PrismaWithCalls;
                const record = await db.callRecord.findFirst({
                    where: { tenantId, prospectId, status: 'initiated' },
                }).catch(() => null);
                if (record) {
                    const transcript = safeParseJson<unknown[]>(String(record['transcript'] ?? '[]'), []);
                    transcript.push({
                        speaker: 'agent',
                        text: openingText,
                        timestamp: new Date().toISOString(),
                    });
                    await db.callRecord.update({
                        where: { id: String(record['id']) },
                        data: {
                            twilioCallSid: callSid,
                            status: 'in-progress',
                            transcript: JSON.stringify(transcript),
                            updatedAt: new Date(),
                        },
                    }).catch(() => undefined);
                }
            }

            reply.header('Content-Type', 'application/xml');
            return reply.send(twiml);
        },
    );

    // ── Turn: classify speech, generate next agent utterance ─────────────
    app.post<{ Params: TurnParams; Body: TurnBody; Querystring: { s?: string } }>(
        '/v1/sales/calls/turn/:tenantId/:botId/:prospectId/:turn',
        async (request, reply) => {
            const { tenantId, botId, prospectId, turn } = request.params;
            const turnNumber = parseInt(turn, 10) || 1;
            const speechResult = request.body?.SpeechResult ?? '';
            const callSid = request.body?.CallSid ?? '';
            const encodedScript = request.query?.['s'] ?? '';

            // Load script context either from URL or DB
            let ctx = decodeScriptPayload(encodedScript);
            if (!ctx && callSid) {
                const prisma = await resolvePrisma();
                const db = prisma as unknown as PrismaWithCalls;
                const record = await db.callRecord.findFirst({
                    where: { twilioCallSid: callSid, tenantId },
                }).catch(() => null);
                if (record) {
                    ctx = {
                        script: { fullScript: '' },
                        prospectName: 'there',
                        company: '',
                        productDescription: '',
                        icp: '',
                    };
                }
            }

            const scriptCtx = ctx ?? {
                script: { fullScript: '' },
                prospectName: 'there',
                company: '',
                productDescription: '',
                icp: '',
            };

            // Classify the prospect's utterance
            const { intent } = speechResult
                ? await classifyCallUtterance(speechResult)
                : { intent: 'unknown' };

            // Generate agent's next turn
            const { text: agentText, shouldHangUp } = await generateCallTurnResponse(
                speechResult || '(silence)',
                intent,
                turnNumber,
                {
                    prospectName: scriptCtx.prospectName,
                    company: scriptCtx.company,
                    productDescription: scriptCtx.productDescription,
                    icp: scriptCtx.icp,
                },
            );

            // Persist transcript turn (best-effort)
            if (callSid) {
                const prisma = await resolvePrisma();
                const db = prisma as unknown as PrismaWithCalls;
                const record = await db.callRecord.findFirst({
                    where: { twilioCallSid: callSid, tenantId },
                }).catch(() => null);
                if (record) {
                    const transcript = safeParseJson<unknown[]>(String(record['transcript'] ?? '[]'), []);
                    if (speechResult) {
                        transcript.push({ speaker: 'prospect', text: speechResult, intent, timestamp: new Date().toISOString() });
                    }
                    transcript.push({ speaker: 'agent', text: agentText, timestamp: new Date().toISOString() });
                    await db.callRecord.update({
                        where: { id: String(record['id']) },
                        data: { transcript: JSON.stringify(transcript), updatedAt: new Date() },
                    }).catch(() => undefined);
                }
            }

            const forceHangUp = shouldHangUp || intent === 'unsubscribe' || turnNumber >= MAX_TURNS;
            const nextTurn = turnNumber + 1;
            const s = encodedScript ? `?s=${encodedScript}` : '';
            const nextTurnUrl = `${request.protocol}://${request.hostname}/v1/sales/calls/turn/${tenantId}/${botId}/${prospectId}/${nextTurn}${s}`;

            const twiml = buildTurnTwiml(agentText, nextTurnUrl, forceHangUp);

            reply.header('Content-Type', 'application/xml');
            return reply.send(twiml);
        },
    );

    // ── Status callback: update CallRecord on completion ─────────────────
    app.post<{ Params: StatusParams; Body: StatusBody }>(
        '/v1/sales/calls/status/:tenantId/:botId/:prospectId',
        async (request, reply) => {
            const { tenantId, botId, prospectId } = request.params;
            const callSid = request.body?.CallSid ?? '';
            const callStatus = request.body?.CallStatus ?? '';
            const durationSeconds = request.body?.CallDuration
                ? parseInt(request.body.CallDuration, 10)
                : undefined;

            if (callSid) {
                const prisma = await resolvePrisma();
                const db = prisma as unknown as PrismaWithCalls;

                const record = await db.callRecord.findFirst({
                    where: { twilioCallSid: callSid, tenantId },
                }).catch(() => null);

                if (record) {
                    const finalStatus = mapTwilioStatus(callStatus);
                    await db.callRecord.update({
                        where: { id: String(record['id']) },
                        data: {
                            status: finalStatus,
                            durationSeconds: durationSeconds ?? null,
                            completedAt: new Date(),
                            outcome: finalStatus,
                            updatedAt: new Date(),
                        },
                    }).catch(() => undefined);

                    // Log final SalesActivity based on outcome
                    const activityType = finalStatus === 'no-answer' ? 'call_no_answer'
                        : finalStatus === 'voicemail' ? 'call_voicemail'
                        : finalStatus === 'completed' ? 'call_answered'
                        : 'call_no_answer';

                    await db.salesActivity.create({
                        data: {
                            tenantId,
                            botId,
                            prospectId,
                            activityType,
                            subject: `Call ${finalStatus} — ${durationSeconds ?? 0}s`,
                            outcome: finalStatus,
                            completedAt: new Date(),
                            createdAt: new Date(),
                            updatedAt: new Date(),
                        },
                    }).catch(() => undefined);
                }
            }

            reply.code(204);
            return reply.send();
        },
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapTwilioStatus(status: string): string {
    switch (status.toLowerCase()) {
        case 'completed': return 'completed';
        case 'no-answer': return 'no-answer';
        case 'busy': return 'no-answer';
        case 'failed': return 'failed';
        case 'canceled': return 'failed';
        default: return status || 'unknown';
    }
}

function safeParseJson<T>(raw: string, fallback: T): T {
    try { return JSON.parse(raw) as T; } catch { return fallback; }
}
