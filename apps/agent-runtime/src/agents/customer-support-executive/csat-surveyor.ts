/**
 * CSAT / NPS Surveyor — sends post-interaction satisfaction surveys.
 *
 * Supports Typeform, SurveyMonkey, Zendesk CSAT, and a generic webhook.
 * Falls back to composing an email-based survey when no connector is wired.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SurveyType = 'csat' | 'nps' | 'ces';

export interface SendSurveyParams {
    tenantId: string;
    botId: string;
    surveyType: SurveyType;
    customerEmail: string;
    customerName?: string;
    ticketId?: string;
    agentName?: string;
    companyName?: string;
    language?: string;
    connector?: string;
}

export interface SurveySendResult {
    surveyId: string;
    surveyType: SurveyType;
    customerEmail: string;
    channel: 'mcp' | 'email_fallback';
    status: 'sent' | 'queued' | 'failed';
    previewSubject?: string;
    previewBody?: string;
}

// ---------------------------------------------------------------------------
// Connector resolution
// ---------------------------------------------------------------------------

function resolveSurveyUrl(connector?: string): string | null {
    const candidates = [
        connector && process.env[`MCP_${connector.toUpperCase()}_URL`],
        process.env['MCP_TYPEFORM_URL'],
        process.env['MCP_SURVEYMONKEY_URL'],
        process.env['MCP_ZENDESK_CSAT_URL'],
        process.env['MCP_SURVEY_URL'],
    ];
    for (const c of candidates) {
        if (c && c.trim()) return c.trim();
    }
    return null;
}

// ---------------------------------------------------------------------------
// Survey email templates (fallback)
// ---------------------------------------------------------------------------

const SURVEY_TEMPLATES: Record<SurveyType, (p: SendSurveyParams) => { subject: string; body: string }> = {
    csat: (p) => ({
        subject: `How did we do? Quick 1-question survey${p.ticketId ? ` [#${p.ticketId}]` : ''}`,
        body: [
            `Dear ${p.customerName ?? 'Valued Customer'},`,
            '',
            `Thank you for contacting ${p.companyName ?? 'our support team'}. ` +
            `We hope your issue was resolved to your satisfaction.`,
            '',
            `We'd love to hear how we did. Please rate your experience:`,
            '',
            `  ⭐ 1 — Very Dissatisfied`,
            `  ⭐⭐ 2 — Dissatisfied`,
            `  ⭐⭐⭐ 3 — Neutral`,
            `  ⭐⭐⭐⭐ 4 — Satisfied`,
            `  ⭐⭐⭐⭐⭐ 5 — Very Satisfied`,
            '',
            `Simply reply to this email with your rating (1–5) and any comments.`,
            '',
            `Thank you for helping us improve.`,
            '',
            `Warm regards,`,
            p.agentName ?? 'Customer Support Team',
            p.companyName ?? '',
        ].join('\n'),
    }),
    nps: (p) => ({
        subject: `How likely are you to recommend us?${p.ticketId ? ` [#${p.ticketId}]` : ''}`,
        body: [
            `Dear ${p.customerName ?? 'Valued Customer'},`,
            '',
            `On a scale of 0–10, how likely are you to recommend ${p.companyName ?? 'us'} to a friend or colleague?`,
            '',
            `  0 — Not at all likely`,
            `  10 — Extremely likely`,
            '',
            `Reply with your score (0–10) and any feedback you'd like to share.`,
            '',
            `Your input helps us deliver a better experience.`,
            '',
            `Warm regards,`,
            p.agentName ?? 'Customer Support Team',
        ].join('\n'),
    }),
    ces: (p) => ({
        subject: `How easy was it to get help?${p.ticketId ? ` [#${p.ticketId}]` : ''}`,
        body: [
            `Dear ${p.customerName ?? 'Valued Customer'},`,
            '',
            `How much effort did you have to put in to get your issue resolved?`,
            '',
            `  1 — Very Low Effort`,
            `  2 — Low Effort`,
            `  3 — Neutral`,
            `  4 — High Effort`,
            `  5 — Very High Effort`,
            '',
            `Reply with your score (1–5) and any comments.`,
            '',
            `Warm regards,`,
            p.agentName ?? 'Customer Support Team',
        ].join('\n'),
    }),
};

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function sendSurvey(params: SendSurveyParams): Promise<SurveySendResult> {
    const url = resolveSurveyUrl(params.connector);

    if (url) {
        try {
            const res = await fetch(`${url}/surveys/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: params.tenantId,
                    botId: params.botId,
                    surveyType: params.surveyType,
                    customerEmail: params.customerEmail,
                    customerName: params.customerName,
                    ticketId: params.ticketId,
                    agentName: params.agentName,
                    language: params.language ?? 'en',
                }),
            });
            if (res.ok) {
                const data = (await res.json()) as { surveyId?: string; status?: string };
                return {
                    surveyId: data.surveyId ?? `survey-${Date.now()}`,
                    surveyType: params.surveyType,
                    customerEmail: params.customerEmail,
                    channel: 'mcp',
                    status: (data.status as 'sent' | 'queued' | 'failed') ?? 'sent',
                };
            }
        } catch {
            // fall through to email fallback
        }
    }

    // Email fallback — compose the survey inline
    const template = SURVEY_TEMPLATES[params.surveyType](params);
    return {
        surveyId: `email-survey-${Date.now()}`,
        surveyType: params.surveyType,
        customerEmail: params.customerEmail,
        channel: 'email_fallback',
        status: 'queued',
        previewSubject: template.subject,
        previewBody: template.body,
    };
}
