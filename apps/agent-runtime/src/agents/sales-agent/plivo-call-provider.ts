/**
 * plivo-call-provider.ts
 *
 * Plivo telephony provider.
 *
 * Differences from Twilio:
 *   - XML uses <GetInput> (not <Gather>), with <Speak> inside (not <Say>)
 *   - Call ID is CallUUID (not CallSid)
 *   - Speech input field is SpeechResult (same as Twilio — convenient)
 *   - Status values: "completed" | "busy" | "no-answer" | "failed"
 *   - Auth: Basic authId:authToken
 *   - API base: https://api.plivo.com/v1/Account/<authId>/Call/
 */

import type { TelephonyProvider, CallInitOptions, CallInitResult } from './telephony-provider.js';

export interface PlivoCredentials {
    authId: string;
    authToken: string;
    fromNumber: string;
}

function escapeXml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export class PlivoProvider implements TelephonyProvider {
    readonly responseContentType = 'application/xml' as const;

    constructor(private readonly creds: PlivoCredentials) {}

    async initiateCall(options: CallInitOptions): Promise<CallInitResult> {
        const { authId, authToken } = this.creds;
        const auth = Buffer.from(`${authId}:${authToken}`).toString('base64');

        const res = await fetch(
            `https://api.plivo.com/v1/Account/${authId}/Call/`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Basic ${auth}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    from: options.fromNumber,
                    to: options.toNumber,
                    answer_url: options.answerWebhookUrl,
                    answer_method: 'POST',
                    hangup_url: options.statusCallbackUrl,
                    hangup_method: 'POST',
                }),
            },
        );

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            return { callId: '', error: `Plivo error ${res.status}: ${errText.slice(0, 200)}` };
        }

        const data = await res.json() as { request_uuid: string; message: string };
        // Plivo returns request_uuid at initiation; actual CallUUID comes in webhook body
        return { callId: data.request_uuid ?? '' };
    }

    buildAnswerResponse(openingScript: string, nextTurnUrl: string): string {
        const safe = escapeXml(openingScript);
        const safeUrl = escapeXml(nextTurnUrl);
        return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<Response>',
            `  <GetInput action="${safeUrl}" method="POST" inputType="speech" speechEndTimeout="3" speechModel="default">`,
            `    <Speak>${safe}</Speak>`,
            '  </GetInput>',
            "  <Speak>I'll follow up by email. Thanks for your time!</Speak>",
            '  <Hangup/>',
            '</Response>',
        ].join('\n');
    }

    buildTurnResponse(agentText: string, nextTurnUrl: string, shouldHangUp: boolean): string {
        const safe = escapeXml(agentText);
        if (shouldHangUp) {
            return [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<Response>',
                `  <Speak>${safe}</Speak>`,
                '  <Hangup/>',
                '</Response>',
            ].join('\n');
        }
        const safeUrl = escapeXml(nextTurnUrl);
        return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<Response>',
            `  <GetInput action="${safeUrl}" method="POST" inputType="speech" speechEndTimeout="3" speechModel="default">`,
            `    <Speak>${safe}</Speak>`,
            '  </GetInput>',
            "  <Speak>Thanks for your time. I'll send more information by email!</Speak>",
            '  <Hangup/>',
            '</Response>',
        ].join('\n');
    }

    extractSpeechInput(body: Record<string, string | undefined>): string {
        return body['SpeechResult'] ?? '';
    }

    extractCallId(body: Record<string, string | undefined>): string {
        return body['CallUUID'] ?? '';
    }

    mapCallStatus(rawStatus: string): string {
        switch (rawStatus.toLowerCase()) {
            case 'completed': return 'completed';
            case 'no-answer': return 'no-answer';
            case 'busy': return 'no-answer';
            case 'failed': return 'failed';
            default: return rawStatus || 'unknown';
        }
    }
}
