import type { ILeadSourceProvider, LeadSearchParams, LeadCandidate } from './lead-source-provider.js';

interface ApolloPersonRecord {
    first_name?: string;
    last_name?: string;
    email?: string;
    organization_name?: string;
    title?: string;
    industry?: string;
    organization?: { estimated_num_employees?: number };
    linkedin_url?: string;
    organization_website_url?: string;
    phone_numbers?: Array<{ sanitized_number?: string }>;
}

function mapApolloPerson(p: ApolloPersonRecord): LeadCandidate {
    return {
        firstName: p.first_name ?? '',
        lastName: p.last_name ?? '',
        email: p.email ?? '',
        company: p.organization_name ?? '',
        title: p.title,
        industry: p.industry,
        companySize: p.organization?.estimated_num_employees
            ? String(p.organization.estimated_num_employees)
            : undefined,
        linkedinUrl: p.linkedin_url,
        website: p.organization_website_url,
        phone: p.phone_numbers?.[0]?.sanitized_number,
    };
}

export class ApolloProvider implements ILeadSourceProvider {
    private readonly apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async search(params: LeadSearchParams): Promise<LeadCandidate[]> {
        const res = await fetch('https://api.apollo.io/v1/mixed_people/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'X-Api-Key': this.apiKey,
            },
            body: JSON.stringify({
                q_organization_domains: params.domain ? [params.domain] : undefined,
                person_titles: params.title ? [params.title] : undefined,
                page: 1,
                per_page: params.limit ?? 25,
            }),
        });

        if (!res.ok) return [];
        const data = await res.json() as { people?: ApolloPersonRecord[] };
        return (data.people ?? []).map(mapApolloPerson);
    }

    async enrich(email: string): Promise<LeadCandidate | null> {
        const res = await fetch('https://api.apollo.io/v1/people/match', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-cache',
                'X-Api-Key': this.apiKey,
            },
            body: JSON.stringify({ email }),
        });

        if (!res.ok) return null;
        const data = await res.json() as { person?: ApolloPersonRecord };
        if (!data.person) return null;
        return mapApolloPerson(data.person);
    }
}
