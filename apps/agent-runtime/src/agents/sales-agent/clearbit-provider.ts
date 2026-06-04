/**
 * Clearbit Enrichment + Prospector provider.
 *
 * Required env var: CLEARBIT_API_KEY (secret key from clearbit.com/keys)
 *
 * Docs:
 *   Enrichment:  https://dashboard.clearbit.com/docs#enrichment-api
 *   Prospector:  https://dashboard.clearbit.com/docs#prospector-api
 */
import type { ILeadSourceProvider, LeadSearchParams, LeadCandidate } from './lead-source-provider.js';

interface ClearbitPerson {
    name?: { givenName?: string; familyName?: string };
    email?: string;
    employment?: { name?: string; title?: string };
    linkedin?: { handle?: string };
    phone?: string;
}

interface ClearbitCompany {
    name?: string;
    domain?: string;
    metrics?: { employeesRange?: string };
    category?: { industry?: string };
}

interface ClearbitCombinedRecord {
    person?: ClearbitPerson;
    company?: ClearbitCompany;
}

function mapClearbit(p: ClearbitPerson, company?: ClearbitCompany): LeadCandidate {
    return {
        firstName: p.name?.givenName ?? '',
        lastName: p.name?.familyName ?? '',
        email: p.email ?? '',
        company: p.employment?.name ?? company?.name ?? '',
        title: p.employment?.title,
        industry: company?.category?.industry,
        companySize: company?.metrics?.employeesRange,
        linkedinUrl: p.linkedin?.handle
            ? `https://www.linkedin.com/in/${p.linkedin.handle}`
            : undefined,
        website: company?.domain ? `https://${company.domain}` : undefined,
        phone: p.phone,
    };
}

export class ClearbitProvider implements ILeadSourceProvider {
    private readonly apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async search(params: LeadSearchParams): Promise<LeadCandidate[]> {
        // Clearbit Prospector: find contacts by role/company.
        const url = new URL('https://prospector.clearbit.com/v1/people/search');
        if (params.domain) url.searchParams.set('domain', params.domain);
        if (params.title) url.searchParams.set('role', params.title);
        if (params.industry) url.searchParams.set('seniority', params.industry);
        url.searchParams.set('page_size', String(Math.min(params.limit ?? 25, 100)));

        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        if (!res.ok) return [];
        const data = await res.json() as { results?: Array<{ person?: ClearbitPerson; company?: ClearbitCompany }> };
        return (data.results ?? []).map((r) => mapClearbit(r.person ?? {}, r.company));
    }

    async enrich(email: string): Promise<LeadCandidate | null> {
        const url = new URL('https://person-stream.clearbit.com/v2/combined/find');
        url.searchParams.set('email', email);

        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${this.apiKey}` },
        });
        if (!res.ok) return null;
        const data = await res.json() as ClearbitCombinedRecord;
        if (!data.person) return null;
        return mapClearbit(data.person, data.company);
    }
}
