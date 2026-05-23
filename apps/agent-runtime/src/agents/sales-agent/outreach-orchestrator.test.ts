import test from 'node:test';
import assert from 'node:assert/strict';
import type { PrismaClient } from '@prisma/client';
import { sendOutreachEmail } from './outreach-orchestrator.js';
import type { OutreachParams } from './outreach-orchestrator.js';
import type { PersonalisedEmail, PersonaliseEmailParams } from './email-personaliser.js';
import type { IEmailProvider, SendEmailParams, EmailProviderConfig, SendEmailResult } from './email-provider.js';

const mockConfig = {
    id: 'config_1',
    tenantId: 'tenant_1',
    botId: 'bot_1',
    productDescription: 'AgentFarm',
    icp: 'VP Engineering at SaaS companies',
    leadSourceProvider: 'apollo' as const,
    emailProvider: 'smtp' as const,
    crmProvider: 'salesforce' as const,
    calendarProvider: 'google_calendar' as const,
    signatureProvider: 'docusign' as const,
    emailTone: 'professional',
    followUpDays: [3, 7, 14],
    maxProspectsPerDay: 50,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const mockProspect = {
    id: 'prospect_1',
    tenantId: 'tenant_1',
    botId: 'bot_1',
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane@acme.com',
    company: 'Acme Corp',
    title: 'VP Engineering',
    industry: 'SaaS',
    companySize: '200',
    linkedinUrl: null,
    website: null,
    phone: null,
    icpScore: 80,
    qualified: true,
    status: 'new' as const,
    notes: null,
    lastContactedAt: null,
    nextFollowUpAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const mockEmail: PersonalisedEmail = {
    subject: 'Test Subject',
    body: '<p>Test body</p>',
    reasoning: 'Test reasoning',
};

const mockPersonaliser = async (_p: PersonaliseEmailParams): Promise<PersonalisedEmail> => mockEmail;

const mockProviderSuccess: IEmailProvider = {
    providerName: 'smtp',
    sendEmail: async (_params: SendEmailParams, _config: EmailProviderConfig): Promise<SendEmailResult> =>
        ({ success: true, messageId: 'msg_abc', provider: 'smtp' }),
};

const mockProviderFail: IEmailProvider = {
    providerName: 'smtp',
    sendEmail: async (_params: SendEmailParams, _config: EmailProviderConfig): Promise<SendEmailResult> =>
        ({ success: false, error: 'SMTP connection refused', provider: 'smtp' }),
};

const makeBaseParams = (overrides: Partial<OutreachParams> = {}): OutreachParams => ({
    tenantId: 'tenant_1',
    botId: 'bot_1',
    prospectId: 'prospect_1',
    config: mockConfig,
    emailConfig: { fromEmail: 'sales@agentfarm.dev' },
    personaliser: mockPersonaliser,
    emailProviderOverride: mockProviderSuccess,
    ...overrides,
});

const makePrisma = (
    prospectOverride: unknown = mockProspect,
    onUpdate?: () => void,
): PrismaClient => ({
    prospect: {
        findUnique: async () => prospectOverride,
        update: async () => {
            if (onUpdate) onUpdate();
            return prospectOverride;
        },
    },
    salesActivity: {
        create: async () => ({ id: 'activity_1' }),
    },
} as unknown as PrismaClient);

test('sendOutreachEmail — sends email and logs activity on success', async () => {
    const result = await sendOutreachEmail(makeBaseParams(), makePrisma());
    assert.equal(result.success, true);
    assert.equal(result.subject, mockEmail.subject);
    assert.equal(result.activityId, 'activity_1');
    assert.equal(result.messageId, 'msg_abc');
    assert.equal(result.provider, 'smtp');
});

test('sendOutreachEmail — logs activity with failed outcome on send failure', async () => {
    const result = await sendOutreachEmail(
        makeBaseParams({ emailProviderOverride: mockProviderFail }),
        makePrisma(),
    );
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('SMTP connection refused'));
    assert.equal(result.activityId, 'activity_1');
});

test('sendOutreachEmail — throws on prospect not found', async () => {
    await assert.rejects(
        () => sendOutreachEmail(makeBaseParams(), makePrisma(null)),
        /Prospect not found/,
    );
});

test('sendOutreachEmail — throws on tenant isolation violation', async () => {
    const wrongTenantProspect = { ...mockProspect, tenantId: 'other_tenant' };
    await assert.rejects(
        () => sendOutreachEmail(makeBaseParams(), makePrisma(wrongTenantProspect)),
        /Tenant isolation violation/,
    );
});

test('sendOutreachEmail — updates prospect status to contacted on success', async () => {
    let updateCalled = false;
    await sendOutreachEmail(makeBaseParams(), makePrisma(mockProspect, () => { updateCalled = true; }));
    assert.equal(updateCalled, true, 'prospect.update should have been called');
});
