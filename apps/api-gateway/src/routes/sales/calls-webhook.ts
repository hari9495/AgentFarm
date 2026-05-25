/**
 * calls-webhook.ts
 *
 * Provider-agnostic webhook handler for AI cold-call conversations.
 * Supports: Twilio, SignalWire, Plivo, Vonage.
 *
 * Routes:
 *   POST /v1/sales/calls/answer/:tenantId/:botId/:prospectId?p=<provider>
 *     — Called by the provider when the prospect answers.
 *     — Serves the opening script as TwiML XML or NCCO JSON.
 *     — Script payload is base64url-encoded in ?s= to avoid a DB lookup on answer.
 *
 *   POST /v1/sales/calls/turn/:tenantId/:botId/:prospectId/:turn?p=<provider>
 *     — Called by the provider after each speech-gather turn.
 *     — Classifies speech, generates the next agent utterance, returns response.
 *
 *   POST /v1/sales/calls/status/:tenantId/:botId/:prospectId?p=<provider>
 *     — Called by the provider on call completion.
 *     — Updates CallRecord status + logs final SalesActivity.
 *
 * ?p=<provider> defaults to "twilio" when omitted, ensuring backward compatibility
 * with any in-flight Twilio webhooks that don't include the param.
 *
 * NOTE: For production, validate provider request signatures
 *       (X-Twilio-Signature for Twilio, etc.).
 */

import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import {
    generateCallTurnResponse,
    classifyCallUtterance,
} from '@agentfarm/agent-runtime/sales/call-scripts.js';
import { TwilioProvider } from '@agentfarm/agent-runtime/sales/twilio-provider.js';
import { SignalWireProvider } from '@agentfarm/agent-runtime/sales/signalwire-provider.js';
import { PlivoProvider } from '@agentfarm/agent-runtime/sales/plivo-provider.js';
import { VonageProvider } from '@agentfarm/agent-runtime/sales/vonage-provider.js';
import type { TelephonyProvider } from '@agentfarm/agent-runtime/sales/telephony-provider.js';

type AnswerParams = { tenantId: string; botId: string; prospectId: string };
type TurnParams = { tenantId: string; botId: string; prospectId: string; turn: string };
type StatusParams = { tenantId: string; botId: string; prospectId: string };

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

/** Resolve a TelephonyProvider for webhook response-building only (no credentials needed). */
function getProviderForWebhook(providerSlug: string): TelephonyProvider {
    switch (providerSlug) {
        case 'signalwire':
            // SignalWire TwiML is identical to Twilio — reuse TwilioProvider response builders
            return new TwilioProvider({ accountSid: '', authToken: '' });
        case 'plivo':
            return new PlivoProvider({ authId: '', authToken: '', fromNumber: '' });
        case 'vonage':
            return new VonageProvider({ apiKey: '', apiSecret: '', applicationId: '', privateKey: '', fromNumber: '' });
        case 'twilio':
        default:
            return new TwilioProvider({ accountSid: '', authToken: '' });
    }
}

const MAX_TURNS = 5;

export type RegisterCallsWebhookOptions = {
    prisma?: PrismaClient;
};

