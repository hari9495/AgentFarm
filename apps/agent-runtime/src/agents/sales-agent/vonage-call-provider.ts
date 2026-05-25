/**
 * vonage-call-provider.ts
 *
 * Vonage (Nexmo) Voice API telephony provider.
 *
 * Key differences from Twilio:
 *   - Response format is NCCO JSON (not XML)
 *   - Auth: RS256 JWT generated from a private key (not Basic auth)
 *   - Call ID field in webhook body: "uuid" (not CallSid / CallUUID)
 *   - Speech input arrives at the action URL in body.speech.results[0].text
 *   - Status values: "completed" | "busy" | "timeout" | "failed" | "cancelled" | "unanswered"
 *   - Status-callback field: "status" in the JSON body
 *
 * JWT generation uses node:crypto's createSign with RS256 — no external deps.
 */

import { createSign } from 'node:crypto';
import type { TelephonyProvider, CallInitOptions, CallInitResult } from './telephony-provider.js';

export interface VonageCredentials {
    apiKey: string;
    apiSecret: string;
    applicationId: string;
    /** PEM-encoded RSA private key string */
    privateKey: string;
    fromNumber: string;
}

// ---------------------------------------------------------------------------
// JWT helper (RS256, no external library)
// ---------------------------------------------------------------------------

function buildVonageJwt(applicationId: string, privateKey: string): string {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({
        application_id: applicationId,
        iat: now,
        exp: now + 600, // 10-minute token
        jti: `${now}-${Math.random().toString(36).slice(2)}`,
    })).toString('base64url');

    const data = `${header}.${payload}`;
    const signer = createSign('RSA-SHA256');
    signer.update(data);
    const signature = signer.sign(privateKey, 'base64url');
    return `${data}.${signature}`;
}

// ---------------------------------------------------------------------------
// VonageProvider — implements TelephonyProvider interface
// ---------------------------------------------------------------------------

export class VonageProvider implements TelephonyProvider {
    readonly responseContentType = 'application/json' as const;

    constructor(private readonly creds: VonageCredentials) {}

    private getJwt(): string {
        return buildVonageJwt(this.creds.applicationId, this.creds.privateKey);
    }

    async initiateCall(options: CallInitOptions): Promise<CallInitResult> {
        const jwt = this.getJwt();

        const res = await fetch('https://api.nexmo.com/v1/calls', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${jwt}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to: [{ type: 'phone', number: options.toNumber.replace(/^\+/, '') }],
                from: { type: 'phone', number: this.creds.fromNumber.replace(/^\+/, '') },
                answer_url: [options.answerWebhookUrl],
                answer_method: 'GET',
                event_url: [options.statusCallbackUrl],
                event_method: 'POST',
            }),
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            return { callId: '', error: `Vonage error ${res.status}: ${errText.slice(0, 200)}` };
        }

        const data = await res.json() as { uuid: string; status: string };
        return { callId: data.uuid ?? '' };
    }

    buildAnswerResponse(openingScript: string, nextTurnUrl: string): string {
        // Vonage NCCO: talk → input (speech) → POST to nextTurnUrl
        return JSON.stringify([
            {
                action: 'talk',
                text: openingScript,
                voiceName: 'Amy',
                bargeIn: true,
            },
            {
                action: 'input',
                type: ['speech'],
                eventUrl: [nextTurnUrl],
                eventMethod: 'POST',
                speech: {
                    endOnSilence: 3,
                    language: 'en-US',
                },
            },
            {
                action: 'talk',
                text: "I'll follow up by email. Thanks for your time!",
                voiceName: 'Amy',
            },
        ]);
    }

    buildTurnResponse(agentText: string, nextTurnUrl: string, shouldHangUp: boolean): string {
        if (shouldHangUp) {
            return JSON.stringify([
                {
                    action: 'talk',
                    text: agentText,
                    voiceName: 'Amy',
                },
            ]);
        }
        return JSON.stringify([
            {
                action: 'talk',
                text: agentText,
                voiceName: 'Amy',
                bargeIn: true,
            },
            {
                action: 'input',
                type: ['speech'],
                eventUrl: [nextTurnUrl],
                eventMethod: 'POST',
                speech: {
                    endOnSilence: 3,
                    language: 'en-US',
                },
            },
            {
                action: 'talk',
                text: "Thanks for your time. I'll send more information by email!",
                voiceName: 'Amy',
            },
        ]);
    }

    extractSpeechInput(body: Record<string, string | undefined>): string {
        // Vonage sends a JSON body; body values may already be parsed upstream.
        // The raw body field is "speech" which contains { results: [{ text, confidence }] }
        // We rely on the webhook handler to pass the parsed text here.
        // Convention: webhook passes body['speech_text'] (pre-extracted) or body['speech']
        try {
            const speechRaw = body['speech'];
            if (speechRaw) {
                const parsed = JSON.parse(speechRaw) as { results?: Array<{ text: string }> };
                return parsed?.results?.[0]?.text ?? '';
            }
        } catch {
            // fall through
        }
        return body['speech_text'] ?? '';
    }

    extractCallId(body: Record<string, string | undefined>): string {
        return body['uuid'] ?? '';
    }

    mapCallStatus(rawStatus: string): string {
        switch (rawStatus.toLowerCase()) {
            case 'completed': return 'completed';
            case 'busy': return 'no-answer';
            case 'timeout': return 'no-answer';
            case 'unanswered': return 'no-answer';
            case 'failed': return 'failed';
            case 'cancelled':
            case 'canceled': return 'failed';
            default: return rawStatus || 'unknown';
        }
    }
}
