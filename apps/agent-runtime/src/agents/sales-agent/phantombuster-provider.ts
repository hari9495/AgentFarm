/**
 * PhantomBuster API provider — LinkedIn automation and lead extraction.
 *
 * PhantomBuster runs "Phantoms" (automations) that export lead data.
 * This provider fetches the latest export from a configured Phantom
 * and normalises the rows into LeadCandidate records.
 *
 * Required env vars:
 *   PHANTOMBUSTER_API_KEY   — API key from phantombuster.com/api
 *   PHANTOMBUSTER_AGENT_ID  — ID of the Phantom whose output to consume
 *                             (e.g. "LinkedIn Search Export" phantom)
 *
 * Docs: https://hub.phantombuster.com/reference/get_agents-fetch-output
 */
import type { ILeadSourceProvider, LeadSearchParams, LeadCandidate } from './lead-source-provider.js';

interface PhantomRow {
    firstName?: string;
    first_name?: string;
    lastName?: string;
    last_name?: string;
    email?: string;
    emailAddress?: string;
    companyName?: string;
    company?: string;
    title?: string;
    jobTitle?: string;
    job_title?: string;
    industry?: string;
    linkedinUrl?: string;
    profileUrl?: string;
    linkedInUrl?: string;
    phone?: string;
    website?: string;
}

function mapPhantomRow(r: PhantomRow): LeadCandidate {
    return {
        firstName: r.firstName ?? r.first_name ?? '',
        lastName: r.lastName ?? r.last_name ?? '',
        email: r.email ?? r.emailAddress ?? '',
        company: r.companyName ?? r.company ?? '',
        title: r.title ?? r.jobTitle ?? r.job_title,
        industry: r.industry,
        linkedinUrl: r.linkedinUrl ?? r.profileUrl ?? r.linkedInUrl,
        website: r.website,
        phone: r.phone,
    };
}

interface PhantomOutputResponse {
    output?: string;   // JSON-lines or JSON array
    status?: string;
}

export class PhantomBusterProvider implements ILeadSourceProvider {
    private readonly apiKey: string;
    private readonly agentId: string;
    private static readonly BASE = 'https://api.phantombuster.com/api/v2';

    constructor(apiKey: string, agentId: string) {
        this.apiKey = apiKey;
        this.agentId = agentId;
    }

    private async fetchLatestOutput(): Promise<PhantomRow[]> {
        const url = new URL(`${PhantomBusterProvider.BASE}/agents/fetch-output`);
        url.searchParams.set('id', this.agentId);

        const res = await fetch(url.toString(), {
            headers: { 'X-Phantombuster-Key': this.apiKey },
        });
        if (!res.ok) return [];

        const meta = await res.json() as PhantomOutputResponse;
        if (!meta.output) return [];

        // Output can be a JSON array string or newline-delimited JSON objects.
        const text = meta.output.trim();
        try {
            if (text.startsWith('[')) {
                return JSON.parse(text) as PhantomRow[];
            }
            // NDJSON: each line is a JSON object
            return text
                .split('\n')
                .filter(Boolean)
                .map((line) => JSON.parse(line) as PhantomRow);
        } catch {
            return [];
        }
    }

    async search(params: LeadSearchParams): Promise<LeadCandidate[]> {
        const rows = await this.fetchLatestOutput();
        let results = rows.map(mapPhantomRow);

        // Client-side filter when the Phantom output has already been fetched.
        if (params.title) {
            const t = params.title.toLowerCase();
            results = results.filter((r) => r.title?.toLowerCase().includes(t));
        }
        if (params.industry) {
            const i = params.industry.toLowerCase();
            results = results.filter((r) => r.industry?.toLowerCase().includes(i));
        }
        if (params.domain) {
            const d = params.domain.toLowerCase();
            results = results.filter(
                (r) => r.email?.toLowerCase().includes(d) || r.website?.toLowerCase().includes(d),
            );
        }

        return results.slice(0, params.limit ?? 25);
    }

    async enrich(email: string): Promise<LeadCandidate | null> {
        // PhantomBuster doesn't have a real-time enrichment API; search cached output.
        const rows = await this.fetchLatestOutput();
        const match = rows.find(
            (r) => (r.email ?? r.emailAddress ?? '').toLowerCase() === email.toLowerCase(),
        );
        if (!match) return null;
        return mapPhantomRow(match);
    }
}
