/**
 * signalwire-call-provider.ts
 *
 * SignalWire telephony provider.
 * SignalWire is a drop-in Twilio clone: same TwiML XML, same Basic auth format,
 * same webhook body field names (SpeechResult, CallSid) — only the base URL differs.
 *
 * Auth:  Basic projectId:apiToken
 * URL:   https://<spaceUrl>/api/laml/2010-04-01/Accounts/<projectId>/Calls.json
 */

import type { TelephonyProvider, CallInitOptions, CallInitResult } from './telephony-provider.js';
import { buildAnswerTwiml, buildTurnTwiml, escapeXml } from './twilio-call-provider.js';

export interface SignalWireCredentials {
    projectId: string;
    apiToken: string;
    spaceUrl: string;   // e.g. "yourspace.signalwire.com"
}

export class SignalWireProvider implements TelephonyProvider {
    readonly responseContentType = 'application/xml' as const;

    constructor(private readonly creds: SignalWireCredentials) {}

    async initiateCall(options: CallInitOptions): Promise<CallInitResult> {
        const { projectId, apiToken, spaceUrl } = this.creds;
        const space = spaceUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
        const auth = Buffer.from(`${projectId}:${apiToken}`).toString('base64');
        const params = new URLSearchParams({
            From: options.fromNumber,
            To: options.toNumber,
            Url: options.answerWebhookUrl,
            Method: 'POST',
            StatusCallback: options.statusCallbackUrl,
            StatusCallbackMethod: 'POST',
        });

        const res = await fetch(
            `https://${space}/api/laml/2010-04-01/Accounts/${projectId}/Calls.json`,
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
            return { callId: '', error: `SignalWire error ${res.status}: ${errText.slice(0, 200)}` };
        }

        const data = await res.json() as { sid: string; status: string };
        return { callId: data.sid };
    }

    buildAnswerResponse(openingScript: string, nextTurnUrl: string): string {
        // Identical TwiML — SignalWire supports Polly voices via AWS Polly integration
        return buildAnswerTwiml(openingScript, nextTurnUrl);
    }

    buildTurnResponse(agentText: string, nextTurnUrl: string, shouldHangUp: boolean): string {
        return buildTurnTwiml(agentText, nextTurnUrl, shouldHangUp);
    }

    extractSpeechInput(body: Record<string, string | undefined>): string {
        return body['SpeechResult'] ?? '';
    }

    extractCallId(body: Record<string, string | undefined>): string {
        // SignalWire uses CallSid identical to Twilio
        return body['CallSid'] ?? '';
    }

    mapCallStatus(rawStatus: string): string {
        switch (rawStatus.toLowerCase()) {
            case 'completed': return 'completed';
            case 'no-answer': return 'no-answer';
            case 'busy': return 'no-answer';
            case 'failed': return 'failed';
            case 'canceled': return 'failed';
            default: return rawStatus || 'unknown';
        }
    }
}

// Re-export for consumers that import directly
export { buildAnswerTwiml as buildAnswerSignalWireTwiml, buildTurnTwiml as buildTurnSignalWireTwiml, escapeXml };
