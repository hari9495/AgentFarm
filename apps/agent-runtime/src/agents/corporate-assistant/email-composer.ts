/**
 * Corporate Assistant — Email Composer
 *
 * Handles email composition and dispatch for the corporate assistant.
 *
 * Design decisions:
 *   - composeDraftEmail is a pure function — no IO, easy to test.
 *   - sendComposedEmail reuses getEmailProvider from the sales module so we
 *     don't duplicate smtp/sendgrid/mailgun initialisation logic.
 *   - classifyEmailIntent is a pure keyword heuristic — no LLM call.
 */

import type { AgentPersonaRecord } from '@agentfarm/shared-types';
import type { SalesEmailProvider } from '@agentfarm/shared-types';
import type { EmailProviderConfig } from '../sales-agent/email-provider.js';
import { getEmailProvider } from '../sales-agent/email-provider-factory.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DraftEmailParams = {
    task: {
        subject?: string;
        body?: string;
        title?: string;
        objective?: string;
        recipient?: string;
        to?: string;
    };
    persona: Pick<AgentPersonaRecord, 'displayName' | 'emailAddress' | 'disclosureStatement'>;
};

export type DraftEmail = {
    subject: string;
    body: string;
};

export type SendEmailParams = {
    to: string;
    subject: string;
    body: string;
    persona: Pick<AgentPersonaRecord, 'displayName' | 'emailAddress' | 'disclosureStatement'>;
    providerName: SalesEmailProvider;
    /** Optional provider override — used in tests to inject a mock. */
    providerOverride?: import('../sales-agent/email-provider.js').IEmailProvider;
};

export type SendEmailResult = {
    sent: boolean;
    error?: string;
};

export type EmailIntent = 'reply' | 'new_thread' | 'forward';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compose a draft email from task context and persona.
 *
 * Pure function — no side effects, no IO.
 * The subject falls back to the task title or objective if no explicit subject
 * is provided. The body always appends the agent's disclosure statement as a
 * footer so every outbound message is transparency-compliant.
 */
export function composeDraftEmail(params: DraftEmailParams): DraftEmail {
    const { task, persona } = params;

    const subject =
        task.subject?.trim() ||
        task.title?.trim() ||
        task.objective?.trim()?.slice(0, 80) ||
        '(No subject)';

    const bodyContent =
        task.body?.trim() ||
        task.objective?.trim() ||
        '(No message body was provided for this email draft.)';

    const disclosure = persona.disclosureStatement?.trim();
    const footer = disclosure ? `\n\n---\n${disclosure}` : '';

    const body = `${bodyContent}${footer}`;

    return { subject, body };
}

/**
 * Dispatch a composed email through the configured email provider.
 *
 * Returns {sent: true} on success, {sent: false, error: <message>} on failure.
 * Failures are caught so callers can handle them without uncaught rejections.
 */
export async function sendComposedEmail(params: SendEmailParams): Promise<SendEmailResult> {
    const { to, subject, body, persona, providerName, providerOverride } = params;

    try {
        const provider = providerOverride ?? getEmailProvider(providerName);
        const emailConfig: EmailProviderConfig = {
            apiKey: process.env['CA_EMAIL_API_KEY'] ?? process.env['SALES_EMAIL_API_KEY'],
            host: process.env['CA_SMTP_HOST'] ?? process.env['SALES_SMTP_HOST'],
            port: Number(process.env['CA_SMTP_PORT'] ?? process.env['SALES_SMTP_PORT'] ?? '587'),
            secure: (process.env['CA_SMTP_SECURE'] ?? process.env['SALES_SMTP_SECURE']) === 'true',
            user: process.env['CA_SMTP_USER'] ?? process.env['SALES_SMTP_USER'],
            pass: process.env['CA_SMTP_PASS'] ?? process.env['SALES_SMTP_PASS'],
            fromEmail: persona.emailAddress,
            fromName: persona.displayName,
        };
        const result = await provider.sendEmail(
            {
                to,
                from: persona.emailAddress,
                subject,
                body,
            },
            emailConfig,
        );
        return { sent: result.success, error: result.error };
    } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        return { sent: false, error };
    }
}

/**
 * Classify the intent of an email message.
 *
 * Pure keyword heuristic — no LLM call.
 *
 * Rules:
 *   'reply'      — subject starts with "re:" or body contains "in reply to"
 *   'forward'    — subject starts with "fwd:" / "fw:"
 *   'new_thread' — everything else
 */
export function classifyEmailIntent(subject: string, body: string): EmailIntent {
    const subjectLower = subject.trim().toLowerCase();
    const bodyLower = body.trim().toLowerCase();

    if (
        subjectLower.startsWith('re:') ||
        subjectLower.startsWith('re ') ||
        bodyLower.includes('in reply to') ||
        bodyLower.includes('as per your email')
    ) {
        return 'reply';
    }

    if (
        subjectLower.startsWith('fwd:') ||
        subjectLower.startsWith('fw:') ||
        subjectLower.startsWith('fwd ') ||
        subjectLower.startsWith('fw ')
    ) {
        return 'forward';
    }

    return 'new_thread';
}
