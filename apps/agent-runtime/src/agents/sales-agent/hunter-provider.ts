import type { ILeadSourceProvider, LeadSearchParams, LeadCandidate } from './lead-source-provider.js';

interface HunterEmailRecord {
    value?: string;
    first_name?: string;
    last_name?: string;
    position?: string;
    organization?: string;
}

interface HunterDomainSearchResponse {
    data?: {
        emails?: HunterEmailRecord[];
        organization?: string;
        domain?: string;
    };
}

interface HunterEmailFinderResponse {
    data?: HunterEmailRecord & { organization?: string };
}

export class HunterProvider implements ILeadSourceProvider {
    private readonly apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async search(params: LeadSearchParams): Promise<LeadCandidate[]> {
        if (!params.domain) return [];

        const url = new URL('https://api.hunter.io/v2/domain-search');
        url.searchParams.set('domain', params.domain);
        url.searchParams.set('api_key', this.apiKey);
        if (params.limit) url.searchParams.set('limit', String(params.limit));

        const res = await fetch(url.toString());
        if (!res.ok) return [];

        const data = await res.json() as HunterDomainSearchResponse;
        return (data.data?.emails ?? []).map((e) => ({
            firstName: e.first_name ?? '',
            lastName: e.last_name ?? '',
            email: e.value ?? '',
            company: data.data?.organization ?? '',
            title: e.position,
            website: `https://${params.domain}`,
        }));
    }

    async enrich(email: string): Promise<LeadCandidate | null> {
        const atIndex = email.indexOf('@');
        if (atIndex === -1) return null;
        const domain = email.slice(atIndex + 1);

        const url = new URL('https://api.hunter.io/v2/email-finder');
        url.searchParams.set('domain', domain);
        url.searchParams.set('email', email);
        url.searchParams.set('api_key', this.apiKey);

        const res = await fetch(url.toString());
        if (!res.ok) return null;

        const data = await res.json() as HunterEmailFinderResponse;
        if (!data.data?.value) return null;

        return {
            firstName: data.data.first_name ?? '',
            lastName: data.data.last_name ?? '',
            email: data.data.value,
            company: data.data.organization ?? '',
            title: data.data.position,
            website: `https://${domain}`,
        };
    }
}
