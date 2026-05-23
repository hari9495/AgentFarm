export interface LeadSearchParams {
    domain?: string;
    firstName?: string;
    lastName?: string;
    title?: string;
    industry?: string;
    companySize?: string;
    limit?: number;
}

export interface LeadCandidate {
    firstName: string;
    lastName: string;
    email: string;
    company: string;
    title?: string;
    industry?: string;
    companySize?: string;
    linkedinUrl?: string;
    website?: string;
    phone?: string;
}

export interface ILeadSourceProvider {
    search(params: LeadSearchParams): Promise<LeadCandidate[]>;
    enrich(email: string): Promise<LeadCandidate | null>;
}
