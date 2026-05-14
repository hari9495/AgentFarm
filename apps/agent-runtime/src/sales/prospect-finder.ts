import type { PrismaClient } from '@prisma/client';
import type { LeadSourceProvider, SalesAgentConfigRecord } from '@agentfarm/shared-types';
import type { ILeadSourceProvider, LeadSearchParams } from './lead-source-provider.js';
import { getLeadSourceProvider } from './lead-source-factory.js';
import { scoreProspect, qualifyProspect } from './icp-scorer.js';

export type { LeadSearchParams };

export interface FindProspectsOptions {
    prisma: PrismaClient;
    config: SalesAgentConfigRecord;
    searchParams: LeadSearchParams;
    qualifyThreshold?: number;
    /** Injected for testing — overrides the factory-created provider. */
    provider?: ILeadSourceProvider;
}

export interface FindProspectsResult {
    found: number;
    saved: number;
    skipped: number;
}

export async function findAndSaveProspects(
    options: FindProspectsOptions,
): Promise<FindProspectsResult> {
    const { prisma, config, searchParams, qualifyThreshold = 50, provider } = options;

    const resolvedProvider =
        provider ?? getLeadSourceProvider(config.leadSourceProvider as LeadSourceProvider);

    const candidates = await resolvedProvider.search({
        ...searchParams,
        limit: searchParams.limit ?? config.maxProspectsPerDay,
    });

    let saved = 0;
    let skipped = 0;

    for (const candidate of candidates) {
        if (!candidate.email || !candidate.email.includes('@')) {
            skipped++;
            continue;
        }

        const icpScore = scoreProspect(candidate, config);
        const qualified = qualifyProspect(candidate, config, qualifyThreshold);

        try {
            await (prisma as unknown as {
                prospect: {
                    upsert: (args: {
                        where: unknown;
                        create: unknown;
                        update: unknown;
                    }) => Promise<unknown>;
                };
            }).prospect.upsert({
                where: { tenantId_email: { tenantId: config.tenantId, email: candidate.email } },
                create: {
                    tenantId: config.tenantId,
                    botId: config.botId,
                    firstName: candidate.firstName,
                    lastName: candidate.lastName,
                    email: candidate.email,
                    company: candidate.company,
                    title: candidate.title ?? null,
                    industry: candidate.industry ?? null,
                    companySize: candidate.companySize ?? null,
                    linkedinUrl: candidate.linkedinUrl ?? null,
                    website: candidate.website ?? null,
                    phone: candidate.phone ?? null,
                    icpScore,
                    qualified,
                    status: 'new',
                },
                update: {
                    icpScore,
                    qualified,
                    company: candidate.company,
                    title: candidate.title ?? null,
                    industry: candidate.industry ?? null,
                    companySize: candidate.companySize ?? null,
                    linkedinUrl: candidate.linkedinUrl ?? null,
                    website: candidate.website ?? null,
                    phone: candidate.phone ?? null,
                    updatedAt: new Date(),
                },
            });
            saved++;
        } catch {
            skipped++;
        }
    }

    return { found: candidates.length, saved, skipped };
}
