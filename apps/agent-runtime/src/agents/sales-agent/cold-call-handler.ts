/**
 * cold-call-handler.ts
 *
 * Handles workspace_cold_call: initiates an AI-driven outbound phone call via Twilio.
 *
 * Flow:
 *   1. Load prospect + validate telephony config
 *   2. Generate call script via LLM (call-script-generator.ts)
 *   3. Encode script in base64url and embed in Twilio answer webhook URL
 *   4. Initiate call via Twilio REST API (twilio-call-provider.ts)
 *   5. Persist CallRecord + SalesActivity, update prospect status
 *
 * The actual multi-turn conversation is driven by the Twilio webhook route
 * (api-gateway/src/routes/sales/twilio-webhook.ts) — not this file.
 *
 * NOTE: Requires a `callRecord` Prisma model. Run `prisma migrate` after adding:
 *   model callRecord { id String @id @default(cuid()) ... }
 * DB writes are wrapped in try/catch and are non-fatal if the model doesn't exist yet.
 */

import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import { generateCallScript } from './call-script-generator.js';
import { initiateCall } from './twilio-call-provider.js';

type PrismaWithCall = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    callRecord: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

export interface ColdCallParams {
    prospectId: string;
    tenantId: string;
    botId: string;
    config: SalesAgentConfigRecord;
    phoneNumberOverride?: string;
}

export interface ColdCallResult {
    ok: boolean;
    initiated: boolean;
    callSid?: string;
    callRecordId?: string;
    error?: string;
}

export async function initiateColdCall(
    params: ColdCallParams,
    prisma?: PrismaClient,
): Promise<ColdCallResult> {
    const { prospectId, tenantId, botId, config, phoneNumberOverride } = params;

    if (config.telephonyProvider !== 'twilio') {
        return { ok: false, initiated: false, error: 'telephonyProvider must be "twilio" in SalesAgentConfig' };
    }

    const accountSid = config.twilioAccountSid;
    const authToken = config.twilioAuthToken;
    const fromNumber = config.twilioFromNumber;
    const webhookBase = config.callWebhookBaseUrl?.replace(/\/+$/, '');

    if (!accountSid || !authToken || !fromNumber || !webhookBase) {
        return {
            ok: false,
            initiated: false,
            error: 'Missing Twilio config: twilioAccountSid, twilioAuthToken, twilioFromNumber, callWebhookBaseUrl are all required',
        };
    }

    const db = prisma ? (prisma as unknown as PrismaWithCall) : null;

    const prospect = db ? await db.prospect.findUnique({ where: { id: prospectId } }) : null;
    if (!prospect) return { ok: false, initiated: false, error: 'Prospect not found' };
    if (String(prospect['tenantId'] ?? '') !== tenantId) {
        return { ok: false, initiated: false, error: 'Tenant isolation violation' };
    }

    const toNumber = phoneNumberOverride ?? (prospect['phone'] ? String(prospect['phone']) : '');
    if (!toNumber) {
        return {
            ok: false,
            initiated: false,
            error: 'Prospect has no phone number. Pass payload.phone_number or add phone to the prospect record.',
        };
    }

    const prospectName = `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim();
    const company = String(prospect['company'] ?? '');
    const title = prospect['title'] ? String(prospect['title']) : undefined;

    const script = await generateCallScript({
        prospectName,
        company,
        title,
        productDescription: config.productDescription,
        icp: config.icp,
    });

    // Encode script + context in URL-safe base64 so the answer webhook can serve TwiML
    // without a DB lookup (reducing latency on call answer)
    const scriptPayload = { script, prospectName, company, productDescription: config.productDescription, icp: config.icp };
    const encodedScript = Buffer.from(JSON.stringify(scriptPayload)).toString('base64url');

    const answerUrl = `${webhookBase}/v1/sales/calls/answer/${tenantId}/${botId}/${prospectId}?s=${encodedScript}`;
    const statusUrl = `${webhookBase}/v1/sales/calls/status/${tenantId}/${botId}/${prospectId}`;

    const callResult = await initiateCall({
        accountSid,
        authToken,
        fromNumber,
        toNumber,
        answerWebhookUrl: answerUrl,
        statusCallbackUrl: statusUrl,
    });

    if (!callResult.callSid) {
        return { ok: false, initiated: false, error: callResult.error };
    }

    let callRecordId: string | undefined;

    if (db) {
        // Persist CallRecord (non-fatal if model not yet migrated)
        await db.callRecord.create({
            data: {
                tenantId,
                botId,
                prospectId,
                twilioCallSid: callResult.callSid,
                status: 'initiated',
                toNumber,
                fromNumber,
                transcript: JSON.stringify([]),
                initiatedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        }).then(r => { callRecordId = r.id; }).catch(() => undefined);

        await db.prospect.update({
            where: { id: prospectId },
            data: { status: 'call_attempted', lastContactedAt: new Date(), updatedAt: new Date() },
        }).catch(() => undefined);

        await db.salesActivity.create({
            data: {
                tenantId,
                botId,
                prospectId,
                activityType: 'call',
                subject: `Cold call initiated — ${prospectName} at ${company}`,
                body: script.fullScript,
                outcome: 'initiated',
                completedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        }).catch(() => undefined);
    }

    return { ok: true, initiated: true, callSid: callResult.callSid, callRecordId };
}
