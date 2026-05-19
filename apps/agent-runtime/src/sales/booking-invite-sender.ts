import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import { getEmailProvider } from './email-provider-factory.js';
import type { IEmailProvider, EmailProviderConfig } from './email-provider.js';

const INVITE_MODEL = 'claude-sonnet-4-20250514';

export interface BookingInviteResult {
    subject: string;
    body: string;
    sent: boolean;
    error?: string;
}

type PrismaWithSales = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
    salesActivity: {
        findMany: (args: {
            where: Record<string, unknown>;
            orderBy?: Record<string, unknown>;
            take?: number;
        }) => Promise<Record<string, unknown>[]>;
    };
};

export async function sendBookingInvite(
    prospectId: string,
    tenantId: string,
    _botId: string,
    config: SalesAgentConfigRecord,
    prisma?: PrismaClient,
    emailProviderOverride?: IEmailProvider,
): Promise<BookingInviteResult> {
    try {
        const bookingUrl = config.bookingUrl ?? '';
        if (!bookingUrl) {
            return { subject: '', body: '', sent: false, error: 'No bookingUrl configured' };
        }

        const db = prisma ? (prisma as unknown as PrismaWithSales) : null;

        let prospect: Record<string, unknown> | null = null;
        let recentActivities: Record<string, unknown>[] = [];

        if (db) {
            prospect = await db.prospect.findUnique({ where: { id: prospectId } });
            if (prospect) {
                recentActivities = await db.salesActivity.findMany({
                    where: { prospectId, tenantId },
                    orderBy: { createdAt: 'desc' },
                    take: 3,
                });
            }
        }

        if (!prospect) {
            return { subject: '', body: '', sent: false, error: 'Prospect not found' };
        }

        const bookingUrlFinal = bookingUrl;

        // Generate personalised email via LLM
        const apiKey = process.env.ANTHROPIC_API_KEY;
        const system = `You are an expert sales assistant. Generate a concise, personalised booking invite email.
Return ONLY valid JSON with no markdown: { "subject": "...", "body": "..." }`;

        const lastActivity = recentActivities[0];
        const userPrompt = `Write a short, friendly email inviting this prospect to book a meeting.
Prospect: ${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')} at ${String(prospect['company'] ?? '')}
Title: ${String(prospect['title'] ?? 'unknown')}
Booking URL: ${bookingUrlFinal}
Product: ${config.productDescription}
Tone: ${config.emailTone}
Last interaction: ${lastActivity ? `${String(lastActivity['activityType'])} — ${String(lastActivity['subject'])}` : 'First contact'}`;

        const llmRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey ?? '',
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: INVITE_MODEL,
                max_tokens: 512,
                system,
                messages: [{ role: 'user', content: userPrompt }],
            }),
        });

        if (!llmRes.ok) {
            return { subject: '', body: '', sent: false, error: `LLM error: ${llmRes.status}` };
        }

        const parsed = await llmRes.json() as { content: Array<{ type: string; text?: string }> };
        const raw = parsed.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
        const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        const { subject, body } = JSON.parse(cleaned) as { subject: string; body: string };

        // Send email
        const provider = emailProviderOverride ?? getEmailProvider(config.emailProvider);
        const emailConfig: EmailProviderConfig = {
            apiKey: process.env.SALES_EMAIL_API_KEY,
            host: process.env.SALES_SMTP_HOST,
            port: Number(process.env.SALES_SMTP_PORT ?? '587'),
            secure: process.env.SALES_SMTP_SECURE === 'true',
            user: process.env.SALES_SMTP_USER,
            pass: process.env.SALES_SMTP_PASS,
            fromEmail: process.env.SALES_FROM_EMAIL ?? 'sales@agentfarm.dev',
            fromName: process.env.SALES_FROM_NAME,
        };

        const sendResult = await provider.sendEmail(
            {
                to: String(prospect['email'] ?? ''),
                from: emailConfig.fromEmail ?? 'sales@agentfarm.dev',
                subject,
                body,
            },
            emailConfig,
        );

        return { subject, body, sent: sendResult.success, error: sendResult.error };
    } catch (err: unknown) {
        return { subject: '', body: '', sent: false, error: String(err) };
    }
}
