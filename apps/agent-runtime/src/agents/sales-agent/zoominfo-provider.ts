/**
 * ZoomInfo Engage API provider.
 *
 * Required env vars:
 *   ZOOMINFO_CLIENT_ID      — OAuth client ID
 *   ZOOMINFO_CLIENT_SECRET  — OAuth client secret
 *   ZOOMINFO_API_KEY        — optional static key (used instead of OAuth if set)
 *
 * Docs: https://api-docs.zoominfo.com/
 */
import type { ILeadSourceProvider, LeadSearchParams, LeadCandidate } from './lead-source-provider.js';

interface ZoomInfoContact {
    firstName?: string;
    lastName?: string;
    email?: string;
    jobTitle?: string;
    phone?: string;
    linkedInUrl?: string;
    company?: { name?: string; website?: string; industry?: string; employeeCount?: number };
}

interface ZoomInfoTokenResponse {
    jwt?: string;
}

function mapZoomInfoContact(c: ZoomInfoContact): LeadCandidate {
    return {
        firstName: c.firstName ?? '',
        lastName: c.lastName ?? '',
        email: c.email ?? '',
        company: c.company?.name ?? '',
        title: c.jobTitle,
        industry: c.company?.industry,
        companySize: c.company?.employeeCount ? String(c.company.employeeCount) : undefined,
        linkedinUrl: c.linkedInUrl,
        website: c.company?.website,
        phone: c.phone,
    };
}

export class ZoomInfoProvider implements ILeadSourceProvider {
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly staticKey: string | null;
    private cachedToken: string | null = null;
    private tokenExpiresAt = 0;

    constructor(clientId: string, clientSecret: string, staticKey?: string) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.staticKey = staticKey ?? null;
    }

    private async getToken(): Promise<string> {
        if (this.staticKey) return this.staticKey;
        if (this.cachedToken && Date.now() < this.tokenExpiresAt) return this.cachedToken;

        const res = await fetch('https://api.zoominfo.com/authenticate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: this.clientId, password: this.clientSecret }),
        });
        if (!res.ok) throw new Error(`ZoomInfo auth failed: ${res.status}`);
        const data = await res.json() as ZoomInfoTokenResponse;
        if (!data.jwt) throw new Error('ZoomInfo: no JWT in auth response');
        this.cachedToken = data.jwt;
        this.tokenExpiresAt = Date.now() + 55 * 60 * 1000; // 55 min (tokens last 60)
        return data.jwt;
    }

    async search(params: LeadSearchParams): Promise<LeadCandidate[]> {
        const token = await this.getToken();
        const body: Record<string, unknown> = {
            outputFields: ['firstName', 'lastName', 'email', 'jobTitle', 'phone', 'linkedInUrl', 'company'],
            rpp: params.limit ?? 25,
            page: 1,
        };
        if (params.domain) body['companyDomain'] = [params.domain];
        if (params.title) body['jobTitle'] = [params.title];
        if (params.industry) body['industry'] = [params.industry];

        const res = await fetch('https://api.zoominfo.com/search/contact', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) return [];
        const data = await res.json() as { data?: { result?: ZoomInfoContact[] } };
        return (data.data?.result ?? []).map(mapZoomInfoContact);
    }

    async enrich(email: string): Promise<LeadCandidate | null> {
        const token = await this.getToken();
        const res = await fetch('https://api.zoominfo.com/search/contact', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                outputFields: ['firstName', 'lastName', 'email', 'jobTitle', 'phone', 'linkedInUrl', 'company'],
                email: [email],
                rpp: 1,
            }),
        });
        if (!res.ok) return null;
        const data = await res.json() as { data?: { result?: ZoomInfoContact[] } };
        const contact = data.data?.result?.[0];
        if (!contact) return null;
        return mapZoomInfoContact(contact);
    }
}