export async function registerCallsWebhookRoutes(
    app: FastifyInstance,
    options: RegisterCallsWebhookOptions,
): Promise<void> {
    const resolvePrisma = options.prisma
        ? () => Promise.resolve(options.prisma!)
        : async () => {
            const { prisma } = await import('../../lib/db.js');
            return prisma;
        };

    // ── Answer: serve opening script ─────────────────────────────────────
    app.post<{ Params: AnswerParams; Body: Record<string, string>; Querystring: { s?: string; p?: string } }>(
        '/v1/sales/calls/answer/:tenantId/:botId/:prospectId',
        async (request, reply) => {
            const { tenantId, botId, prospectId } = request.params;
            const encodedScript = request.query?.['s'] ?? '';
            const providerSlug = request.query?.['p'] ?? 'twilio';
            const telephonyProvider = getProviderForWebhook(providerSlug);

            const payload = decodeScriptPayload(encodedScript);
            const openingText = payload?.script?.fullScript
                ?? 'Hi there, I hope I am not catching you at a bad time. I will follow up by email. Have a great day!';

            const turn1Url = `${request.protocol}://${request.hostname}/v1/sales/calls/turn/${tenantId}/${botId}/${prospectId}/1?p=${providerSlug}`;

            const responseBody = telephonyProvider.buildAnswerResponse(openingText, turn1Url);

            // Persist call record lookup context (best-effort)
            const body = (request.body ?? {}) as Record<string, string | undefined>;
            const callId = telephonyProvider.extractCallId(body);
            if (callId) {
                const prisma = await resolvePrisma();
                const db = prisma as unknown as PrismaWithCalls;
                const record = await db.callRecord.findFirst({
                    where: { tenantId, prospectId, status: 'initiated' },
                }).catch(() => null);
                if (record) {
                    const transcript = safeParseJson<unknown[]>(String(record['transcript'] ?? '[]'), []);
                    transcript.push({ speaker: 'agent', text: openingText, timestamp: new Date().toISOString() });
                    await db.callRecord.update({
                        where: { id: String(record['id']) },
                        data: {
                            callId,
                            twilioCallSid: providerSlug === 'twilio' || providerSlug === 'signalwire' ? callId : null,
                            status: 'in-progress',
                            transcript: JSON.stringify(transcript),
                            updatedAt: new Date(),
                        },
                    }).catch(() => undefined);
                }
            }

            reply.header('Content-Type', telephonyProvider.responseContentType);
            return reply.send(responseBody);
        },
    );

    // ── Turn: classify speech, generate next agent utterance ─────────────
    app.post<{ Params: TurnParams; Body: Record<string, string>; Querystring: { s?: string; p?: string } }>(
        '/v1/sales/calls/turn/:tenantId/:botId/:prospectId/:turn',
        async (request, reply) => {
            const { tenantId, botId, prospectId, turn } = request.params;
            const turnNumber = parseInt(turn, 10) || 1;
            const providerSlug = request.query?.['p'] ?? 'twilio';
            const telephonyProvider = getProviderForWebhook(providerSlug);
            const encodedScript = request.query?.['s'] ?? '';

            const body = (request.body ?? {}) as Record<string, string | undefined>;
            const speechResult = telephonyProvider.extractSpeechInput(body);
            const callId = telephonyProvider.extractCallId(body);

            // Load script context either from URL or DB
            let ctx = decodeScriptPayload(encodedScript);
            if (!ctx && callId) {
                const prisma = await resolvePrisma();
                const db = prisma as unknown as PrismaWithCalls;
                await db.callRecord.findFirst({
                    where: { callId, tenantId },
                }).catch(() => null);
                // We don't have script context from DB; use empty defaults
                ctx = {
                    script: { fullScript: '' },
                    prospectName: 'there',
                    company: '',
                    productDescription: '',
                    icp: '',
                };
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
            if (callId) {
                const prisma = await resolvePrisma();
                const db = prisma as unknown as PrismaWithCalls;
                const record = await db.callRecord.findFirst({
                    where: { callId, tenantId },
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
            const s = encodedScript ? `&s=${encodedScript}` : '';
            const nextTurnUrl = `${request.protocol}://${request.hostname}/v1/sales/calls/turn/${tenantId}/${botId}/${prospectId}/${nextTurn}?p=${providerSlug}${s}`;

            const responseBody = telephonyProvider.buildTurnResponse(agentText, nextTurnUrl, forceHangUp);

            reply.header('Content-Type', telephonyProvider.responseContentType);
            return reply.send(responseBody);
        },
    );

    // ── Status callback: update CallRecord on completion ─────────────────
    app.post<{ Params: StatusParams; Body: Record<string, string>; Querystring: { p?: string } }>(
        '/v1/sales/calls/status/:tenantId/:botId/:prospectId',
        async (request, reply) => {
            const { tenantId, botId, prospectId } = request.params;
            const providerSlug = request.query?.['p'] ?? 'twilio';
            const telephonyProvider = getProviderForWebhook(providerSlug);

            const body = (request.body ?? {}) as Record<string, string | undefined>;
            const callId = telephonyProvider.extractCallId(body);
            // Status field varies by provider
            const rawStatus = body['CallStatus']   // Twilio / SignalWire / Plivo
                ?? body['status']                  // Vonage
                ?? '';
            const durationRaw = body['CallDuration']  // Twilio / SignalWire
                ?? body['Duration']                    // Plivo
                ?? '';
            const durationSeconds = durationRaw ? parseInt(durationRaw, 10) : undefined;

            if (callId) {
                const prisma = await resolvePrisma();
                const db = prisma as unknown as PrismaWithCalls;

                const record = await db.callRecord.findFirst({
                    where: { callId, tenantId },
                }).catch(() => null);

                if (record) {
                    const finalStatus = telephonyProvider.mapCallStatus(rawStatus);
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

function safeParseJson<T>(raw: string, fallback: T): T {
    try { return JSON.parse(raw) as T; } catch { return fallback; }
}
