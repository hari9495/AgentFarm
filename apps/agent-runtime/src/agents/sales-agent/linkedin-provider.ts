/**
 * LinkedIn Sales Navigator provider via the LinkedIn Marketing API.
 *
 * Required env var: LINKEDIN_API_KEY (OAuth 2.0 access token with
 * r_liteprofile, r_emailaddress, and w_member_social scopes, or a
 * Sales Navigator API token).
 *
 * Docs: https://learn.microsoft.com/en-us/linkedin/shared/api-guide
 */
import type { ILeadSourceProvider, LeadSearchParams, LeadCandidate } from './lead-source-provider.js';

interface LinkedInPersonRecord {
    id?: string;
    firstName?: { localized?: Record<string, string> };
    lastName?: { localized?: Record<string, string> };
    headline?: { localized?: Record<string, string> };
    emailAddress?: string;
    vanityName?: string;
    currentCompany?: string;
    industry?: string;
}

function mapLinkedInPerson(p: LinkedInPersonRecord): LeadCandidate {
    const locale = Object.keys(p.firstName?.localized ?? {})[0] ?? 'en_US';
    return {
        firstName: p.firstName?.localized?.[locale] ?? '',
        lastName: p.lastName?.localized?.[locale] ?? '',
        email: p.emailAddress ?? '',
        company: p.currentCompany ?? '',
        title: p.headline?.localized?.[locale],
        industry: p.industry,
        linkedinUrl: p.vanityName ? `https://www.linkedin.com/in/${p.vanityName}` : undefined,
    };
}

export class LinkedInProvider implements ILeadSourceProvider {
    private readonly apiKey: string;
    private static readonly BASE = 'https://api.linkedin.com/v2';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async search(params: LeadSearchParams): Promise<LeadCandidate[]> {
        // LinkedIn People Search uses the /people endpoint with facet filters.
        const url = new URL(`${LinkedInProvider.BASE}/people`);
        if (params.title) url.searchParams.set('facet', `title:${encodeURIComponent(params.title)}`);
        if (params.industry) url.searchParams.set('facet', `industry:${encodeURIComponent(params.industry)}`);
        url.searchParams.set('count', String(params.limit ?? 25));
        url.searchParams.set('projection', '(elements*(id,firstName,lastName,headline,vanityName))');

        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${this.apiKey}`, 'X-Restli-Protocol-Version': '2.0.0' },
        });
        if (!res.ok) return [];
        const data = await res.json() as { elements?: LinkedInPersonRecord[] };
        return (data.elements ?? []).map(mapLinkedInPerson);
    }

    async enrich(email: string): Promise<LeadCandidate | null> {
        // LinkedIn does not support reverse email lookup in the public API.
        // The best we can do is search by name extracted from the email prefix.
        const localPart = email.split('@')[0] ?? '';
        const [firstName, ...rest] = localPart.split(/[._-]/);
        const lastName = rest.join('');
        if (!firstName) return null;

        const url = new URL(`${LinkedInProvider.BASE}/people`);
        url.searchParams.set('q', 'search');
        url.searchParams.set('keywords', `${firstName} ${lastName}`.trim());
        url.searchParams.set('count', '1');

        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${this.apiKey}`, 'X-Restli-Protocol-Version': '2.0.0' },
        });
        if (!res.ok) return null;
        const data = await res.json() as { elements?: LinkedInPersonRecord[] };
        const person = data.elements?.[0];
        if (!person) return null;
        return { ...mapLinkedInPerson(person), email };
    }
}
