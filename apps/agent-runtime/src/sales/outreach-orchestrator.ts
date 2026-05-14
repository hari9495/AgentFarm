import type { SalesAgentConfigRecord, ProspectRecord, SalesActivityType } from '@agentfarm/shared-types';
import type { PrismaClient } from '@prisma/client';
import { personaliseEmail, type PersonaliseEmailParams, type PersonalisedEmail } from './email-personaliser.js';
import { getEmailProvider } from './email-provider-factory.js';
import type { IEmailProvider, EmailProviderConfig } from './email-provider.js';

export interface OutreachParams {
    tenantId: string;
    botId: string;
    prospectId: string;
    config: SalesAgentConfigRecord;
    emailConfig: EmailProviderConfig;
    sequenceStep?: number;
    previousSubject?: string;
    /** Injected for testing — overrides personaliseEmail. */
    personaliser?: (params: PersonaliseEmailParams) => Promise<PersonalisedEmail>;
    /** Injected for testing — overrides getEmailProvider. */
    emailProviderOverride?: IEmailProvider;
}

export interface OutreachResult {
    success: boolean;
    subject: string;
    provider: string;
    activityId: string;
    messageId?: string;
    error?: string;
}

type PrismaWithSales = {
    prospect: {
        findUnique: (args: { where: { id: string } }) => Promise<ProspectRecord | null>;
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    salesActivity: {
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    };
};

export async function sendOutreachEmail(
    params: OutreachParams,
    prisma: PrismaClient,
): Promise<OutreachResult> {
    const db = prisma as unknown as PrismaWithSales;

    const prospect = await db.prospect.findUnique({ where: { id: params.prospectId } });
    if (!prospect) {
        throw new Error(`Prospect not found: ${params.prospectId}`);
    }
    if (prospect.tenantId !== params.tenantId) {
        throw new Error('Tenant isolation violation');
    }

    const step = params.sequenceStep ?? 1;
    const personaliserFn = params.personaliser ?? personaliseEmail;
    const email = await personaliserFn({
        prospect: {
            firstName: prospect.firstName,
            lastName: prospect.lastName,
            email: prospect.email,
            company: prospect.company,
            title: prospect.title,
            industry: prospect.industry,
        },
        productDescription: params.config.productDescription,
        icp: params.config.icp,
        emailTone: params.config.emailTone,
        sequenceStep: step,
        previousSubject: params.previousSubject,
    });

    const provider = params.emailProviderOverride ?? getEmailProvider(params.config.emailProvider);
    const sendResult = await provider.sendEmail(
        {
            to: prospect.email,
            from: params.emailConfig.fromEmail ?? process.env['SALES_EMAIL_FROM'] ?? '',
            subject: email.subject,
            body: email.body,
        },
        params.emailConfig,
    );

    const activityType: SalesActivityType = 'email';
    const activity = await db.salesActivity.create({
        data: {
            tenantId: params.tenantId,
            botId: params.botId,
            prospectId: params.prospectId,
            activityType,
            subject: email.subject,
            body: email.body,
            outcome: sendResult.success ? 'sent' : `failed: ${sendResult.error ?? 'unknown'}`,
            completedAt: new Date(),
        },
    });

    if (sendResult.success) {
        await db.prospect.update({
            where: { id: params.prospectId },
            data: { status: 'contacted', lastContactedAt: new Date(), updatedAt: new Date() },
        });
    }

    return {
        success: sendResult.success,
        subject: email.subject,
        provider: provider.providerName,
        activityId: activity.id,
        messageId: sendResult.messageId,
        error: sendResult.error,
    };
}
