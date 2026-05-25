/**
 * telephony-provider.ts
 *
 * Abstract telephony provider interface — implemented by:
 *   TwilioProvider    (twilio-call-provider.ts)
 *   SignalWireProvider (signalwire-call-provider.ts)
 *   PlivoProvider     (plivo-call-provider.ts)
 *   VonageProvider    (vonage-call-provider.ts)
 *
 * Every provider must be able to:
 *   1. Initiate an outbound call via its REST API
 *   2. Build the response body for the "answer" webhook (opening utterance)
 *   3. Build the response body for each "turn" webhook (agent reply)
 *   4. Extract the prospect's speech text from an inbound webhook body
 *   5. Extract the provider-native call ID from an inbound webhook body
 *   6. Map a raw call-status string to our canonical status
 */

export interface CallInitOptions {
    fromNumber: string;
    toNumber: string;
    answerWebhookUrl: string;
    statusCallbackUrl: string;
}

export interface CallInitResult {
    /** Provider-native call ID (CallSid / CallUUID / uuid). Empty string on failure. */
    callId: string;
    error?: string;
}

export interface TelephonyProvider {
    /** REST: start an outbound call. Returns provider call ID or error. */
    initiateCall(options: CallInitOptions): Promise<CallInitResult>;

    /**
     * Build the response body (TwiML XML or NCCO JSON) served when the prospect picks up.
     * @param openingScript  What the agent says first.
     * @param nextTurnUrl    Where the provider should POST the prospect's speech.
     */
    buildAnswerResponse(openingScript: string, nextTurnUrl: string): string;

    /**
     * Build the response body for an in-progress conversation turn.
     * @param agentText     What the agent says next.
     * @param nextTurnUrl   Where the provider should POST the prospect's next utterance.
     * @param shouldHangUp  If true, hang up after speaking.
     */
    buildTurnResponse(agentText: string, nextTurnUrl: string, shouldHangUp: boolean): string;

    /**
     * Content-Type header to set on the response (application/xml or application/json).
     */
    responseContentType: 'application/xml' | 'application/json';

    /**
     * Extract the prospect's spoken text from the provider's webhook POST body.
     * Returns empty string if not present.
     */
    extractSpeechInput(body: Record<string, string | undefined>): string;

    /**
     * Extract the provider-native call ID from the provider's webhook POST body.
     * Returns empty string if not present.
     */
    extractCallId(body: Record<string, string | undefined>): string;

    /**
     * Map the raw call-status value from the provider's status-callback webhook
     * to our canonical status (completed | no-answer | voicemail | failed).
     */
    mapCallStatus(rawStatus: string): string;
}
