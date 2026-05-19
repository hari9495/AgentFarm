import type { PrismaClient } from '@prisma/client';
import type { SalesAgentConfigRecord } from '@agentfarm/shared-types';
import { getEmailProvider } from './email-provider-factory.js';
import type { IEmailProvider, EmailProviderConfig } from './email-provider.js';
import { appendGdprFooter, resolveOptOutUrl } from '../gdpr-email-footer.js';

const CONTRACT_MODEL = 'claude-sonnet-4-20250514';

type PrismaWithSales = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
    };
    salesDeal: {
        findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    contractEvent: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

export async function sendContractInvite(
    prospectId: string,
    dealId: string,
    tenantId: string,
    botId: string,
    config: SalesAgentConfigRecord,
    prisma?: PrismaClient,
    emailProviderOverride?: IEmailProvider,
): Promise<{ subject: string; body: string; sent: boolean; error?: string }> {
    try {
        const contractUrl = config.contractUrl ?? '';
        if (!contractUrl) {
            return { subject: '', body: '', sent: false, error: 'No contractUrl configured' };
        }

        const db = prisma ? (prisma as unknown as PrismaWithSales) : null;

        let prospect: Record<string, unknown> | null = null;
        let deal: Record<string, unknown> | null = null;

        if (db) {
            [prospect, deal] = await Promise.all([
                db.prospect.findUnique({ where: { id: prospectId } }),
                db.salesDeal.findUnique({ where: { id: dealId } }),
            ]);
        }

        if (!prospect) {
            return { subject: '', body: '', sent: false, error: 'Prospect not found' };
        }
        if (!deal) {
            return { subject: '', body: '', sent: false, error: 'Deal not found' };
        }

        // Generate personalised contract email via LLM
        const apiKey = process.env['ANTHROPIC_API_KEY'];
        const system = `You are an expert sales assistant. Generate a concise, professional contract/e-sign invite email.
Return ONLY valid JSON with no markdown: { "subject": "...", "body": "..." }`;

        const dealValue = deal['value'] != null
            ? `${String(deal['currency'] ?? 'USD')} ${String(deal['value'])}`
            : 'as discussed';
        const userPrompt = `Write a short, professional email inviting this prospect to review and sign the contract.
Prospect: ${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')} at ${String(prospect['company'] ?? '')}
Deal title: ${String(deal['title'] ?? '')}
Deal value: ${dealValue}
Contract URL: ${contractUrl}
Product: ${config.productDescription}
Tone: ${config.emailTone}`;

        const llmRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-api-key': apiKey ?? '',
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: CONTRACT_MODEL,
                max_tokens: 500,
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
            apiKey: process.env['SALES_EMAIL_API_KEY'],
            host: process.env['SALES_SMTP_HOST'],
            port: Number(process.env['SALES_SMTP_PORT'] ?? '587'),
            secure: process.env['SALES_SMTP_SECURE'] === 'true',
            user: process.env['SALES_SMTP_USER'],
            pass: process.env['SALES_SMTP_PASS'],
            fromEmail: process.env['SALES_FROM_EMAIL'] ?? 'sales@agentfarm.dev',
            fromName: process.env['SALES_FROM_NAME'],
        };

        const emailBody = appendGdprFooter(body, { optOutUrl: resolveOptOutUrl(tenantId) });
        const sendResult = await provider.sendEmail(
            {
                to: String(prospect['email'] ?? ''),
                from: emailConfig.fromEmail ?? 'sales@agentfarm.dev',
                subject,
                body: emailBody,
            },
            emailConfig,
        );

        if (db) {
            // Create ContractEvent (status='sent')
            await db.contractEvent.create({
                data: {
                    tenantId,
                    botId,
                    prospectId,
                    dealId,
                    provider: 'email',
                    signerEmail: String(prospect['email'] ?? ''),
                    signerName: `${String(prospect['firstName'] ?? '')} ${String(prospect['lastName'] ?? '')}`.trim(),
                    status: 'sent',
                    payload: JSON.stringify({ subject, body, contractUrl }),
                    createdAt: new Date(),
                },
            });

            // Update SalesDeal.contractSentAt
            await db.salesDeal.update({
                where: { id: dealId },
                data: { contractSentAt: new Date(), updatedAt: new Date() },
            });

            // Log SalesActivity
            await db.salesActivity.create({
                data: {
                    tenantId,
                    botId,
                    prospectId,
                    dealId,
                    activityType: 'email_sent',
                    subject,
                    body,
                    outcome: sendResult.success ? 'contract_sent' : `failed: ${sendResult.error ?? 'unknown'}`,
                    completedAt: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            });
        }

        return { subject, body, sent: sendResult.success, error: sendResult.error };
    } catch (err: unknown) {
        return { subject: '', body: '', sent: false, error: String(err) };
    }
}
