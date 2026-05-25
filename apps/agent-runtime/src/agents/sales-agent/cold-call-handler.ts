/**
 * cold-call-handler.ts
 *
 * Handles workspace_cold_call: initiates an AI-driven outbound phone call.
 *
 * Supported telephony providers (via telephonyProvider in SalesAgentConfig):
 *   'twilio'     — Twilio (default)
 *   'signalwire' — SignalWire (TwiML-compatible, different base URL)
 *   'plivo'      — Plivo (XML with <GetInput>)
 *   'vonage'     — Vonage/Nexmo (NCCO JSON + RS256 JWT)
 *
 * Flow:
 *   1. Load prospect + validate telephony config via provider factory
 *   2. Generate call script via LLM (call-script-generator.ts)
 *   3. Encode script in base64url and embed in answer webhook URL
 *   4. Initiate call via the resolved provider
 *   5. Persist CallRecord + SalesActivity, update prospect status
 *
 * The actual multi-turn conversation is driven by the calls webhook route
 * (api-gateway/src/routes/sales/calls-webhook.ts).
 *
 * NOTE: Requires a `CallRecord` Prisma model. Run `prisma migrate` after adding it.
 * DB writes are wrapped in try/catch and are non-fatal if the model doesn't exist yet.
 */

import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import { generateCallScript } from './call-script-generator.js';
import { getTelephonyProvider } from './telephony-provider-factory.js';

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
    callId?: string;
    /** @deprecated Use callId — kept for backward compat */
    callSid?: string;
    callRecordId?: string;
    error?: string;
}

export async function initiateColdCall(
    params: ColdCallParams,
    prisma?: PrismaClient,
): Promise<ColdCallResult> {
    const { prospectId, tenantId, botId, config, phoneNumberOverride } = params;

    const webhookBase = config.callWebhookBaseUrl?.replace(/\/+$/, '');
    if (!webhookBase) {
        return { ok: false, initiated: false, error: 'callWebhookBaseUrl is required in SalesAgentConfig' };
    }

    // Resolve provider from config — returns error if credentials are missing
    const factoryResult = getTelephonyProvider(config);
    if ('error' in factoryResult) {
        return { ok: false, initiated: false, error: factoryResult.error };
    }
    const { provider, fromNumber } = factoryResult.result;

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

    // Encode script + context in URL-safe base64 so the answer webhook can serve the
    // opening response without a DB lookup (reduces latency on call answer)
    const scriptPayload = { script, prospectName, company, productDescription: config.productDescription, icp: config.icp };
    const encodedScript = Buffer.from(JSON.stringify(scriptPayload)).toString('base64url');

    // Provider slug in webhook URL so the webhook knows which provider is calling
    const providerSlug = config.telephonyProvider ?? 'twilio';
    const answerUrl = `${webhookBase}/v1/sales/calls/answer/${tenantId}/${botId}/${prospectId}?s=${encodedScript}&p=${providerSlug}`;
    const statusUrl = `${webhookBase}/v1/sales/calls/status/${tenantId}/${botId}/${prospectId}?p=${providerSlug}`;

    const callResult = await provider.initiateCall({
        fromNumber,
        toNumber,
        answerWebhookUrl: answerUrl,
        statusCallbackUrl: statusUrl,
    });

    if (!callResult.callId) {
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
                // callId is the provider-agnostic field; twilioCallSid kept for Twilio compat
                callId: callResult.callId,
                twilioCallSid: providerSlug === 'twilio' ? callResult.callId : null,
                provider: providerSlug,
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

    return { ok: true, initiated: true, callId: callResult.callId, callSid: callResult.callId, callRecordId };
}
