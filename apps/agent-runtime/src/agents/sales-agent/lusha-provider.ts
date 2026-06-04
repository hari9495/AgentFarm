/**
 * Lusha API provider — B2B contact data enrichment and prospecting.
 *
 * Required env var: LUSHA_API_KEY (from app.lusha.com/settings/api)
 *
 * Docs: https://www.lusha.com/docs/
 */
import type { ILeadSourceProvider, LeadSearchParams, LeadCandidate } from './lead-source-provider.js';

interface LushaContact {
    firstName?: string;
    lastName?: string;
    emailAddresses?: Array<{ emailAddress?: string; isPrimary?: boolean }>;
    phoneNumbers?: Array<{ localizedNumber?: string; isPrimary?: boolean }>;
    jobTitle?: string;
    linkedinUrl?: string;
    currentCompany?: { name?: string; website?: string; industry?: string; numberOfEmployees?: string };
}

interface LushaSearchResult {
    contacts?: LushaContact[];
}

function mapLushaContact(c: LushaContact): LeadCandidate {
    const primaryEmail = c.emailAddresses?.find((e) => e.isPrimary)?.emailAddress
        ?? c.emailAddresses?.[0]?.emailAddress
        ?? '';
    const primaryPhone = c.phoneNumbers?.find((p) => p.isPrimary)?.localizedNumber
        ?? c.phoneNumbers?.[0]?.localizedNumber;

    return {
        firstName: c.firstName ?? '',
        lastName: c.lastName ?? '',
        email: primaryEmail,
        company: c.currentCompany?.name ?? '',
        title: c.jobTitle,
        industry: c.currentCompany?.industry,
        companySize: c.currentCompany?.numberOfEmployees,
        linkedinUrl: c.linkedinUrl,
        website: c.currentCompany?.website,
        phone: primaryPhone,
    };
}

export class LushaProvider implements ILeadSourceProvider {
    private readonly apiKey: string;
    private static readonly BASE = 'https://api.lusha.com';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async search(params: LeadSearchParams): Promise<LeadCandidate[]> {
        // Lusha Prospecting API: find contacts by company/role filters.
        const url = new URL(`${LushaProvider.BASE}/v2/contacts`);
        if (params.domain) url.searchParams.set('companyDomain', params.domain);
        if (params.title) url.searchParams.set('jobTitle', params.title);
        if (params.industry) url.searchParams.set('industry', params.industry);
        url.searchParams.set('limit', String(Math.min(params.limit ?? 25, 100)));

        const res = await fetch(url.toString(), {
            headers: { api_key: this.apiKey },
        });
        if (!res.ok) return [];
        const data = await res.json() as LushaSearchResult;
        return (data.contacts ?? []).map(mapLushaContact);
    }

    async enrich(email: string): Promise<LeadCandidate | null> {
        // Lusha Email Enrichment endpoint.
        const url = new URL(`${LushaProvider.BASE}/v2/contact`);
        url.searchParams.set('email', email);

        const res = await fetch(url.toString(), {
            headers: { api_key: this.apiKey },
        });
        if (!res.ok) return null;
        const data = await res.json() as { contact?: LushaContact };
        if (!data.contact) return null;
        return mapLushaContact(data.contact);
    }
}
