/**
 * twilio-call-provider.ts
 *
 * Twilio telephony provider — TwiML XML, Basic auth (accountSid:authToken).
 * Implements TelephonyProvider interface.
 *
 * Stand-alone exported functions (buildAnswerTwiml / buildTurnTwiml / escapeXml)
 * are kept for backward-compatibility with existing code that imports them directly.
 */

import type { TelephonyProvider, CallInitOptions, CallInitResult } from './telephony-provider.js';

export interface TwilioCredentials {
    accountSid: string;
    authToken: string;
}

// ---------------------------------------------------------------------------
// TwilioProvider — implements TelephonyProvider interface
// ---------------------------------------------------------------------------

export class TwilioProvider implements TelephonyProvider {
    readonly responseContentType = 'application/xml' as const;

    constructor(private readonly creds: TwilioCredentials) {}

    async initiateCall(options: CallInitOptions): Promise<CallInitResult> {
        const { accountSid, authToken } = this.creds;
        const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
        const params = new URLSearchParams({
            From: options.fromNumber,
            To: options.toNumber,
            Url: options.answerWebhookUrl,
            Method: 'POST',
            StatusCallback: options.statusCallbackUrl,
            StatusCallbackMethod: 'POST',
        });

        const res = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            },
        );

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            return { callId: '', error: `Twilio error ${res.status}: ${errText.slice(0, 200)}` };
        }

        const data = await res.json() as { sid: string; status: string };
        return { callId: data.sid };
    }

    buildAnswerResponse(openingScript: string, nextTurnUrl: string): string {
        return buildAnswerTwiml(openingScript, nextTurnUrl);
    }

    buildTurnResponse(agentText: string, nextTurnUrl: string, shouldHangUp: boolean): string {
        return buildTurnTwiml(agentText, nextTurnUrl, shouldHangUp);
    }

    extractSpeechInput(body: Record<string, string | undefined>): string {
        return body['SpeechResult'] ?? '';
    }

    extractCallId(body: Record<string, string | undefined>): string {
        return body['CallSid'] ?? '';
    }

    mapCallStatus(rawStatus: string): string {
        return mapTwilioStatus(rawStatus);
    }
}

// ---------------------------------------------------------------------------
// Stand-alone helpers (kept for backward-compat; also used by TwilioProvider)
// ---------------------------------------------------------------------------

export async function initiateCall(options: {
    accountSid: string;
    authToken: string;
    fromNumber: string;
    toNumber: string;
    answerWebhookUrl: string;
    statusCallbackUrl: string;
}): Promise<{ callSid: string; status: string; error?: string }> {
    const provider = new TwilioProvider({ accountSid: options.accountSid, authToken: options.authToken });
    const result = await provider.initiateCall({
        fromNumber: options.fromNumber,
        toNumber: options.toNumber,
        answerWebhookUrl: options.answerWebhookUrl,
        statusCallbackUrl: options.statusCallbackUrl,
    });
    return { callSid: result.callId, status: result.callId ? 'queued' : 'failed', error: result.error };
}

export function buildAnswerTwiml(script: string, nextTurnUrl: string): string {
    const safe = escapeXml(script);
    const safeUrl = escapeXml(nextTurnUrl);
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Response>',
        `  <Gather input="speech" action="${safeUrl}" method="POST" speechTimeout="3" timeout="10">`,
        `    <Say voice="Polly.Joanna">${safe}</Say>`,
        '  </Gather>',
        '  <Say voice="Polly.Joanna">I\'ll follow up by email. Thanks for your time!</Say>',
        '  <Hangup/>',
        '</Response>',
    ].join('\n');
}

export function buildTurnTwiml(agentText: string, nextTurnUrl: string, shouldHangUp: boolean): string {
    const safe = escapeXml(agentText);
    if (shouldHangUp) {
        return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<Response>',
            `  <Say voice="Polly.Joanna">${safe}</Say>`,
            '  <Hangup/>',
            '</Response>',
        ].join('\n');
    }
    const safeUrl = escapeXml(nextTurnUrl);
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Response>',
        `  <Gather input="speech" action="${safeUrl}" method="POST" speechTimeout="3" timeout="10">`,
        `    <Say voice="Polly.Joanna">${safe}</Say>`,
        '  </Gather>',
        '  <Say voice="Polly.Joanna">Thanks for your time. I\'ll send more information by email!</Say>',
        '  <Hangup/>',
        '</Response>',
    ].join('\n');
}

export function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

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
