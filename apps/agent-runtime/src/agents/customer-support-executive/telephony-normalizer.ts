/**
 * Telephony Normalizer
 *
 * Abstracts over provider-specific webhook formats so the CSE voice pipeline
 * always works with a single InboundCallEvent regardless of which telephony
 * provider the customer chose in the dashboard.
 *
 * Supported formats:
 *   twilio          — TwiML / Twilio REST API (Basic Auth: AccountSid:AuthToken)
 *   vonage          — NCCO / Vonage Voice API (JWT auth)
 *   amazon_connect  — Amazon Connect Contact Events (AWS SigV4)
 *   generic         — Plain JSON (customer-defined schema)
 *
 * Inbound flow:
 *   1. Telephony provider POSTs a webhook to AgentFarm trigger-service
 *   2. normalizeInboundWebhook() converts it to InboundCallEvent
 *   3. InboundCallEvent is passed to handleVoiceCall() in voice-call-handler.ts
 *
 * Outbound flow:
 *   1. handleVoiceCall() produces a text reply (and optional audio)
 *   2. buildWebhookResponse() converts that to the provider-native format
 *   3. The response is returned as the HTTP body to the provider's webhook POST
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TelephonyProviderFormat = 'twilio' | 'vonage' | 'amazon_connect' | 'generic';

/** Normalized representation of an inbound call event */
export interface InboundCallEvent {
    callId: string;           // provider-native call/session ID
    from: string;             // caller phone number (E.164)
    to: string;               // called number (E.164)
    status: string;           // e.g. 'ringing', 'in-progress', 'completed'
    recordingUrl?: string;    // URL to download call recording (if available)
    transcriptText?: string;  // pre-existing transcript (Vonage ASR, Amazon Transcribe, etc.)
    direction: 'inbound' | 'outbound';
    durationSeconds?: number;
    providerFormat: TelephonyProviderFormat;
    rawPayload: Record<string, unknown>; // original webhook body
}

/** What to send back to the telephony provider after processing */
export interface TelephonyWebhookResponse {
    contentType: string; // 'application/xml' | 'application/json'
    body: string;        // TwiML XML, NCCO JSON array, or generic JSON string
}

/** Connector config as stored in TenantConnector.configValues */
export interface TelephonyConnectorConfig {
    baseUrl?: string;
    providerFormat: TelephonyProviderFormat;
    authType: 'basic' | 'bearer' | 'api_key' | 'hmac';
    authValue: string;
    authHeaderName?: string;
    webhookSecret?: string;
    inboundRecordingPath?: string;
    outboundCallPath?: string;
    hangupPath?: string;
    fromNumber?: string;
    // First-class connector fields
    accountSid?: string;    // Twilio
    authToken?: string;     // Twilio
    apiKey?: string;        // Vonage
    apiSecret?: string;     // Vonage
    applicationId?: string; // Vonage
    instanceId?: string;    // Amazon Connect
    region?: string;        // Amazon Connect / Genesys
}

// ---------------------------------------------------------------------------
// Inbound webhook normalizers
// ---------------------------------------------------------------------------

function normalizeTwilio(payload: Record<string, unknown>): InboundCallEvent {
    return {
        callId: String(payload['CallSid'] ?? payload['callSid'] ?? ''),
        from: String(payload['From'] ?? payload['Caller'] ?? ''),
        to: String(payload['To'] ?? payload['Called'] ?? ''),
        status: String(payload['CallStatus'] ?? 'in-progress'),
        recordingUrl: typeof payload['RecordingUrl'] === 'string' ? payload['RecordingUrl'] : undefined,
        transcriptText: typeof payload['TranscriptionText'] === 'string' ? payload['TranscriptionText'] : undefined,
        direction: payload['Direction'] === 'outbound-api' ? 'outbound' : 'inbound',
        durationSeconds: payload['CallDuration'] ? Number(payload['CallDuration']) : undefined,
        providerFormat: 'twilio',
        rawPayload: payload,
    };
}

function normalizeVonage(payload: Record<string, unknown>): InboundCallEvent {
    return {
        callId: String(payload['uuid'] ?? payload['conversation_uuid'] ?? ''),
        from: String(payload['from'] ?? ''),
        to: String(payload['to'] ?? ''),
        status: String(payload['status'] ?? 'started'),
        recordingUrl: typeof payload['recording_url'] === 'string' ? payload['recording_url'] : undefined,
        transcriptText: typeof payload['speech'] === 'object' && payload['speech'] !== null
            ? (() => {
                const results = (payload['speech'] as Record<string, unknown>)['results'];
                return Array.isArray(results) && results.length > 0 ? String(results[0] ?? '') : undefined;
            })()
            : undefined,
        direction: payload['direction'] === 'outbound' ? 'outbound' : 'inbound',
        durationSeconds: payload['duration'] ? Number(payload['duration']) : undefined,
        providerFormat: 'vonage',
        rawPayload: payload,
    };
}

function normalizeAmazonConnect(payload: Record<string, unknown>): InboundCallEvent {
    const details = (payload['Details'] as Record<string, unknown> | undefined) ?? payload;
    const contactData = (details['ContactData'] as Record<string, unknown> | undefined) ?? details;
    return {
        callId: String(contactData['ContactId'] ?? payload['contactId'] ?? ''),
        from: String(contactData['CustomerEndpoint']
            ? (contactData['CustomerEndpoint'] as Record<string, unknown>)['Address'] ?? ''
            : payload['from'] ?? ''),
        to: String(contactData['SystemEndpoint']
            ? (contactData['SystemEndpoint'] as Record<string, unknown>)['Address'] ?? ''
            : payload['to'] ?? ''),
        status: String(contactData['InitiationMethod'] ?? 'INBOUND'),
        recordingUrl: typeof payload['recordingUrl'] === 'string' ? payload['recordingUrl'] : undefined,
        direction: 'inbound',
        providerFormat: 'amazon_connect',
        rawPayload: payload,
    };
}

function normalizeGeneric(payload: Record<string, unknown>): InboundCallEvent {
    return {
        callId: String(payload['callId'] ?? payload['call_id'] ?? payload['id'] ?? `call-${Date.now()}`),
        from: String(payload['from'] ?? payload['caller'] ?? payload['callerNumber'] ?? ''),
        to: String(payload['to'] ?? payload['called'] ?? payload['calledNumber'] ?? ''),
        status: String(payload['status'] ?? payload['callStatus'] ?? 'active'),
        recordingUrl: typeof payload['recordingUrl'] === 'string' ? payload['recordingUrl']
            : typeof payload['recording_url'] === 'string' ? payload['recording_url'] : undefined,
        transcriptText: typeof payload['transcript'] === 'string' ? payload['transcript'] : undefined,
        direction: String(payload['direction'] ?? 'inbound') === 'outbound' ? 'outbound' : 'inbound',
        durationSeconds: payload['duration'] ? Number(payload['duration']) : undefined,
        providerFormat: 'generic',
        rawPayload: payload,
    };
}

export function normalizeInboundWebhook(
    payload: Record<string, unknown>,
    format: TelephonyProviderFormat,
): InboundCallEvent {
    switch (format) {
        case 'twilio': return normalizeTwilio(payload);
        case 'vonage': return normalizeVonage(payload);
        case 'amazon_connect': return normalizeAmazonConnect(payload);
        case 'generic': return normalizeGeneric(payload);
    }
}

// ---------------------------------------------------------------------------
// Outbound response builders
// ---------------------------------------------------------------------------

function buildTwimlResponse(replyText: string): TelephonyWebhookResponse {
    const escaped = replyText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    return {
        contentType: 'application/xml',
        body: `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escaped}</Say></Response>`,
    };
}

function buildNccoResponse(replyText: string): TelephonyWebhookResponse {
    return {
        contentType: 'application/json',
        body: JSON.stringify([{ action: 'talk', text: replyText, language: 'en-IN', style: 0 }]),
    };
}

function buildGenericResponse(replyText: string, replyAudioRef?: string | null): TelephonyWebhookResponse {
    return {
        contentType: 'application/json',
        body: JSON.stringify({
            action: 'say',
            text: replyText,
            ...(replyAudioRef ? { audioRef: replyAudioRef } : {}),
        }),
    };
}

export function buildWebhookResponse(
    format: TelephonyProviderFormat,
    replyText: string,
    replyAudioRef?: string | null,
): TelephonyWebhookResponse {
    switch (format) {
        case 'twilio': return buildTwimlResponse(replyText);
        case 'vonage': return buildNccoResponse(replyText);
        case 'amazon_connect': return buildGenericResponse(replyText, replyAudioRef);
        case 'generic': return buildGenericResponse(replyText, replyAudioRef);
    }
}

// ---------------------------------------------------------------------------
// Auth header builder — used for outbound REST calls to the telephony API
// ---------------------------------------------------------------------------

export function buildAuthHeaders(config: TelephonyConnectorConfig): Record<string, string> {
    switch (config.authType) {
        case 'basic': {
            const creds = config.accountSid && config.authToken
                ? `${config.accountSid}:${config.authToken}`
                : config.authValue;
            return { Authorization: `Basic ${Buffer.from(creds).toString('base64')}` };
        }
        case 'bearer':
            return { Authorization: `Bearer ${config.authValue}` };
        case 'api_key': {
            const headerName = config.authHeaderName ?? 'X-API-Key';
            return { [headerName]: config.authValue };
        }
        case 'hmac':
            return { 'X-Signature': config.authValue };
    }
}

// ---------------------------------------------------------------------------
// Recording URL resolver — fetches audio bytes from the provider
// ---------------------------------------------------------------------------

export async function fetchRecordingBytes(
    callId: string,
    config: TelephonyConnectorConfig,
    recordingUrlOverride?: string,
): Promise<ArrayBuffer | null> {
    let url = recordingUrlOverride;

    if (!url && config.inboundRecordingPath && config.baseUrl) {
        url = `${config.baseUrl}${config.inboundRecordingPath.replace('{callId}', encodeURIComponent(callId))}`;
    }

    if (!url) return null;

    try {
        const headers: Record<string, string> = {
            Accept: 'audio/wav, audio/mpeg, audio/mp4, */*',
            ...buildAuthHeaders(config),
        };
        const res = await fetch(url, { headers });
        if (!res.ok) return null;
        return res.arrayBuffer();
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Outbound call initiation
// ---------------------------------------------------------------------------

export interface OutboundCallParams {
    to: string;
    from?: string;
    callbackUrl?: string;
    config: TelephonyConnectorConfig;
}

export interface OutboundCallResult {
    callId: string;
    status: string;
    providerFormat: TelephonyProviderFormat;
}

export async function initiateOutboundCall(params: OutboundCallParams): Promise<OutboundCallResult> {
    const { to, config } = params;
    const from = params.from ?? config.fromNumber;
    const format = config.providerFormat;

    if (!config.baseUrl && format !== 'twilio' && format !== 'vonage') {
        throw new Error('baseUrl is required for outbound calls on generic_telephony connector.');
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(config),
    };

    let url: string;
    let body: Record<string, unknown>;

    switch (format) {
        case 'twilio': {
            const accountSid = config.accountSid ?? config.authValue.split(':')[0];
            url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
            body = { To: to, From: from, Url: params.callbackUrl ?? '' };
            // Twilio uses form-encoded, not JSON
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
            const res = await fetch(url, {
                method: 'POST',
                headers,
                body: new URLSearchParams(body as Record<string, string>).toString(),
            });
            if (!res.ok) throw new Error(`Twilio initiate_call failed: ${res.status}`);
            const data = (await res.json()) as { sid?: string; status?: string };
            return { callId: data.sid ?? '', status: data.status ?? 'queued', providerFormat: 'twilio' };
        }
        case 'vonage': {
            url = 'https://api.nexmo.com/v1/calls';
            body = {
                to: [{ type: 'phone', number: to.replace('+', '') }],
                from: { type: 'phone', number: (from ?? '').replace('+', '') },
                ...(params.callbackUrl ? { answer_url: [params.callbackUrl] } : {}),
            };
            break;
        }
        default: {
            const path = config.outboundCallPath ?? '/calls';
            url = `${config.baseUrl}${path}`;
            body = { to, from, callbackUrl: params.callbackUrl };
        }
    }

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${format} initiate_call failed: ${res.status}`);
    const data = (await res.json()) as Record<string, unknown>;
    return {
        callId: String(data['uuid'] ?? data['callId'] ?? data['call_id'] ?? data['id'] ?? ''),
        status: String(data['status'] ?? 'started'),
        providerFormat: format,
    };
}
